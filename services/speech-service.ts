
import api from "@/lib/api";
import type {
  Transcript,
  TranscriptionResponse,
} from "@/types/transcript";

export async function transcribeAudio(
  file: File,
  signal?: AbortSignal
): Promise<Transcript> {
  const allowedExtensions = [
    ".wav",
    ".mp3",
    ".m4a",
    ".ogg",
    ".flac",
  ];

  const extension = file.name
    .slice(file.name.lastIndexOf("."))
    .toLowerCase();

  if (!allowedExtensions.includes(extension)) {
    throw new Error(
      "Unsupported audio format. Use WAV, MP3, M4A, OGG or FLAC."
    );
  }

  const maxFileSize = 25 * 1024 * 1024;

  if (file.size === 0) {
    throw new Error("The selected audio file is empty.");
  }

  if (file.size > maxFileSize) {
    throw new Error("Audio file must be 25 MB or smaller.");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post<TranscriptionResponse>(
    "/api/speech/transcribe",
    formData,
    {
      signal,
      timeout: 120_000,
    }
  );

  return response.data.transcript;
}
