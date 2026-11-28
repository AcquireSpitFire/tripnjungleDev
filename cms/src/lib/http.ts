// Small helpers for our own route handlers and endpoints: JSON in and out (never cached), a size
// limit for request bodies, the same-origin check, and cleaning of form values.
import { serverUrl } from './site-identity'

const MAX_BODY_BYTES = 32 * 1024

// Every JSON answer of our own routes; errors are always { error: "…" }
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export function errorJson(
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
): Response {
  return json({ error: message, ...extra }, status)
}

// Requests that change something must come from our own pages (Origin header of the browser).
// Stops other websites from starting checkouts or sending forms in a visitor's name.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')

  if (!origin) {
    return false
  }

  if (origin === serverUrl()) {
    return true
  }

  // Same host as the request itself (e.g. the Railway address before the domain is set)
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

// The JSON object of a request body, or null (wrong type, too large, not an object)
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return null
  }

  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return null
  }

  const text = await request.text()

  if (text.length > MAX_BODY_BYTES) {
    return null
  }

  try {
    const value = JSON.parse(text)

    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

// Text from a form: control characters removed, trimmed, limited
export function cleanText(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .trim()
        .slice(0, max)
    : ''
}

export function isEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/.test(value)
  )
}
