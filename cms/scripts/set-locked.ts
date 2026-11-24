// Locks or unlocks an exhibition without the admin UI (e.g. for testing):
//   cd cms && npx tsx --env-file=.env scripts/set-locked.ts exhibition-2 true --yes
// Prints which media are locked afterwards.
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { positionalArgs, requireConfirmation } from './confirm'

async function run() {
  const [slug, value] = positionalArgs()

  if (!slug || !['true', 'false'].includes(value)) {
    console.error('Usage: tsx --env-file=.env scripts/set-locked.ts <slug> <true|false> --yes')
    process.exit(1)
  }

  requireConfirmation(`Set "${slug}" to ${value === 'true' ? 'Locked' : 'Public'}`)

  const payload = await getPayload({ config })
  const found = await payload.find({
    collection: 'exhibitions',
    where: { slug: { equals: slug } },
    limit: 1,
  })
  const doc = found.docs[0]

  if (!doc) {
    console.error('Not found: ' + slug)
    process.exit(1)
  }

  await payload.update({
    collection: 'exhibitions',
    id: doc.id,
    data: { visibility: value === 'true' ? 'locked' : 'public' },
  })

  const media = await payload.find({ collection: 'media', limit: 100, overrideAccess: true })

  console.log(`${slug}: locked = ${value}`)
  console.log(media.docs.map((m) => `  ${m.filename}: locked=${m.locked}`).join('\n'))
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
