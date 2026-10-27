import axios from "axios";

/**
 * Central axios instance for all REFORGE API calls.
 * Base URL comes from VITE_API_BASE_URL (see .env.example) so the frontend
 * can point at a local backend during development or a deployed one later.
 */
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// Interceptor ensuring deterministic 4xx client errors are immediately rejected without retry
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 4xx responses are deterministic client/validation errors and must not be retried
    if (error.response && error.response.status >= 400 && error.response.status < 500) {
      error.isDeterministicClientError = true;
    }
    return Promise.reject(error);
  }
);

export default apiClient;
