import { NextResponse, type NextRequest } from 'next/server'

import { clientAddress } from './lib/client-address'

// Rate limits per IP address for the login and password endpoints and the shop forms.
//
// Payload locks an ACCOUNT after 5 wrong passwords (15 minutes, see src/collections/Users.ts).
// Without a limit per address, anybody could keep the admin locked out forever (5 requests
// every 15 minutes) or try many accounts quickly. The shop endpoints are limited because a
// checkout holds copies, and price requests and withdrawals send e-mails. Every address gets at
// most the given number of POST requests per WINDOW_MS and bucket, otherwise "429 Too Many Requests".
//
// The path is normalized before it is looked up: "/api/users/l%6Fgin", "/API/users/login/" or
// "/shop//checkout" reach the same handler and must count the same.
//
// The counters live in the memory of this server process. That is enough for one Railway
// instance; with several instances each one counts on its own (the limit then multiplies).

const WINDOW_MS = 15 * 60 * 1000
// Hard upper bound for the memory: beyond it the oldest counters are dropped
const MAX_COUNTERS = 50_000

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

// The form of a path the router also uses: decoded, lower case, no double or trailing slashes
export function normalizePath(pathname: string): string {
  let path = pathname

  try {
    path = decodeURIComponent(path)
  } catch {
    // Malformed escapes: keep the raw path (the router cannot decode it either)
  }

  return (
    path
      .toLowerCase()
      .replace(/\/{2,}/g, '/')
      .replace(/\/\.(?=\/|$)/g, '')
      .replace(/\/+$/, '') || '/'
  )
}

function remember(key: string, counter: Counter, now: number): void {
  counters.set(key, counter)

  if (counters.size <= MAX_COUNTERS) {
    return
  }

  for (const [oldKey, oldCounter] of counters) {
    if (oldCounter.resetAt <= now) {
      counters.delete(oldKey)
    }
  }

  // Still too many (e.g. a flood from many addresses): drop the oldest ones
  for (const oldKey of counters.keys()) {
    if (counters.size <= MAX_COUNTERS) {
      break
    }

    counters.delete(oldKey)
  }
}

export function proxy(request: NextRequest) {
  const limit = request.method === 'POST' ? LIMITED_PATHS.get(normalizePath(request.nextUrl.pathname)) : undefined

  if (!limit) {
    return NextResponse.next()
  }

  const [bucket, maxAttempts] = limit
  const now = Date.now()
  const key = bucket + ':' + clientAddress(request.headers)
  const counter = counters.get(key)

  if (!counter || counter.resetAt <= now) {
    remember(key, { count: 1, resetAt: now + WINDOW_MS }, now)
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
  // Every path except the static files: an encoded variant of a limited path ("/api/us%65rs/login")
  // must not slip past a narrower matcher. Requests other than POST return immediately.
  matcher: ['/((?!_next/static|_next/image|css/|js/|favicon).*)'],
}
