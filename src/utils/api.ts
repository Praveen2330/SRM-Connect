// src/utils/api.ts
export const API_BASE_URL =
  // First prefer an explicit env var if you set it
  import.meta.env.VITE_API_BASE_URL ??
  // Otherwise auto-switch by mode
  (import.meta.env.MODE === 'development'
    ? 'http://localhost:3000'                       // local backend
    : 'https://srm-connect-backend.onrender.com');  // production backend