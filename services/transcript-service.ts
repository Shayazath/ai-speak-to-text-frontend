
import api from "@/lib/api";
import type { Transcript, TranscriptList } from "@/types/transcript";

export interface TranscriptUpdatePayload {
  title?: string;
  content?: string;
}

export async function getTranscripts(params?: {
  search?: string;
  skip?: number;
  limit?: number;
}): Promise<TranscriptList> {
  const response = await api.get<TranscriptList>("/api/transcripts", {
    params,
  });

  return response.data;
}

export async function updateTranscript(
  id: number,
  payload: TranscriptUpdatePayload
): Promise<Transcript> {
  const response = await api.put<Transcript>(
    `/api/transcripts/${id}`,
    payload
  );

  return response.data;
}

export async function deleteTranscript(id: number): Promise<void> {
  await api.delete(`/api/transcripts/${id}`);
}
