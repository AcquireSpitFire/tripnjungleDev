// Shared setup of the access checks (scripts/check-access.ts): a TEMPORARY database and media
// folder, Payload, the check helpers and the test data the areas pass on to each other.
//
//   t.check(name, condition, detail?)   ✓ or ✗ (a ✗ makes the run fail)
//   t.fails(name, action)               ✓ if the action throws (access denied, validation …)
//   t.file()                            a new small PNG upload
//   t.as(user)                          options for the Local API "as this account"
//   t.f                                 test data of the earlier areas (accounts, exhibitions …)
import fs from 'fs'
import os from 'os'
import path from 'path'

// Set before Payload is loaded: the checks never touch the real database or media
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tj-access-'))

process.env.DATABASE_URI = 'file:' + path.join(tempDir, 'test.db').replace(/\\/g, '/')
process.env.MEDIA_DIR = path.join(tempDir, 'media')
process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || 'access-test-secret-only-for-the-temporary-db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDoc = any

// An e-mail the checks capture instead of sending it
export type SentMail = { to: string; subject: string; text: string; html: string; replyTo?: string }

let failures = 0

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log('  ✓ ' + name)
  } else {
    failures += 1
    console.log('  ✗ ' + name + (detail === undefined ? '' : ' → ' + JSON.stringify(detail)))
  }
}

async function fails(name: string, action: () => Promise<unknown>) {
  try {
    await action()
    check(name, false, 'no error')
  } catch {
    check(name, true)
  }
}

export async function createContext() {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../../src/payload.config')
  const sharp = (await import('sharp')).default
  const payload = await getPayload({ config })

  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c33' } }).png().toBuffer()
  let counter = 0
  const nextNumber = () => ++counter

  return {
    payload,
    sharp,
    check,
    fails,
    nextNumber,
    file: () => ({ data: png, mimetype: 'image/png', name: `test-${nextNumber()}.png`, size: png.length }),
    as: (user: AnyDoc) => ({ user, overrideAccess: false as const }),
    f: {} as Record<string, AnyDoc> & { sentMails: SentMail[] },
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>

// Summary, temporary folder removed, exit code 1 if anything failed
export function finish(error?: unknown): void {
  if (error) {
    console.error(error)
    failures += 1
  }

  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')

  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch {
    // the database file may still be open on Windows; the OS cleans up the temp folder
  }

  process.exit(failures ? 1 : 0)
}
