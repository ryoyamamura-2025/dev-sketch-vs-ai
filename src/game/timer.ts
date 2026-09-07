export function remainingAfterElapsed(baseRemainingMs: number, elapsedMs: number): number {
  return Math.max(0, baseRemainingMs - Math.max(0, elapsedMs))
}

export function clampRoundTimeSec(value: number): number {
  if (!Number.isFinite(value)) return 120
  return Math.min(600, Math.max(10, Math.round(value)))
}
