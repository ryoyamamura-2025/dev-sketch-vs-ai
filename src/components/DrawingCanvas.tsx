import { useEffect, useRef, type RefObject } from 'react'
import type { Point, Stroke } from '../types/game'
import { randomId } from '../lib/ids'

interface DrawingCanvasProps {
  strokes: Stroke[]
  editable: boolean
  paused?: boolean
  canvasRef?: RefObject<HTMLCanvasElement | null>
  onStrokeStart?: (strokeId: string, point: Point) => void
  onLocalPoints?: (strokeId: string, points: Point[]) => void
  onStrokeChunk?: (strokeId: string, sequence: number, points: Point[]) => void
  onStrokeEnd?: (strokeId: string, sequence: number, points: Point[]) => void
}

type QuickDrawCanvas = HTMLCanvasElement & {
  __quickDrawStrokes?: Stroke[]
}

function normalizedPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  }
}

function redraw(canvas: HTMLCanvasElement, strokes: Stroke[]) {
  // Keep the original normalized stroke geometry on the canvas object so the
  // classifier can render directly into 28x28 instead of resampling the large
  // high-DPI display bitmap.
  ;(canvas as QuickDrawCanvas).__quickDrawStrokes = strokes

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#111'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(3, canvas.width * 0.014)

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue
    ctx.beginPath()
    const first = stroke.points[0]
    ctx.moveTo(first.x * canvas.width, first.y * canvas.height)
    if (stroke.points.length === 1) {
      ctx.lineTo(first.x * canvas.width + 0.01, first.y * canvas.height + 0.01)
    } else {
      for (const point of stroke.points.slice(1)) {
        ctx.lineTo(point.x * canvas.width, point.y * canvas.height)
      }
    }
    ctx.stroke()
  }
}

export function DrawingCanvas({
  strokes,
  editable,
  paused = false,
  canvasRef: externalRef,
  onStrokeStart,
  onLocalPoints,
  onStrokeChunk,
  onStrokeEnd,
}: DrawingCanvasProps) {
  const internalRef = useRef<HTMLCanvasElement>(null)
  const canvasRef = externalRef ?? internalRef
  const activeStrokeId = useRef<string | null>(null)
  const pendingPoints = useRef<Point[]>([])
  const sequence = useRef(0)
  const lastFlushAt = useRef(0)
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(3, window.devicePixelRatio || 1)
      const size = Math.max(1, Math.round(Math.min(rect.width, rect.height) * dpr))
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size
        canvas.height = size
      }
      redraw(canvas, strokesRef.current)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [canvasRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) redraw(canvas, strokes)
  }, [canvasRef, strokes])

  const flushChunk = () => {
    const strokeId = activeStrokeId.current
    if (!strokeId || pendingPoints.current.length === 0) return
    sequence.current += 1
    const points = pendingPoints.current
    pendingPoints.current = []
    lastFlushAt.current = performance.now()
    onStrokeChunk?.(strokeId, sequence.current, points)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editable || paused || activeStrokeId.current) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const strokeId = randomId('stroke')
    const point = normalizedPoint(event)
    activeStrokeId.current = strokeId
    pendingPoints.current = []
    sequence.current = 0
    lastFlushAt.current = performance.now()
    onStrokeStart?.(strokeId, point)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const strokeId = activeStrokeId.current
    if (!strokeId || !editable || paused) return
    event.preventDefault()
    const point = normalizedPoint(event)
    onLocalPoints?.(strokeId, [point])
    pendingPoints.current.push(point)
    if (performance.now() - lastFlushAt.current >= 50) flushChunk()
  }

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const strokeId = activeStrokeId.current
    if (!strokeId) return
    event.preventDefault()
    if (editable && !paused) {
      const point = normalizedPoint(event)
      onLocalPoints?.(strokeId, [point])
      pendingPoints.current.push(point)
    }
    sequence.current += 1
    onStrokeEnd?.(strokeId, sequence.current, pendingPoints.current)
    pendingPoints.current = []
    activeStrokeId.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      className={`drawing-canvas ${editable && !paused ? 'drawing-canvas--editable' : ''}`}
      aria-label={editable ? 'お絵描きキャンバス' : '描画表示'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    />
  )
}
