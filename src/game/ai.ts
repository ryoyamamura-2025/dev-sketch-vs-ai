import type { AiPrediction } from '../types/game'

export function top3Enabled(
  probabilities: ArrayLike<number>,
  labels: readonly string[],
  enabledCategoryIds: string[],
): AiPrediction[] {
  const enabled = new Set(enabledCategoryIds)
  const ranked: AiPrediction[] = []
  for (let i = 0; i < labels.length && i < probabilities.length; i += 1) {
    const categoryId = labels[i]
    if (!enabled.has(categoryId)) continue
    ranked.push({ categoryId, confidence: Number(probabilities[i]) })
  }
  return ranked.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
}

export function aiMessage(confidence: number, labelJa: string): string {
  if (confidence < 0.03) return 'うーん、わからない…'
  if (confidence < 0.08) return `もしかして${labelJa}？`
  if (confidence < 0.15) return `${labelJa}かな？`
  if (confidence < 0.3) return `${labelJa}な気がする！`
  return `${labelJa}だと思う！`
}

export function isAiWin(
  top3: AiPrediction[],
  promptId: string | null,
  threshold: number,
): boolean {
  const top1 = top3[0]
  return Boolean(top1 && promptId && top1.categoryId === promptId && top1.confidence >= threshold)
}
