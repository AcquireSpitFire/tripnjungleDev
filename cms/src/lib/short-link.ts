// Short link of a photo: /p/<media id> (src/app/p/[id]/route.ts forwards to the photo page).
// Kept in its own file so admin components can use it without bundling the QR/PDF libraries.
export function photoShortUrl(base: string, mediaId: number | string): string {
  return `${base.replace(/\/$/, '')}/p/${encodeURIComponent(String(mediaId))}`
}

// QR codes printed with such an address would stop working after the move to the real domain
export function isTemporaryAddress(base: string): boolean {
  return /^https?:\/\/(localhost|127\.|\[::1\])|\.up\.railway\.app(\/|$)|\.railway\.app(\/|$)/i.test(base)
}
