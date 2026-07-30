export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  const key = process.env.NEXT_PUBLIC_X_API_KEY;
  if (key) headers["x-api-key"] = key;
  return fetch(input, { ...init, headers });
}
