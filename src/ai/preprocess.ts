import type { Stroke } from '../types/game'

const MODEL_SIZE = 28
const PADDING = 3
const DRAW_SIZE = MODEL_SIZE - PADDING * 2
const MODEL_LINE_WIDTH = 2.2

function canvasPixelsToInput(canvas: HTMLCanvasElement): Float32Array {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas context is unavailable.')

  const rgba = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data
  const values = new Float32Array(MODEL_SIZE * MODEL_SIZE)
  for (let i = 0; i < values.length; i += 1) {
    const offset = i * 4
    const gray = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2]
    values[i] = gray / 255
  }
  return values
}

/**
 * Convert normalized game strokes to the 28x28 bitmap format used by the
 * Quick Draw model.  Drawing directly from strokes avoids making lines
 * sub-pixel thin when the high-DPI UI canvas is downscaled to 28x28.
 *
 * The drawing bounds are fitted into a 22x22 box while preserving aspect
 * ratio and centered in the model input.  This mirrors the compact framing
 * of the 28x28 Quick Draw bitmap dataset much better than shrinking the
 * entire large UI canvas.
 */
export function strokesToQuickDrawInput(strokes: Stroke[]): Float32Array {
  const points = strokes.flatMap((stroke) => stroke.points)
  if (points.length === 0) return new Float32Array(MODEL_SIZE * MODEL_SIZE).fill(1)

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

  return canvasPixelsToInput(canvas)
}

/**
 * Legacy canvas conversion kept for tests/debugging. New gameplay inference
 * should prefer strokesToQuickDrawInput so DPR and UI canvas size cannot
 * affect the model input.
 */
export function canvasToQuickDrawInput(source: HTMLCanvasElement): Float32Array {
  const canvas = document.createElement('canvas')
  canvas.width = MODEL_SIZE
  canvas.height = MODEL_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas context is unavailable.')

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(source, 0, 0, MODEL_SIZE, MODEL_SIZE)
  return canvasPixelsToInput(canvas)
}

export const preprocessCanvas = canvasToQuickDrawInput
