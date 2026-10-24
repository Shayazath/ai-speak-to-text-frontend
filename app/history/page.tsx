
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getApiErrorMessage } from "@/lib/api";
import {
  deleteTranscript,
  getTranscripts,
  updateTranscript,
} from "@/services/transcript-service";
import type { Transcript } from "@/types/transcript";

const PAGE_SIZE = 5;

export default function HistoryPage() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [totalLoaded, setTotalLoaded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const loadTranscripts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getTranscripts({
        search: search.trim() || undefined,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      });

      setTranscripts(data);
      setTotalLoaded(data.length);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    void loadTranscripts();
  }, [loadTranscripts]);

  async function handleSave(id: number) {
    if (!editTitle.trim() || !editContent.trim()) {
      setError("Title and transcript content are required.");
      return;
    }

    setBusyId(id);
    setError("");

    try {
      await updateTranscript(id, {
        title: editTitle.trim(),
        content: editContent.trim(),
      });

      setEditingId(null);
      await loadTranscripts();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(transcript: Transcript) {
    const confirmed = window.confirm(
      `Delete "${transcript.title}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setBusyId(transcript.id);
    setError("");

    try {
      await deleteTranscript(transcript.id);

      if (transcripts.length === 1 && page > 0) {
        setPage((current) => current - 1);
      } else {
        await loadTranscripts();
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const formatDate = (value: string) =>
    new Date(value).toLocaleString();

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold tracking-widest text-cyan-400">
              AI SPEAK-TO-TEXT
            </p>
            <h1 className="text-3xl font-bold">Transcript history</h1>
            <p className="mt-2 text-slate-400">
              View and manage your saved transcriptions.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-300"
          >
            New transcription
          </Link>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-7">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Search titles and transcript text..."
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-400"
            />

            <button
              type="button"
              onClick={() => void loadTranscripts()}
              disabled={loading}
              className="rounded-xl border border-slate-700 px-5 py-3 hover:bg-slate-800 disabled:opacity-50"
            >
              Search / Refresh
            </button>
          </div>

          {error && (
            <p
              role="alert"
              className="mb-5 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300"
            >
              {error}
            </p>
          )}

          {loading ? (
            <p className="py-12 text-center text-slate-400">
              Loading transcripts...
            </p>
          ) : transcripts.length === 0 ? (
            <p className="py-12 text-center text-slate-400">
              No transcripts found.
            </p>
          ) : (
            <div className="space-y-4">
              {transcripts.map((transcript) => (
                <article
                  key={transcript.id}
                  className="rounded-xl border border-slate-800 bg-slate-950 p-5"
                >
                  {editingId === transcript.id ? (
                    <div className="space-y-4">
                      <label className="block text-sm text-slate-300">
                        Title
                        <input
                          value={editTitle}
                          onChange={(event) =>
                            setEditTitle(event.target.value)
                          }
                          maxLength={255}
                          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-cyan-400"
                        />
                      </label>

                      <label className="block text-sm text-slate-300">
                        Transcript content
                        <textarea
                          value={editContent}
                          onChange={(event) =>
                            setEditContent(event.target.value)
                          }
                          rows={5}
                          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-cyan-400"
                        />
                      </label>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            void handleSave(transcript.id)
                          }
                          disabled={busyId === transcript.id}
                          className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
                        >
                          {busyId === transcript.id
                            ? "Saving..."
                            : "Save changes"}
                        </button>

                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-lg border border-slate-700 px-4 py-2"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="break-words text-lg font-semibold">
                            {transcript.title}
                          </h2>
                          <p className="mt-1 text-xs text-slate-500">
                            ID: {transcript.id} ·{" "}
                            {formatDate(transcript.created_at)}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(transcript.id);
                              setEditTitle(transcript.title);
                              setEditContent(transcript.content);
                              setError("");
                            }}
                            className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void handleDelete(transcript)
                            }
                            disabled={busyId === transcript.id}
                            className="rounded-lg border border-red-900 px-3 py-2 text-sm text-red-300 hover:bg-red-950 disabled:opacity-50"
                          >
                            {busyId === transcript.id
                              ? "Working..."
                              : "Delete"}
                          </button>
                        </div>
                      </div>

                      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-300">
                        {transcript.content}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>
                          Language: {transcript.language ?? "Unknown"}
                        </span>
                        <span>
                          Duration:{" "}
                          {transcript.duration_seconds ?? "Unknown"} sec
                        </span>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-5">
            <p className="text-sm text-slate-400">
              Showing {totalLoaded} transcript(s)
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0 || loading}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>

              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={loading || transcripts.length < PAGE_SIZE}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
