// Regenerates the image sizes (thumb/medium/large) for all existing media,
// e.g. after imageSizes in Media.ts were changed:
//   cd cms && npm run media:regenerate -- --yes
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getPayload } from 'payload'

import config from '../src/payload.config'
import { requireConfirmation } from './confirm'

const dirname = path.dirname(fileURLToPath(import.meta.url))
// Same folder as Media.ts (staticDir): MEDIA_DIR, otherwise cms/media
const mediaDir = path.resolve(dirname, '..', process.env.MEDIA_DIR || 'media')

async function run() {
  requireConfirmation(
    'Regenerate the image sizes of all media (overwrites the generated files)',
    mediaDir,
  )

  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'media', limit: 1000, overrideAccess: true })

  for (const media of docs) {
    if (!media.filename || !(media.mimeType || '').startsWith('image/')) {
      continue
    }

    const filePath = path.join(mediaDir, media.filename)

    if (!fs.existsSync(filePath)) {
      console.warn(`File missing: ${media.filename}`)
      continue
    }

    await payload.update({
      collection: 'media',
      id: media.id,
      data: {},
      filePath,
      overwriteExistingFiles: true,
      overrideAccess: true,
    })

    console.log(`regenerated: ${media.filename}`)
  }

  console.log('Done.')
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
