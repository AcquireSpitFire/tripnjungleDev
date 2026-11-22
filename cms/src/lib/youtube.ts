// YouTube ID from a URL (watch, youtu.be, embed, shorts, live) or a bare ID.
// Same logic as getYouTubeId() in the frontend (public/js/data.js).
export function getYouTubeId(value: unknown): string | null {
  if (!value) {
    return null
  }

  const text = String(value).trim()

  if (/^[\w-]{11}$/.test(text)) {
    return text
  }

  const match =
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(
      text,
    )

  return match ? match[1] : null
}
