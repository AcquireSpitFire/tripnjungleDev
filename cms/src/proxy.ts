import { NextResponse, type NextRequest } from 'next/server'

// Rate limit for the login and password endpoints, per IP address.
//
// Payload locks an ACCOUNT after 5 wrong passwords (15 minutes, see src/collections/Users.ts).
// Without a limit per address, anybody could keep the admin locked out forever (5 requests
// every 15 minutes) or try many accounts quickly. Here every address gets at most
// MAX_ATTEMPTS requests per WINDOW_MS on these endpoints, otherwise "429 Too Many Requests".
//
// The counters live in the memory of this server process. That is enough for one Railway
// instance; with several instances each one counts on its own (the limit then multiplies).

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 10
const MAX_TRACKED_ADDRESSES = 10_000

const LIMITED_PATHS = new Set([
  '/api/users/login',
  '/api/users/forgot-password',
  '/api/users/reset-password',
  '/api/users/first-register',
  '/api/users/unlock',
])

type Counter = { count: number; resetAt: number }

const counters = new Map<string, Counter>()

// Railway's proxy appends the real client address as the LAST entry of X-Forwarded-For;
// earlier entries can be set freely by the client and are not trusted
function clientAddress(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const last = forwarded?.split(',').pop()?.trim()

  return last || request.headers.get('x-real-ip') || 'local'
}

function cleanUp(now: number): void {
  for (const [address, counter] of counters) {
    if (counter.resetAt <= now) {
      counters.delete(address)
    }
  }
}

export function proxy(request: NextRequest) {
  if (request.method !== 'POST' || !LIMITED_PATHS.has(request.nextUrl.pathname.replace(/\/$/, ''))) {
    return NextResponse.next()
  }

  const now = Date.now()

  if (counters.size > MAX_TRACKED_ADDRESSES) {
    cleanUp(now)
  }

  const address = clientAddress(request)
  const counter = counters.get(address)

  if (!counter || counter.resetAt <= now) {
    counters.set(address, { count: 1, resetAt: now + WINDOW_MS })
    return NextResponse.next()
  }

  counter.count += 1

  if (counter.count > MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((counter.resetAt - now) / 1000)

    return NextResponse.json(
      { errors: [{ message: 'Too many attempts. Please wait a few minutes and try again.' }] },
      { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/users/:path*',
}
