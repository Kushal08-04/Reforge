import axios from "axios";

/**
 * Central axios instance for all REFORGE API calls.
 * Base URL comes from VITE_API_BASE_URL (see .env.example) so the frontend
 * can point at a local backend during development or a deployed one later.
 */
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  headers: { "Content-Type": "application/json" },
});

export default apiClient;
