
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "@/lib/api";
import { transcribeAudio } from "@/services/speech-service";
import type { Transcript } from "@/types/transcript";
import LiveRecorder from "@/app/components/LiveRecorder";

type Mode = "upload" | "live" | "history";

type HistoryTranscript = Transcript & {
  title?: string;
  created_at?: string;
  updated_at?: string;
  source?: string;
  transcript_type?: string;
};

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

function transcriptTitle(item: HistoryTranscript) {
  if (item.title?.trim()) return item.title;
  const content = item.content?.trim() || "";
  return content.length > 48
    ? `${content.slice(0, 48)}…`
    : content || `Transcript #${item.id}`;
}

function transcriptDate(item: HistoryTranscript) {
  const value = item.created_at || item.updated_at;
  if (!value) return "Saved transcript";

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Saved transcript"
    : date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("upload");

  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Transcript | null>(null);
  const [status, setStatus] = useState("Ready when you are");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [history, setHistory] = useState<HistoryTranscript[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [search, setSearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<
    "all" | "upload" | "live"
  >("all");
  const [selectedTranscript, setSelectedTranscript] =
    useState<HistoryTranscript | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<HistoryTranscript | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const response = await fetch(`${API_URL}/api/transcripts`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Unable to load history (${response.status}).`);
      }

      const payload = await response.json();
      const records: HistoryTranscript[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.transcripts)
            ? payload.transcripts
            : Array.isArray(payload?.data)
              ? payload.data
              : [];

      setHistory(records);
    } catch (err) {
      setHistoryError(
        err instanceof Error
          ? err.message
          : "Could not load transcript history."
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "history") void loadHistory();
  }, [mode, loadHistory]);

  function handleFileChange(selectedFile: File | null) {
    if (!selectedFile) return;

    if (!/\.(wav|mp3|m4a|ogg|flac)$/i.test(selectedFile.name)) {
      setError("Choose a WAV, MP3, M4A, OGG, or FLAC audio file.");
      return;
    }

    if (selectedFile.size > 25 * 1024 * 1024) {
      setError("The maximum supported file size is 25 MB.");
      return;
    }

    setFile(selectedFile);
    setError("");
    setText("");
    setResult(null);
    setStatus("Your audio is ready to process");
  }

  async function handleTranscribe() {
    if (!file || loading) {
      if (!file) setError("Choose an audio file first.");
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError("");
    setResult(null);
    setStatus("Transcribing your audio…");

    try {
      const transcript = await transcribeAudio(file, controller.signal);
      setResult(transcript);
      setText(transcript.content);
      setStatus("Transcription completed successfully");
      setNotice("Your transcript was saved.");
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus("Transcription cancelled");
        return;
      }

      setStatus("Something went wrong");
      setError(getApiErrorMessage(err));
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setLoading(false);
      }
    }
  }

  function clearUpload() {
    if (loading) return;

    setFile(null);
    setText("");
    setResult(null);
    setError("");
    setStatus("Ready when you are");

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard.");
      window.setTimeout(() => setNotice(""), 2500);
    } catch {
      setNotice("Clipboard unavailable. Please copy the text manually.");
    }
  }

  function downloadTranscript(item: HistoryTranscript) {
    const blob = new Blob([item.content || ""], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      `${transcriptTitle(item).replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-") || `transcript-${item.id}`}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function deleteTranscript() {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    setHistoryError("");

    try {
      const response = await fetch(
        `${API_URL}/api/transcripts/${encodeURIComponent(String(deleteTarget.id))}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error(`Delete failed (${response.status}).`);
      }

      setHistory((current) =>
        current.filter((item) => item.id !== deleteTarget.id)
      );

      if (selectedTranscript?.id === deleteTarget.id) {
        setSelectedTranscript(null);
      }

      setNotice("Transcript deleted.");
      setDeleteTarget(null);
    } catch (err) {
      setHistoryError(
        err instanceof Error ? err.message : "Could not delete transcript."
      );
    } finally {
      setDeleting(false);
    }
  }

  const filteredHistory = history.filter((item) => {
    const query = search.trim().toLowerCase();
    const searchable = [
      String(item.id),
      item.content || "",
      transcriptTitle(item),
      item.language || "",
    ].join(" ").toLowerCase();

    const matchesSearch = !query || searchable.includes(query);
    const type =
      `${item.source || ""} ${item.transcript_type || ""}`.toLowerCase();

    const matchesType =
      historyFilter === "all" ||
      (historyFilter === "upload" && type.includes("upload")) ||
      (historyFilter === "live" &&
        (type.includes("live") || type.includes("microphone")));

    return matchesSearch && matchesType;
  });

  const wordCount = text.trim()
    ? text.trim().split(/\s+/).length
    : 0;

  const tabs: { id: Mode; label: string; icon: string }[] = [
    { id: "upload", label: "Upload", icon: "↥" },
    { id: "live", label: "Live Speech", icon: "●" },
    { id: "history", label: "History", icon: "◷" },
  ];

  return (
    <main className="app-shell min-h-screen overflow-hidden text-white">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className="flex items-center gap-3 text-left"
          >
            <div className="brand-mark flex h-11 w-11 items-center justify-center rounded-2xl text-xl font-black">
              S
            </div>
            <div>
              <p className="text-base font-bold tracking-tight">
                Speak<span className="text-cyan-300">Flow</span>
              </p>
              <p className="text-xs text-slate-500">
                AI transcription studio
              </p>
            </div>
          </button>

          <span className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Workspace ready
          </span>
        </header>

        <section className="grid gap-8 pb-9 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-14">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1.5 text-xs font-medium text-cyan-200">
              <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300" />
              Your personal AI transcription studio
            </div>

            <h1 className="max-w-2xl text-4xl font-bold leading-[1.12] tracking-tight sm:text-5xl lg:text-6xl">
              Every word matters.
              <span className="gradient-text block">
                Capture every idea.
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">
              Transcribe recordings, capture live speech, and revisit saved
              conversations—all from one workspace.
            </p>
          </div>

          <div className="hero-visual relative mx-auto flex min-h-52 w-full max-w-lg items-center justify-center overflow-hidden rounded-3xl border border-white/[0.09] p-6">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="hero-mic mb-5 flex h-20 w-20 items-center justify-center rounded-3xl text-4xl">
                〽
              </div>
              <div className="flex h-12 items-center justify-center gap-1.5" aria-hidden="true">
                {Array.from({ length: 27 }, (_, i) => (
                  <span
                    key={i}
                    className="wave-bar"
                    style={{
                      height: `${12 + ((i * 17 + 11) % 31)}px`,
                      animationDelay: `${(i % 9) * -0.13}s`,
                    }}
                  />
                ))}
              </div>
              <p className="mt-4 text-sm font-medium text-slate-300">
                Your voice. Your words. Your workspace.
              </p>
            </div>
          </div>
        </section>

        {notice && (
          <div role="status" className="mb-4 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-3 text-sm text-cyan-100">
            {notice}
          </div>
        )}

        <section className="workspace-panel rounded-3xl border border-white/[0.10] p-4 shadow-2xl sm:p-7">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Your workspace
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight">
                {mode === "upload"
                  ? "Upload an audio file"
                  : mode === "live"
                    ? "Speak in real time"
                    : "Your transcript library"}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {mode === "upload"
                  ? "Turn a saved recording into editable text."
                  : mode === "live"
                    ? "Use your microphone to capture speech."
                    : "Search, read, copy, download, and manage saved transcripts."}
              </p>
            </div>

            <div className="mode-switch grid grid-cols-3 gap-1 rounded-2xl p-1" role="tablist" aria-label="Workspace mode">
              {tabs.map((tab) => {
                const active = mode === tab.id;

                // Explicit Tailwind classes ensure each tab gets its own
                // visible active color, including History.
                const activeClass =
                  tab.id === "upload"
                    ? "bg-cyan-300 text-slate-950 ring-1 ring-cyan-200/60 shadow-lg shadow-cyan-500/20"
                    : tab.id === "live"
                      ? "bg-violet-500 text-white ring-1 ring-violet-300/60 shadow-lg shadow-violet-500/20"
                      : "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-300/50 shadow-lg shadow-emerald-500/15";

                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setMode(tab.id)}
                    className={`mode-button rounded-xl px-3 py-3 text-xs font-semibold transition duration-200 sm:px-4 sm:text-sm ${
                      active
                        ? activeClass
                        : "text-slate-400 hover:bg-white/[0.07] hover:text-white"
                    }`}
                  >
                    <span className="mr-1.5" aria-hidden="true">
                      {tab.icon}
                    </span>
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-7">
            {mode === "upload" && (
              <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-5">
                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      handleFileChange(event.dataTransfer.files?.[0] ?? null);
                    }}
                    className={`upload-zone rounded-2xl border border-dashed p-6 text-center transition sm:p-8 ${
                      dragging
                        ? "border-cyan-300 bg-cyan-300/[0.08]"
                        : "border-white/[0.16] hover:border-cyan-300/50"
                    }`}
                  >
                    <div className="upload-icon mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-3xl">
                      ♫
                    </div>
                    <h3 className="mt-5 text-lg font-semibold">
                      Drop your audio here
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Or browse your device to select a recording.
                    </p>
                    <p className="mt-4 text-xs text-slate-500">
                      WAV · MP3 · M4A · OGG · FLAC · Up to 25 MB
                    </p>

                    <input
                      ref={fileInputRef}
                      id="audio-file"
                      type="file"
                      accept=".wav,.mp3,.m4a,.ogg,.flac,audio/*"
                      disabled={loading}
                      onChange={(event) =>
                        handleFileChange(event.target.files?.[0] ?? null)
                      }
                      className="sr-only"
                    />

                    <label
                      htmlFor="audio-file"
                      className="mt-6 inline-flex cursor-pointer items-center justify-center rounded-xl border border-white/[0.13] bg-white/[0.06] px-5 py-3 text-sm font-semibold transition hover:bg-white/[0.10]"
                    >
                      Browse files
                    </label>
                  </div>

                  {file ? (
                    <div className="file-card flex items-center gap-3 rounded-2xl border border-cyan-300/20 p-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-xl text-cyan-200">
                        ♫
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {file.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB · Audio
                          file
                        </p>
                      </div>
                      {!loading && (
                        <button
                          type="button"
                          onClick={clearUpload}
                          aria-label="Remove selected audio"
                          className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/[0.07] hover:text-white"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                      <p className="text-sm font-medium text-slate-300">
                        How it works
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        Select a recording, start transcription, and review
                        the recognized text on the right.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleTranscribe}
                    disabled={!file || loading}
                    className="primary-button w-full rounded-xl px-5 py-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="loading-spinner" />
                        Transcribing audio…
                      </span>
                    ) : (
                      "✦  Transcribe audio"
                    )}
                  </button>

                  {loading && (
                    <button
                      type="button"
                      onClick={() => {
                        abortControllerRef.current?.abort();
                        setStatus("Cancelling transcription…");
                      }}
                      className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300 hover:bg-white/[0.05]"
                    >
                      Cancel transcription
                    </button>
                  )}
                </div>

                <div className="transcript-panel flex min-h-[360px] flex-col rounded-2xl border border-white/[0.09] p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Transcript preview</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Review and edit recognized speech.
                      </p>
                    </div>
                    <span className="rounded-full border border-white/[0.10] px-3 py-1 text-xs text-slate-400">
                      {wordCount} words
                    </span>
                  </div>

                  <textarea
                    id="transcript"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Your transcript will appear here after processing…"
                    className="mt-5 min-h-56 flex-1 resize-y rounded-xl border border-white/[0.07] bg-[#080d1b]/80 p-4 text-sm leading-7 text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
                  />

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-400" role="status">
                      {status}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!text.trim()}
                        onClick={() => void copyText(text)}
                        className="rounded-lg border border-white/[0.10] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.06] disabled:opacity-40"
                      >
                        Copy text
                      </button>
                      <button
                        type="button"
                        onClick={clearUpload}
                        disabled={loading}
                        className="rounded-lg border border-white/[0.10] px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.06] disabled:opacity-40"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p
                      role="alert"
                      className="mt-4 rounded-xl border border-red-400/20 bg-red-400/[0.07] p-3 text-sm text-red-200"
                    >
                      {error}
                    </p>
                  )}

                  {result && (
                    <div className="success-panel mt-4 rounded-xl p-4">
                      <p className="text-sm font-semibold text-emerald-200">
                        ✓ Transcript saved successfully
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-300">
                        <div>
                          <p className="text-slate-500">Transcript ID</p>
                          <p className="mt-1 font-medium">{result.id}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">Language</p>
                          <p className="mt-1 font-medium">
                            {result.language ?? "Unknown"}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-slate-500">Duration</p>
                          <p className="mt-1 font-medium">
                            {result.duration_seconds ?? "Unknown"} seconds
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMode("history")}
                        className="mt-4 rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-300/10"
                      >
                        View transcript history →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {mode === "live" && (
              <div className="live-mode-panel rounded-2xl border border-violet-300/15 p-3 sm:p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-2 pt-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-violet-300" />
                      <h3 className="text-lg font-semibold">
                        Live transcription
                      </h3>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      Speak naturally and watch your words appear.
                    </p>
                  </div>
                  <span className="rounded-full border border-violet-300/20 bg-violet-300/[0.06] px-3 py-1.5 text-xs text-violet-200">
                    Microphone mode
                  </span>
                </div>
                <LiveRecorder />
              </div>
            )}

            {mode === "history" && (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="history-stat rounded-2xl border border-white/[0.08] p-4">
                    <p className="text-xs text-slate-400">Saved transcripts</p>
                    <p className="mt-2 text-3xl font-bold">{history.length}</p>
                    <p className="mt-1 text-xs text-cyan-200">
                      Your voice archive
                    </p>
                  </div>
                  <div className="history-stat rounded-2xl border border-white/[0.08] p-4">
                    <p className="text-xs text-slate-400">Words in library</p>
                    <p className="mt-2 text-3xl font-bold">
                      {history
                        .reduce(
                          (total, item) =>
                            total +
                            ((item.content || "").trim()
                              ? item.content.trim().split(/\s+/).length
                              : 0),
                          0
                        )
                        .toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-violet-200">
                      Across loaded records
                    </p>
                  </div>
                  <div className="history-stat rounded-2xl border border-white/[0.08] p-4">
                    <p className="text-xs text-slate-400">Matching records</p>
                    <p className="mt-2 text-3xl font-bold">
                      {filteredHistory.length}
                    </p>
                    <p className="mt-1 text-xs text-emerald-200">
                      Current view
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search transcript, language, or ID…"
                    aria-label="Search transcript history"
                    className="min-w-0 flex-1 rounded-xl border border-white/[0.10] bg-[#080d1b]/80 px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-cyan-300/50"
                  />
                  {/* <select
                    value={historyFilter}
                    onChange={(event) =>
                      setHistoryFilter(
                        event.target.value as typeof historyFilter
                      )
                    }
                    aria-label="Filter transcript type"
                    className="rounded-xl border border-white/[0.10] bg-[#10172a] px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-300/50"
                  >
                    <option value="all">All types</option>
                    <option value="upload">Audio uploads</option>
                    <option value="live">Live recordings</option>
                  </select> */}
                  <button
                    type="button"
                    onClick={() => void loadHistory()}
                    disabled={historyLoading}
                    className="rounded-xl border border-white/[0.10] px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    {historyLoading ? "Refreshing…" : "↻ Refresh"}
                  </button>
                </div>

                {historyError && (
                  <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/[0.07] p-4 text-sm text-red-200">
                    {historyError}
                  </div>
                )}

                {historyLoading && history.length === 0 ? (
                  <div className="rounded-2xl border border-white/[0.08] p-12 text-center">
                    <div className="loading-spinner mx-auto" />
                    <p className="mt-4 text-sm text-slate-400">
                      Loading your transcript library…
                    </p>
                  </div>
                ) : filteredHistory.length === 0 ? (
                  <div className="history-empty rounded-2xl border border-dashed border-white/[0.12] px-5 py-14 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-300/[0.08] text-3xl text-cyan-200">
                      ♫
                    </div>
                    <h3 className="mt-5 text-lg font-semibold">
                      {history.length === 0
                        ? "Your story starts here"
                        : "No matching transcripts"}
                    </h3>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
                      {history.length === 0
                        ? "Transcribe an audio file or start a live recording. Your saved transcripts will appear here."
                        : "Try another search term or change your filter."}
                    </p>
                    {history.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setMode("upload")}
                        className="primary-button mt-6 rounded-xl px-5 py-3 text-sm font-bold"
                      >
                        Create your first transcript
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-3">
                      {filteredHistory.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => setSelectedTranscript(item)}
                          className={`history-card w-full rounded-2xl border p-4 text-left transition ${
                            selectedTranscript?.id === item.id
                              ? "history-card-active"
                              : "border-white/[0.08] hover:border-cyan-300/30"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-300/[0.09] text-xl text-cyan-200">
                              ▤
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold">
                                  {transcriptTitle(item)}
                                </p>
                                <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
                                  {item.language || "Unknown language"}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {transcriptDate(item)} · ID {item.id}
                              </p>
                              <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">
                                {item.content || "No transcript text available."}
                              </p>
                              <p className="mt-3 text-xs text-cyan-200">
                                Open transcript →
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="transcript-panel h-fit rounded-2xl border border-white/[0.09] p-5 xl:sticky xl:top-5">
                      {selectedTranscript ? (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs uppercase tracking-[0.15em] text-cyan-300">
                                Transcript detail
                              </p>
                              <h3 className="mt-2 break-words text-lg font-bold">
                                {transcriptTitle(selectedTranscript)}
                              </h3>
                              <p className="mt-2 text-xs text-slate-500">
                                {transcriptDate(selectedTranscript)} · ID{" "}
                                {selectedTranscript.id}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedTranscript(null)}
                              aria-label="Close transcript detail"
                              className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/[0.06]"
                            >
                              ×
                            </button>
                          </div>

                          <div className="mt-5 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void copyText(selectedTranscript.content || "")
                              }
                              className="rounded-lg border border-white/[0.10] px-3 py-2 text-xs font-semibold hover:bg-white/[0.06]"
                            >
                              Copy text
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadTranscript(selectedTranscript)}
                              className="rounded-lg border border-white/[0.10] px-3 py-2 text-xs font-semibold hover:bg-white/[0.06]"
                            >
                              Download .txt
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(selectedTranscript)}
                              className="rounded-lg border border-red-300/20 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-300/[0.07]"
                            >
                              Delete
                            </button>
                          </div>

                          <div className="mt-5 rounded-xl border border-white/[0.06] bg-[#080d1b]/70 p-4">
                            <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">
                              {selectedTranscript.content || "No text available."}
                            </p>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>
                              {(selectedTranscript.content || "").trim()
                                ? selectedTranscript.content.trim().split(/\s+/).length
                                : 0}{" "}
                              words
                            </span>
                            <span>
                              Language: {selectedTranscript.language || "Unknown"}
                            </span>
                            {selectedTranscript.duration_seconds != null && (
                              <span>{selectedTranscript.duration_seconds}s</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="py-10 text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-300/[0.08] text-xl text-violet-200">
                            ↗
                          </div>
                          <h3 className="mt-4 font-semibold">
                            Choose a transcript
                          </h3>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            Select a record to read the full text and access its actions.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 py-8 sm:grid-cols-3">
          {[
            {
              number: "01",
              title: "Choose your mode",
              description: "Upload a recording or speak into your microphone.",
            },
            {
              number: "02",
              title: "Let AI transcribe",
              description: "Review recognized words and edit where needed.",
            },
            {
              number: "03",
              title: "Keep your words",
              description: "Search and revisit saved transcripts in History.",
            },
          ].map((item) => (
            <div
              key={item.number}
              className="feature-card rounded-2xl border border-white/[0.08] p-5"
            >
              <p className="text-xs font-bold tracking-[0.18em] text-cyan-300">
                STEP {item.number}
              </p>
              <h3 className="mt-3 font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {item.description}
              </p>
            </div>
          ))}
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-white/[0.08] py-6 text-xs text-slate-500 sm:flex-row">
          <p>SpeakFlow · AI Speak-to-Text</p>
          <p>Next.js · FastAPI · Whisper · TiDB Cloud</p>
          <button
            type="button"
            onClick={() => setMode("history")}
            className="transition hover:text-cyan-200"
          >
            Open transcript history →
          </button>
        </footer>
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting) {
              setDeleteTarget(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#10172a] p-6 shadow-2xl"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-400/10 text-xl text-red-200">
              !
            </div>
            <h3 id="delete-title" className="mt-4 text-lg font-bold">
              Delete this transcript?
            </h3>
            <p className="mt-2 break-words text-sm leading-6 text-slate-400">
              “{transcriptTitle(deleteTarget)}” will be removed from your
              history. This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-white/[0.10] px-4 py-2.5 text-sm hover:bg-white/[0.06] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void deleteTranscript()}
                className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete transcript"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
