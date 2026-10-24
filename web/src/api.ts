/** All feature components use this boundary; cookies travel with same-origin requests. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Traceboard-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach Traceboard. Please check your connection and try again.', 0);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload.detail === 'string'
        ? payload.detail
        : Array.isArray(payload.detail)
          ? payload.detail.map((d: { msg: string }) => d.msg).join('. ')
          : 'The request failed. Please try again.';
    throw new ApiError(message, response.status);
  }
  return payload as T;
}
