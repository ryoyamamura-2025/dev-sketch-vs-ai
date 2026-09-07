import type { Stroke } from '../types/game'

const MODEL_SIZE = 28
const PADDING = 3
const DRAW_SIZE = MODEL_SIZE - PADDING * 2
const MODEL_LINE_WIDTH = 2.2

function canvasPixelsToInput(canvas: HTMLCanvasElement, thicken = false): Float32Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas context is unavailable.')

  const rgba = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data
  const values = new Float32Array(MODEL_SIZE * MODEL_SIZE)
  for (let i = 0; i < values.length; i += 1) {
    const offset = i * 4
    const gray = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2]
    values[i] = gray / 255
  }

  if (!thicken) return values

  // The UI canvas is high-DPI. Even after fitting the drawing bounds, a
  // visible UI stroke can become sub-pixel thin at 28x28. A 3x3 max filter on
  // stroke darkness restores roughly the 2px stroke weight seen in Quick Draw
  // bitmap samples without changing the drawing geometry.
  const thickened = new Float32Array(values.length).fill(1)
  for (let y = 0; y < MODEL_SIZE; y += 1) {
    for (let x = 0; x < MODEL_SIZE; x += 1) {
      let maxDarkness = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= MODEL_SIZE || ny >= MODEL_SIZE) continue
          maxDarkness = Math.max(maxDarkness, 1 - values[ny * MODEL_SIZE + nx])
        }
      }
      thickened[y * MODEL_SIZE + x] = 1 - maxDarkness
    }
  }
  return thickened
}

function invertForModel(values: Float32Array): Float32Array {
  const inverted = new Float32Array(values.length)
  for (let i = 0; i < values.length; i += 1) inverted[i] = 1 - values[i]
  return inverted
}

/**
 * Convert normalized game strokes to the 28x28 bitmap format used by the
 * Quick Draw model. Drawing directly from strokes avoids making lines
 * sub-pixel thin when the high-DPI UI canvas is downscaled to 28x28.
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

  return invertForModel(canvasPixelsToInput(canvas))
}

/**
 * Convert the visible drawing canvas to Quick Draw input. Rather than shrink
 * the whole large square (which makes a centered doodle tiny), detect the ink
 * bounds, fit that region into a 22x22 box, center it, and restore model-scale
 * stroke thickness.
 *
 * Note: the distributed model card documents white=1 / black=0, but direct
 * validation against Google's canonical Quick Draw numpy bitmaps shows that
 * this TFLite artifact actually expects black background=0 / white stroke=1.
 */
export function canvasToQuickDrawInput(source: HTMLCanvasElement): Float32Array {
  const sourceCtx = source.getContext('2d', { willReadFrequently: true })
  if (!sourceCtx) throw new Error('2D canvas context is unavailable.')

  const sourcePixels = sourceCtx.getImageData(0, 0, source.width, source.height).data
  let minX = source.width
  let minY = source.height
  let maxX = -1
  let maxY = -1

  // UI ink is #111 on white. Use a generous threshold so anti-aliased edge
  // pixels participate in the bounds too.
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4
      const gray = 0.299 * sourcePixels[offset] + 0.587 * sourcePixels[offset + 1] + 0.114 * sourcePixels[offset + 2]
      if (gray >= 245) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) {
    return new Float32Array(MODEL_SIZE * MODEL_SIZE)
  }

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
  return invertForModel(canvasPixelsToInput(canvas, true))
}

export const preprocessCanvas = canvasToQuickDrawInput
