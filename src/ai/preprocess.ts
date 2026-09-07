const MODEL_SIZE = 28

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

  const rgba = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data
  const values = new Float32Array(MODEL_SIZE * MODEL_SIZE)
  for (let i = 0; i < values.length; i += 1) {
    const offset = i * 4
    const gray = 0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2]
    values[i] = gray / 255
  }
  return values
}

// Kept as the classifier-facing name used by the game hook.
export const preprocessCanvas = canvasToQuickDrawInput
