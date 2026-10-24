
import axios, {
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";

export type ApiError = {
  message: string;
  status?: number;
  details?: unknown;
};

const baseURL = process.env.NEXT_PUBLIC_API_URL;

if (!baseURL) {
  throw new Error(
    "NEXT_PUBLIC_API_URL is not configured. Add it to .env.local."
  );
}

const api = axios.create({
  baseURL: baseURL.replace(/\/+$/, ""),
  timeout: 120_000,
  headers: {
    Accept: "application/json",
  },
  // Enable only if your backend uses cookie-based authentication.
  withCredentials: false,
});

// Add authentication headers here later if your app uses token auth.
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    let message = "An unexpected API error occurred.";
    let details: unknown;

    if (error.response) {
      const data = error.response.data;

      if (
        typeof data === "object" &&
        data !== null &&
        "detail" in data
      ) {
        const detail = (data as { detail: unknown }).detail;

        if (typeof detail === "string") {
          message = detail;
        } else {
          message = "The request was rejected by the server.";
          details = detail;
        }
      } else {
        message = `Request failed with status ${error.response.status}.`;
      }

      return Promise.reject({
        message,
        status: error.response.status,
        details,
      } satisfies ApiError);
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      message = "The request timed out. Please try again.";
    } else if (error.request) {
      message =
        "Could not reach the backend. Check your connection and server status.";
    } else if (error.message) {
      message = error.message;
    }

    return Promise.reject({
      message,
    } satisfies ApiError);
  }
);

export function getApiErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

export default api;
