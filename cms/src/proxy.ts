import { NextResponse, type NextRequest } from 'next/server'

import { clientAddress } from './lib/client-address'

// Rate limits for the login and password endpoints and the shop forms.
//
// Login: accounts are never locked (Payload's lock is off, src/collections/Users.ts) – a lock
// would let anybody keep the admin out with a few wrong passwords. Instead the login is limited
//   - per address AND account: 5 tries per 15 minutes (one address only ever blocks itself),
//   - per address: 20 per 15 minutes (trying many accounts),
//   - per account: 50 per hour from all addresses together (slows down guessing from many
//     addresses; one address alone stays below it).
// "Forgot password" sends an e-mail: at most 3 per account and hour.
//
// The shop endpoints are limited because a checkout holds copies, and price requests and
// withdrawals send e-mails.
//
// Only requests that are let through are counted: blocked tries do not use up the limit of the
// account for others. The path is normalized before it is looked up: "/api/users/l%6Fgin",
// "/API/users/login/" or "/shop//checkout" reach the same handler and must count the same.
//
// The counters live in the memory of this server process (addresses and e-mail addresses, for
// at most an hour). That is enough for one Railway instance; with several instances each one
// counts on its own (the limits then multiply).

const MINUTE = 60 * 1000
// Hard upper bound for the memory: beyond it the oldest counters are dropped
const MAX_COUNTERS = 50_000
// Login bodies are tiny; larger ones are not read (they count as "unknown account")
const MAX_BODY_BYTES = 16 * 1024
// All requests whose account cannot be read share this one account counter
const UNKNOWN_ACCOUNT = '?'

type Limit = {
  bucket: string
  per: 'address' | 'account' | 'address+account'
  max: number
  windowMs: number
}

const passwordLimit: Limit = { bucket: 'password', per: 'address', max: 10, windowMs: 15 * MINUTE }

// Path → limits; a request is let through only if none of its limits is used up
const LIMITED_PATHS = new Map<string, Limit[]>([
  [
    '/api/users/login',
    [
      { bucket: 'login', per: 'address+account', max: 5, windowMs: 15 * MINUTE },
      { bucket: 'login', per: 'address', max: 20, windowMs: 15 * MINUTE },
      { bucket: 'login', per: 'account', max: 50, windowMs: 60 * MINUTE },
    ],
  ],
  ['/api/users/forgot-password', [passwordLimit, { bucket: 'forgot', per: 'account', max: 3, windowMs: 60 * MINUTE }]],
  ['/api/users/reset-password', [passwordLimit]],
  ['/api/users/first-register', [passwordLimit]],
  ['/api/users/unlock', [passwordLimit]],
  // Every checkout holds copies for 35 minutes: a low limit stops anybody from blocking a
  // limited edition with endless unpaid checkouts
  ['/shop/checkout', [{ bucket: 'checkout', per: 'address', max: 10, windowMs: 15 * MINUTE }]],
  // Needs a token from the Stripe cancel link; limited anyway
  ['/shop/checkout/release', [{ bucket: 'release', per: 'address', max: 20, windowMs: 15 * MINUTE }]],
  // Each request e-mails the shop
  ['/shop/request', [{ bucket: 'request', per: 'address', max: 5, windowMs: 15 * MINUTE }]],
  // Order number + e-mail must match: few tries, no guessing
  ['/shop/withdrawal', [{ bucket: 'withdrawal', per: 'address', max: 5, windowMs: 15 * MINUTE }]],
  // Cart updates (country, quantity): generous
  ['/shop/quote', [{ bucket: 'quote', per: 'address', max: 300, windowMs: 15 * MINUTE }]],
])

type Counter = { count: number; resetAt: number }

const counters = new Map<string, Counter>()

// The form of a path the router also uses: decoded, lower case, no double or trailing slashes
function normalizePath(pathname: string): string {
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

// A copy of the body, at most MAX_BODY_BYTES (the handler still gets the original)
async function readSmallBody(request: NextRequest): Promise<Uint8Array | null> {
  const reader = request.clone().body?.getReader()

  if (!reader) {
    return null
  }

  const chunks: Uint8Array[] = []
  let size = 0

  for (;;) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    size += value.length

    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }

    chunks.push(value)
  }

  const body = new Uint8Array(size)
  let offset = 0

  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }

  return body
}

// The e-mail address the request is about: JSON ({ email }) or a form – the admin sends a form
// with the field "_payload" holding JSON, like every Payload admin form
async function accountOf(request: NextRequest): Promise<string> {
  try {
    const body = await readSmallBody(request)
    const type = request.headers.get('content-type') || ''

    if (!body) {
      return UNKNOWN_ACCOUNT
    }

    let data: unknown

    if (type.toLowerCase().startsWith('application/json')) {
      data = JSON.parse(new TextDecoder().decode(body))
    } else {
      const form = await new Response(body as BodyInit, { headers: { 'content-type': type } }).formData()
      const payload = form.get('_payload')

      data = typeof payload === 'string' ? JSON.parse(payload) : { email: form.get('email') }
    }

    const email = (data as { email?: unknown } | null)?.email

    return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : UNKNOWN_ACCOUNT
  } catch {
    return UNKNOWN_ACCOUNT
  }
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

function tooMany(retryAfterMs: number) {
  const message = 'Too many attempts. Please wait a few minutes and try again.'

  // "errors" for the admin (Payload format), "error" for the shop pages
  return NextResponse.json(
    { error: message, errors: [{ message }] },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)), 'Cache-Control': 'no-store' } },
  )
}

export async function proxy(request: NextRequest) {
  const limits = request.method === 'POST' ? LIMITED_PATHS.get(normalizePath(request.nextUrl.pathname)) : undefined

  if (!limits) {
    return NextResponse.next()
  }

  const now = Date.now()
  const address = clientAddress(request.headers)
  const account = limits.some((limit) => limit.per !== 'address') ? await accountOf(request) : ''
  const keyOf = (limit: Limit) =>
    `${limit.bucket}:${limit.per}:` +
    (limit.per === 'address' ? address : limit.per === 'account' ? account : `${address} ${account}`)

  // First check every limit, then count: a blocked request does not count anywhere
  for (const limit of limits) {
    const counter = counters.get(keyOf(limit))

    if (counter && counter.resetAt > now && counter.count >= limit.max) {
      return tooMany(counter.resetAt - now)
    }
  }

  for (const limit of limits) {
    const key = keyOf(limit)
    const counter = counters.get(key)

    if (counter && counter.resetAt > now) {
      counter.count += 1
    } else {
      remember(key, { count: 1, resetAt: now + limit.windowMs }, now)
    }
  }

  return NextResponse.next()
}

export const config = {
  // Every path except the static files: an encoded variant of a limited path ("/api/us%65rs/login")
  // must not slip past a narrower matcher. Requests other than POST return immediately.
  matcher: ['/((?!_next/static|_next/image|css/|js/|favicon).*)'],
}
