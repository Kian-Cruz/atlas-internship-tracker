export type ApiFailure = Error & { fields?: Record<string, string[]>; status?: number };
export async function api(path: string, method = 'GET', body?: Record<string, unknown> | FormData) {
  const result = await fetch('/api/' + path, { method, cache: 'no-store', credentials: 'same-origin', headers: method === 'GET' ? {} : { 'X-Atlas-Request': '1', ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined });
  const json = await result.json().catch(() => ({ error: 'The server could not be reached. Please try again.' })) as { error?: string; fields?: Record<string, string[]> };
  if (!result.ok) { const error = new Error(json.error || 'Please try again.') as ApiFailure; error.status = result.status; error.fields = json.fields; throw error; }
  return json;
}