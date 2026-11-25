import { NextResponse, type NextRequest } from 'next/server'

// Rate limits per IP address for the login and password endpoints and the shop forms.
//
// Payload locks an ACCOUNT after 5 wrong passwords (15 minutes, see src/collections/Users.ts).
// Without a limit per address, anybody could keep the admin locked out forever (5 requests
// every 15 minutes) or try many accounts quickly. The shop endpoints are limited because a
// checkout holds copies, and price requests and withdrawals send e-mails. Every address gets at
// most the given number of POST requests per WINDOW_MS and bucket, otherwise "429 Too Many Requests".
//
// The counters live in the memory of this server process. That is enough for one Railway
// instance; with several instances each one counts on its own (the limit then multiplies).

const WINDOW_MS = 15 * 60 * 1000
const MAX_TRACKED_ADDRESSES = 10_000

// Path → [bucket, requests per WINDOW_MS]. Paths of one bucket share a counter.
const LIMITED_PATHS = new Map<string, [string, number]>([
  ['/api/users/login', ['login', 10]],
  ['/api/users/forgot-password', ['login', 10]],
  ['/api/users/reset-password', ['login', 10]],
  ['/api/users/first-register', ['login', 10]],
  ['/api/users/unlock', ['login', 10]],
  // Every checkout holds copies for 35 minutes: a low limit stops anybody from blocking a
  // limited edition with endless unpaid checkouts
  ['/shop/checkout', ['checkout', 10]],
  // Each request e-mails the shop
  ['/shop/request', ['request', 5]],
  // Order number + e-mail must match: few tries, no guessing
  ['/shop/withdrawal', ['withdrawal', 5]],
  // Cart updates (country, quantity): generous
  ['/shop/quote', ['quote', 300]],
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
  for (const [key, counter] of counters) {
    if (counter.resetAt <= now) {
      counters.delete(key)
    }
  }
}

export function proxy(request: NextRequest) {
  const limit =
    request.method === 'POST' ? LIMITED_PATHS.get(request.nextUrl.pathname.replace(/\/$/, '')) : undefined

  if (!limit) {
    return NextResponse.next()
  }

  const [bucket, maxAttempts] = limit
  const now = Date.now()

  if (counters.size > MAX_TRACKED_ADDRESSES) {
    cleanUp(now)
  }

  const key = bucket + ':' + clientAddress(request)
  const counter = counters.get(key)

  if (!counter || counter.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return NextResponse.next()
  }

  counter.count += 1

  if (counter.count > maxAttempts) {
    const retryAfter = Math.ceil((counter.resetAt - now) / 1000)
    const message = 'Too many attempts. Please wait a few minutes and try again.'

    // "errors" for the admin (Payload format), "error" for the shop pages
    return NextResponse.json(
      { error: message, errors: [{ message }] },
      { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/users/:path*', '/shop/:path*'],
}
