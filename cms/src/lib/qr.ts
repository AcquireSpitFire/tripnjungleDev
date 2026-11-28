// QR codes for photos: PNG for the clipboard, PDF labels for printing.
//
// Every QR code points to the short link /p/<media id> (src/app/p/[id]/route.ts),
// which forwards to the current photo page. Printed codes therefore keep working
// when the address of the exhibition changes later (e.g. Exhibition → Adventure).
//
// In the PDF the QR code is drawn from its module matrix as vector rectangles, so it
// stays perfectly sharp at any print size. The text uses the standard PDF font
// Helvetica (no font file needed); characters it cannot show are simplified or replaced.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import QRCode from 'qrcode'

import { SITE_NAME } from './site-identity'

export type QrLabelFormat = 'a6' | 'a5' | 'square100'

export type QrPdfSettings = {
  format: QrLabelFormat
  showTitle: boolean
  showArtist: boolean
  showExhibition: boolean
  footer: string
}

export type QrLabel = {
  url: string
  title?: string | null
  artist?: string | null
  exhibition?: string | null
}

// Page sizes in millimetres (portrait)
const FORMATS: Record<QrLabelFormat, [number, number]> = {
  a6: [105, 148],
  a5: [148, 210],
  square100: [100, 100],
}

// Error correction "M": still readable with ~15 % damage (scratches, reflections)
const ERROR_CORRECTION = 'M' as const
const QUIET_ZONE = 4 // modules of white border required by the QR standard

const mm = (value: number) => (value * 72) / 25.4

export { photoShortUrl } from './short-link'

export async function qrPng(url: string, size = 1024): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: ERROR_CORRECTION,
    margin: QUIET_ZONE,
    width: size,
    color: { dark: '#000000', light: '#ffffff' },
  })
}

// Replaces characters the font cannot encode: first without accents, otherwise "?"
function safeText(font: PDFFont, text: string): string {
  let result = ''

  for (const char of text.replace(/\s+/g, ' ').trim()) {
    const candidates = [char, char.normalize('NFKD').replace(/\p{M}/gu, ''), '?']

    for (const candidate of candidates) {
      try {
        font.widthOfTextAtSize(candidate, 10)
        result += candidate
        break
      } catch {
        // not encodable in WinAnsi, try the next candidate
      }
    }
  }

  return result
}

// Splits text into at most maxLines lines that fit the width; the last one ends with "…"
function wrap(
  font: PDFFont,
  text: string,
  size: number,
  width: number,
  maxLines: number,
): string[] {
  const words = safeText(font, text).split(' ').filter(Boolean)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const next = current ? current + ' ' + word : word

    if (font.widthOfTextAtSize(next, size) <= width) {
      current = next
      continue
    }

    if (current) {
      lines.push(current)
    }

    current = word
  }

  if (current) {
    lines.push(current)
  }

  if (lines.length > maxLines) {
    lines.length = maxLines
    lines[maxLines - 1] += ' …'
  }

  // A single word can still be too wide: shorten it
  return lines.map((line) => {
    let shortened = line

    while (shortened.length > 1 && font.widthOfTextAtSize(shortened, size) > width) {
      shortened = shortened.slice(0, -2) + '…'
    }

    return shortened
  })
}

function drawQr(page: PDFPage, url: string, x: number, y: number, size: number) {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: ERROR_CORRECTION })
  const count = modules.size
  const unit = size / (count + 2 * QUIET_ZONE)
  // Tiny overlap so no viewer shows hairline gaps between neighbouring rectangles
  const overlap = Math.min(0.05, unit * 0.05)
  const black = rgb(0, 0, 0)

  for (let row = 0; row < count; row += 1) {
    let column = 0

    while (column < count) {
      if (!modules.get(row, column)) {
        column += 1
        continue
      }

      // One rectangle per horizontal run of dark modules
      const start = column

      while (column < count && modules.get(row, column)) {
        column += 1
      }

      page.drawRectangle({
        x: x + (QUIET_ZONE + start) * unit,
        // PDF coordinates start at the bottom
        y: y + size - (QUIET_ZONE + row + 1) * unit - overlap,
        width: (column - start) * unit + overlap,
        height: unit + overlap,
        color: black,
        borderWidth: 0,
      })
    }
  }
}

export async function buildQrPdf(
  labels: QrLabel[],
  settings: QrPdfSettings,
  title: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const [widthMm, heightMm] = FORMATS[settings.format] || FORMATS.a6
  const width = mm(widthMm)
  const height = mm(heightMm)
  const margin = mm(Math.max(7, widthMm * 0.08))
  const contentWidth = width - 2 * margin
  // Font sizes grow with the label: 12 pt title / 9 pt text on A6
  const scale = widthMm / 105
  const titleSize = 12 * scale
  const textSize = 9 * scale
  const footerSize = 7.5 * scale
  const gray = rgb(0.35, 0.35, 0.35)

  pdf.setTitle(safeText(regular, title))
  pdf.setCreator(SITE_NAME)
  pdf.setProducer(SITE_NAME)

  for (const label of labels) {
    const page = pdf.addPage([width, height])
    const lines: { text: string; font: PDFFont; size: number; gray: boolean }[] = []

    if (settings.showTitle && label.title) {
      for (const text of wrap(bold, label.title, titleSize, contentWidth, 2)) {
        lines.push({ text, font: bold, size: titleSize, gray: false })
      }
    }

    if (settings.showArtist && label.artist) {
      for (const text of wrap(regular, 'by ' + label.artist, textSize, contentWidth, 1)) {
        lines.push({ text, font: regular, size: textSize, gray: false })
      }
    }

    if (settings.showExhibition && label.exhibition) {
      for (const text of wrap(regular, label.exhibition, textSize, contentWidth, 1)) {
        lines.push({ text, font: regular, size: textSize, gray: true })
      }
    }

    if (settings.footer.trim()) {
      for (const text of wrap(regular, settings.footer, footerSize, contentWidth, 1)) {
        lines.push({ text, font: regular, size: footerSize, gray: true })
      }
    }

    const lineGap = 1.35
    const textHeight = lines.reduce((sum, line) => sum + line.size * lineGap, 0)
    const gap = lines.length ? mm(4) : 0
    const qrSize = Math.max(mm(20), Math.min(contentWidth, height - 2 * margin - textHeight - gap))
    const blockHeight = qrSize + gap + textHeight
    // QR + text centred vertically as one block
    const top = height - (height - blockHeight) / 2

    drawQr(page, label.url, (width - qrSize) / 2, top - qrSize, qrSize)

    let baseline = top - qrSize - gap

    for (const line of lines) {
      baseline -= line.size * lineGap

      page.drawText(line.text, {
        x: (width - line.font.widthOfTextAtSize(line.text, line.size)) / 2,
        y: baseline + line.size * (lineGap - 1),
        size: line.size,
        font: line.font,
        color: line.gray ? gray : rgb(0, 0, 0),
      })
    }
  }

  return pdf.save()
}
