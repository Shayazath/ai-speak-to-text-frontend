"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL =
  (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000")
    .replace(/^https:/, "wss:")
    .replace(/^http:/, "ws:") + "/ws/transcribe";

const TARGET_SAMPLE_RATE = 16000;
const MAX_BUFFERED_BYTES = 1024 * 1024;

function downsampleToPCM16(
  input: Float32Array,
  inputSampleRate: number,
): ArrayBuffer {
  const ratio = inputSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = position - left;

    const sample = input[left] * (1 - fraction) + input[right] * fraction;

    const clamped = Math.max(-1, Math.min(1, sample));

    output[i] =
      clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
  }

  return output.buffer;
}

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function mergeTranscript(
  previousWindow: string,
  currentWindow: string,
): { text: string; newText: string } {
  const previousWords = previousWindow.trim().split(/\s+/).filter(Boolean);
  const currentWords = currentWindow.trim().split(/\s+/).filter(Boolean);

  if (!currentWords.length) {
    return { text: previousWindow, newText: "" };
  }

  if (!previousWords.length) {
    return {
      text: currentWindow.trim(),
      newText: currentWindow.trim(),
    };
  }

  // Find the largest matching sequence anywhere in the previous
  // rolling window and current rolling window.
  let bestPreviousEnd = -1;
  let bestCurrentEnd = -1;
  let bestLength = 0;

  for (let i = 0; i < previousWords.length; i++) {
    for (let j = 0; j < currentWords.length; j++) {
      let length = 0;

      while (
        i + length < previousWords.length &&
        j + length < currentWords.length &&
        normalizeWord(previousWords[i + length]) ===
          normalizeWord(currentWords[j + length])
      ) {
        length++;
      }

      // Prefer longer overlaps. Require at least two words so that
      // common words like "I" or "the" do not cause false matches.
      if (length > bestLength && length >= 2) {
        bestLength = length;
        bestPreviousEnd = i + length;
        bestCurrentEnd = j + length;
      }
    }
  }

  if (bestLength >= 2) {
    const newWords = currentWords.slice(bestCurrentEnd);
    const newText = newWords.join(" ");

    // The current window may revise wording, so only append the
    // words following the matched section.
    return {
      text: newText
        ? `${previousWindow.trim()} ${newText}`.trim()
        : previousWindow.trim(),
      newText,
    };
  }

  // Do not blindly append a whole overlapping window when matching
  // fails. Preserve the current conversation and wait for the next
  // update to establish a clearer overlap.
  return {
    text: previousWindow.trim(),
    newText: "",
  };
}

type LiveRecorderProps = {
  onSave: (content: string, language: string) => Promise<void>;
};

export default function LiveRecorder({ onSave }: LiveRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [language, setLanguage] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Ready to record");
  const [saving, setSaving] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const startingRef = useRef(false);
  const previousWindowRef = useRef("");
  const fullTranscriptRef = useRef("");

  const cleanupAudio = useCallback(async () => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();

    processorRef.current = null;
    sourceRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    const context = audioContextRef.current;
    audioContextRef.current = null;

    if (context && context.state !== "closed") {
      await context.close();
    }
  }, []);

  const stopRecording = useCallback(async () => {
    await cleanupAudio();

    const socket = socketRef.current;
    socketRef.current = null;

    if (
      socket &&
      socket.readyState !== WebSocket.CLOSED &&
      socket.readyState !== WebSocket.CLOSING
    ) {
      socket.close(1000, "Recording stopped");
    }

    setRecording(false);
    setProcessing(false);
    setStatus("Recording stopped");
  }, [cleanupAudio]);

  useEffect(() => {
    return () => {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();

      streamRef.current?.getTracks().forEach((track) => track.stop());

      const context = audioContextRef.current;
      if (context && context.state !== "closed") {
        void context.close();
      }

      const socket = socketRef.current;
      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close();
      }
    };
  }, []);
  async function startRecording() {
    if (startingRef.current || recording) return;

    startingRef.current = true;
    previousWindowRef.current = "";
    fullTranscriptRef.current = "";
    setError("");
    setTranscript("");
    setLanguage("");
    setStatus("Connecting...");
    setProcessing(false);

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let socket: WebSocket | null = null;

    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
        throw new Error(
          "Microphone recording is not supported in this browser.",
        );
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      context = new AudioContext();
      audioContextRef.current = context;

      await context.resume();

      socket = new WebSocket(WS_URL);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      await new Promise<void>((resolve, reject) => {
        socket!.onopen = () => resolve();

        socket!.onerror = () => {
          reject(new Error("Could not connect to the transcription server."));
        };

        socket!.onclose = () => {
          if (!recording) {
            // The close event is also expected when recording is stopped.
          }
        };
      });

      if (socket.readyState !== WebSocket.OPEN) {
        throw new Error("The WebSocket connection was closed.");
      }

      const source = context.createMediaStreamSource(stream);
      sourceRef.current = source;

      // ScriptProcessorNode is deprecated but remains broadly supported.
      // It is used here for a straightforward local assignment prototype.
      const processor = context.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (socket!.readyState !== WebSocket.OPEN) return;

        if (socket!.bufferedAmount > MAX_BUFFERED_BYTES) {
          setError(
            "Audio processing is falling behind. Please stop and retry.",
          );
          return;
        }

        const input = event.inputBuffer.getChannelData(0);
        const pcm = downsampleToPCM16(input, context!.sampleRate);

        if (pcm.byteLength > 0) {
          socket!.send(pcm);
        }
      };

      socket.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "transcript") {
            const currentWindow = data.text?.trim() ?? "";

            if (currentWindow) {
              const merged = mergeTranscript(
                previousWindowRef.current,
                currentWindow,
              );

              previousWindowRef.current = currentWindow;
              fullTranscriptRef.current = merged.text;

              setTranscript(merged.text);
            }

            if (data.language) {
              const confidence =
                typeof data.language_probability === "number"
                  ? ` (${Math.round(data.language_probability * 100)}% confidence)`
                  : "";

              setLanguage(`${data.language}${confidence}`);
            }

            setProcessing(false);
            setStatus("Receiving transcription");
          } else if (data.type === "error") {
            setError(data.message || "Transcription failed.");
            setProcessing(false);
          }
        } catch {
          setError("Received an invalid response from the server.");
        }
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
          setRecording(false);
          setProcessing(false);
          setStatus("Connection closed");
        }
      };

      source.connect(processor);
      processor.connect(context.destination);

      setRecording(true);
      setProcessing(true);
      setStatus("Listening...");
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());

      if (context && context.state !== "closed") {
        await context.close();
      }

      if (socket && socket.readyState < WebSocket.CLOSING) {
        socket.close();
      }

      if (streamRef.current === stream) streamRef.current = null;
      if (audioContextRef.current === context) audioContextRef.current = null;
      if (socketRef.current === socket) socketRef.current = null;

      setRecording(false);
      setProcessing(false);
      setStatus("Could not start recording");
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected recording error occurred.",
      );
    } finally {
      startingRef.current = false;
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold">Live transcription</h2>

      <p className="mt-2 text-sm text-slate-400">
        Speak in English, Hindi, or a mixture of both.
      </p>

      <div className="mt-5 flex flex-wrap gap-3">
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={startingRef.current}
            className="rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
          >
            {startingRef.current ? "Connecting..." : "Start recording"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void stopRecording()}
            className="rounded-lg bg-red-500 px-5 py-3 font-semibold text-white hover:bg-red-400"
          >
            Stop recording
          </button>
        )}
      </div>

      <p className="mt-4 text-sm text-slate-400" role="status">
        {status}
      </p>

      {processing && (
        <p className="mt-2 text-sm text-cyan-300">Listening for speech...</p>
      )}

      {language && (
        <p className="mt-3 text-sm text-slate-400">
          Detected language: {language}
        </p>
      )}

      <label htmlFor="live-transcript" className="mt-4 block text-sm font-medium text-slate-300">
        Full conversation (editable)
      </label>
      <textarea
        id="live-transcript"
        value={transcript}
        onChange={(event) => {
          fullTranscriptRef.current = event.target.value;
          setTranscript(event.target.value);
        }}
        placeholder="Your full live conversation will appear here..."
        className="mt-2 min-h-48 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm leading-7 text-slate-200 outline-none focus:border-cyan-400"
      />

      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!transcript.trim() || recording || saving}
          onClick={async () => {
            setSaving(true);
            setError("");
            try {
              await onSave(transcript.trim(), language);
              setStatus("Transcript saved successfully");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save transcript.");
            } finally {
              setSaving(false);
            }
          }}
          className="rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Transcript"}
        </button>
        <button
          type="button"
          disabled={!transcript || recording || saving}
          onClick={() => {
            setTranscript("");
            fullTranscriptRef.current = "";
            previousWindowRef.current = "";
            setStatus("Transcript cleared");
          }}
          className="rounded-lg border border-slate-700 px-5 py-3 font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          Clear
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      )}
    </section>
  );
}
