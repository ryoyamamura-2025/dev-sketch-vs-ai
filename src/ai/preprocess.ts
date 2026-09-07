import type { Stroke } from '../types/game'

const MODEL_SIZE = 28
const PADDING = 3
const DRAW_SIZE = MODEL_SIZE - PADDING * 2
const MODEL_LINE_WIDTH = 2.2

type QuickDrawCanvas = HTMLCanvasElement & {
  __quickDrawStrokes?: Stroke[]
}

function canvasPixelsToGrayscale(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas context is unavailable.')

  const rgba = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data
  const values = new Float32Array(MODEL_SIZE * MODEL_SIZE)
  for (let i = 0; i < values.length; i += 1) {
    const offset = i * 4
    const alpha = rgba[offset + 3] / 255
    const gray = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2]
    // Composite transparent pixels onto white before converting to grayscale.
    values[i] = (gray * alpha + 255 * (1 - alpha)) / 255
  }
  return values
}

/**
 * Convert white-background/black-stroke grayscale pixels to the actual input
 * polarity expected by this TFLite artifact: black background=0, white ink=1.
 *
 * Downscaling a large high-DPI canvas to 28x28 can turn a crisp black UI line
 * into faint gray anti-aliased pixels. Quick Draw training bitmaps contain much
 * stronger ink, so normalize the strongest observed ink back to 1.0 instead of
 * feeding the model an almost-blank image.
 */
export function grayscaleToQuickDrawInput(values: Float32Array, thicken = false): Float32Array {
  const source = thicken ? new Float32Array(values.length).fill(1) : values

  if (thicken) {
    for (let y = 0; y < MODEL_SIZE; y += 1) {
      for (let x = 0; x < MODEL_SIZE; x += 1) {
        let darkest = 1
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= MODEL_SIZE || ny >= MODEL_SIZE) continue
            darkest = Math.min(darkest, values[ny * MODEL_SIZE + nx])
          }
        }
        source[y * MODEL_SIZE + x] = darkest
      }
    }
  }

  let maxInk = 0
  for (let i = 0; i < source.length; i += 1) {
    maxInk = Math.max(maxInk, 1 - source[i])
  }
  if (maxInk < 0.01) return new Float32Array(values.length)

  const output = new Float32Array(values.length)
  for (let i = 0; i < source.length; i += 1) {
    const ink = Math.max(0, 1 - source[i]) / maxInk
    // Drop tiny resampling halos while retaining anti-aliased stroke edges.
    output[i] = ink < 0.04 ? 0 : Math.min(1, ink)
  }
  return output
}

/**
 * Convert normalized game strokes directly to a crisp 28x28 Quick Draw bitmap.
 * This is the preferred path for live game inference because it bypasses the
 * display canvas, devicePixelRatio, CSS sizing and image resampling entirely.
 */
export function strokesToQuickDrawInput(strokes: Stroke[]): Float32Array {
  const points = strokes.flatMap((stroke) => stroke.points)
  if (points.length === 0) return new Float32Array(MODEL_SIZE * MODEL_SIZE)

  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  const width = Math.max(maxX - minX, 0.01)
  const height = Math.max(maxY - minY, 0.01)
  const scale = DRAW_SIZE / Math.max(width, height)
  const renderedWidth = width * scale
  const renderedHeight = height * scale
  const offsetX = (MODEL_SIZE - renderedWidth) / 2 - minX * scale
  const offsetY = (MODEL_SIZE - renderedHeight) / 2 - minY * scale

  const canvas = document.createElement('canvas')
  canvas.width = MODEL_SIZE
  canvas.height = MODEL_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas context is unavailable.')

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE)
  ctx.strokeStyle = '#000'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = MODEL_LINE_WIDTH

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue
    ctx.beginPath()
    const first = stroke.points[0]
    ctx.moveTo(first.x * scale + offsetX, first.y * scale + offsetY)
    if (stroke.points.length === 1) {
      ctx.lineTo(first.x * scale + offsetX + 0.01, first.y * scale + offsetY + 0.01)
    } else {
      for (const point of stroke.points.slice(1)) {
        ctx.lineTo(point.x * scale + offsetX, point.y * scale + offsetY)
      }
    }
    ctx.stroke()
  }

  return grayscaleToQuickDrawInput(canvasPixelsToGrayscale(canvas))
}

/**
 * Convert the visible drawing canvas to the centered 28x28 bitmap expected by
 * the Quick Draw model. Live DrawingCanvas instances expose their normalized
 * stroke geometry, so use that first. The pixel-resampling path remains as a
 * fallback for tests or any future canvas without stroke metadata.
 */
export function canvasToQuickDrawInput(source: HTMLCanvasElement): Float32Array {
  const directStrokes = (source as QuickDrawCanvas).__quickDrawStrokes
  if (directStrokes) return strokesToQuickDrawInput(directStrokes)

  const sourceCtx = source.getContext('2d', { willReadFrequently: true })
  if (!sourceCtx) throw new Error('2D canvas context is unavailable.')

  const sourcePixels = sourceCtx.getImageData(0, 0, source.width, source.height).data
  let minX = source.width
  let minY = source.height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4
      const alpha = sourcePixels[offset + 3] / 255
      const gray = 0.299 * sourcePixels[offset] + 0.587 * sourcePixels[offset + 1] + 0.114 * sourcePixels[offset + 2]
      const compositedGray = gray * alpha + 255 * (1 - alpha)
      if (compositedGray >= 245) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) return new Float32Array(MODEL_SIZE * MODEL_SIZE)

  const rawWidth = Math.max(1, maxX - minX + 1)
  const rawHeight = Math.max(1, maxY - minY + 1)
  const margin = Math.max(2, Math.round(Math.max(rawWidth, rawHeight) * 0.04))
  const sx = Math.max(0, minX - margin)
  const sy = Math.max(0, minY - margin)
  const sw = Math.min(source.width - sx, rawWidth + margin * 2)
  const sh = Math.min(source.height - sy, rawHeight + margin * 2)

  const scale = DRAW_SIZE / Math.max(sw, sh)
  const dw = sw * scale
  const dh = sh * scale
  const dx = (MODEL_SIZE - dw) / 2
  const dy = (MODEL_SIZE - dh) / 2

  const canvas = document.createElement('canvas')
  canvas.width = MODEL_SIZE
  canvas.height = MODEL_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas context is unavailable.')

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)

  return grayscaleToQuickDrawInput(canvasPixelsToGrayscale(canvas), true)
}

export const preprocessCanvas = canvasToQuickDrawInput
