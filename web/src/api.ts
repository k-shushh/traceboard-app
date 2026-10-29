/** All feature components use this boundary; cookies travel with same-origin requests. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  timeoutMs = 30000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let payload;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Traceboard-Request': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    payload = await response.json().catch((error) => {
      if (controller.signal.aborted) throw error;
      return {};
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError(
        'The server took too long to respond. The save may still have completed.',
        0,
      );
    }
    throw new ApiError('Cannot reach Traceboard. Please check your connection and try again.', 0);
  } finally {
    clearTimeout(timeout);
  }
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
