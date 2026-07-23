const BASE_URL = import.meta.env.VITE_API_URL;

// Thin fetch wrapper: prefixes the API base URL, attaches the Bearer token when
// given, and throws an Error (with .status and .data attached) on non-2xx so
// callers can branch on the real API error message instead of a generic failure.
export async function apiFetch(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error((data && data.error) || `Request failed with status ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}
