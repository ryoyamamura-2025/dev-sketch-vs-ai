import type { Point, Stroke } from '../types/game'

export function clampPoint(point: Point): Point {
  return {
    x: Math.min(1, Math.max(0, point.x)),
    y: Math.min(1, Math.max(0, point.y)),
  }
}

export function startStroke(strokes: Stroke[], strokeId: string, point: Point): Stroke[] {
  if (strokes.some((stroke) => stroke.strokeId === strokeId)) return strokes
  return [...strokes, { strokeId, points: [clampPoint(point)] }]
}

export function appendStrokePoints(strokes: Stroke[], strokeId: string, points: Point[]): Stroke[] {
  if (points.length === 0) return strokes
  return strokes.map((stroke) =>
    stroke.strokeId === strokeId
      ? { ...stroke, points: [...stroke.points, ...points.map(clampPoint)] }
      : stroke,
  )
}

export function removeStroke(strokes: Stroke[], strokeId: string): Stroke[] {
  return strokes.filter((stroke) => stroke.strokeId !== strokeId)
}

export function undoLastStroke(strokes: Stroke[]): { strokes: Stroke[]; removedStrokeId: string | null } {
  const last = strokes.at(-1)
  if (!last) return { strokes, removedStrokeId: null }
  return { strokes: strokes.slice(0, -1), removedStrokeId: last.strokeId }
}

export function clearStrokes(): Stroke[] {
  return []
}
