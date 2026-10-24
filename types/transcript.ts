

export interface Transcript {
  id: number;
  title: string;
  content: string;
  language: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export type TranscriptList = Transcript[];


export interface TranscriptionResponse {
  message: string;
  transcript: Transcript;
}

export interface TranscriptListResponse {
  items?: Transcript[];
  transcripts?: Transcript[];
  total?: number;
}
