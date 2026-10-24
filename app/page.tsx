"use client";

import { useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "@/lib/api";
import { transcribeAudio } from "@/services/speech-service";
import type { Transcript } from "@/types/transcript";
import Link from "next/link";
import LiveRecorder from "@/app/components/LiveRecorder";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Transcript | null>(null);
  const [status, setStatus] = useState("Ready to transcribe");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  function handleFileChange(selectedFile: File | null) {
    setFile(selectedFile);
    setError("");
    setResult(null);
    setStatus("Ready to transcribe");
  }

  async function handleTranscribe() {
    if (!file || loading) {
      if (!file) {
        setError("Please select an audio file first.");
      }
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError("");
    setResult(null);
    setStatus("Transcribing audio. This may take a moment...");

    try {
      const transcript = await transcribeAudio(file, controller.signal);

      setResult(transcript);
      setText(transcript.content);
      setStatus("Transcription saved successfully");
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus("Transcription cancelled");
        return;
      }

      setStatus("Transcription failed");
      setError(getApiErrorMessage(err));
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
    setStatus("Cancelling request...");
  }

  function handleClear() {
    if (loading) return;

    setFile(null);
    setText("");
    setResult(null);
    setError("");
    setStatus("Ready to transcribe");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="mb-12">
          <p className="mb-3 text-sm font-semibold tracking-widest text-cyan-400">
            AI SPEAK-TO-TEXT
          </p>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Turn your voice into text.
          </h1>

          <p className="mt-4 max-w-2xl text-slate-400">
            Transcribe audio, capture your ideas, and keep your transcripts
            organized.
          </p>
          <Link
            href="/history"
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
          >
            View transcript history
          </Link>
        </header>

        <section className="grid gap-6 md:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Transcription workspace</h2>

              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-cyan-300">
                Local AI
              </span>
            </div>

            <div className="mb-6 rounded-xl border border-dashed border-slate-700 bg-slate-950 p-6">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-400/10 text-3xl">
                  🎙️
                </div>

                <p className="font-medium">Upload an audio recording</p>

                <p className="mt-2 text-sm text-slate-400">
                  WAV, MP3, M4A, OGG or FLAC · Maximum 25 MB
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,.mp3,.m4a,.ogg,.flac,audio/*"
                disabled={loading}
                onChange={(event) =>
                  handleFileChange(event.target.files?.[0] ?? null)
                }
                className="mt-5 block w-full cursor-pointer text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-400 file:px-4 file:py-2 file:font-semibold file:text-slate-950 disabled:opacity-50"
              />

              {file && (
                <p className="mt-3 break-all text-sm text-slate-400">
                  {file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              )}

              <button
                type="button"
                onClick={handleTranscribe}
                disabled={!file || loading}
                className="mt-5 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Transcribing..." : "Transcribe Audio"}
              </button>

              {loading && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="mt-3 w-full rounded-xl border border-slate-700 px-5 py-2 text-sm hover:bg-slate-800"
                >
                  Cancel request
                </button>
              )}
            </div>

            <label
              htmlFor="transcript"
              className="mb-2 block text-sm font-medium text-slate-300"
            >
              Transcript text
            </label>

            <textarea
              id="transcript"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Your recognized speech will appear here..."
              className="min-h-48 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm leading-7 outline-none placeholder:text-slate-600 focus:border-cyan-400"
            />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-400" role="status">
                {status}
              </p>

              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
              >
                Clear
              </button>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300"
              >
                {error}
              </p>
            )}

            {result && (
              <div className="mt-5 rounded-xl border border-emerald-800 bg-emerald-950/30 p-4">
                <p className="font-medium text-emerald-300">
                  Transcript saved to MySQL
                </p>

                <div className="mt-2 space-y-1 text-sm text-slate-300">
                  <p>Transcript ID: {result.id}</p>
                  <p>Language: {result.language ?? "Unknown"}</p>
                  <p>
                    Duration: {result.duration_seconds ?? "Unknown"} seconds
                  </p>
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold">Project features</h2>

              <ul className="mt-5 space-y-4 text-sm text-slate-300">
                <li>✓ Open-source speech recognition</li>
                <li>✓ Audio upload and transcription</li>
                <li>✓ MySQL transcript storage</li>
                <li>○ Live microphone transcription</li>
                <li>○ Transcript history dashboard</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold">How it works</h2>

              <p className="mt-3 text-sm leading-6 text-slate-400">
                Your browser uploads audio through Axios. FastAPI processes the
                recording using the local Whisper model and saves the resulting
                transcript in MySQL.
              </p>
            </div>
          </aside>
        </section>
        <div className="mt-6">
          <LiveRecorder />
        </div>

        <footer className="mt-10 text-center text-xs text-slate-500">
          AI Speak-to-Text · Next.js · FastAPI · MySQL · Whisper
        </footer>
      </div>
    </main>
  );
}
