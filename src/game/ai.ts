import type { AiPrediction } from '../types/game'

export function top3Enabled(
  probabilities: ArrayLike<number>,
  labels: readonly string[],
  enabledCategoryIds: string[],
): AiPrediction[] {
  const enabled = new Set(enabledCategoryIds)
  const enabledRanked: AiPrediction[] = []
  const rawRanked: AiPrediction[] = []

  for (let i = 0; i < labels.length && i < probabilities.length; i += 1) {
    const categoryId = labels[i]
    const prediction = { categoryId, confidence: Number(probabilities[i]) }
    rawRanked.push(prediction)
    if (enabled.has(categoryId)) enabledRanked.push(prediction)
  }

  const enabledTop3 = enabledRanked.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
  const rawTop3 = rawRanked.sort((a, b) => b.confidence - a.confidence).slice(0, 3)

  // Keep the enabled top3 first so game scoring semantics do not change.
  // Append the unfiltered model top3 only for temporary UI diagnosis.
  return [...enabledTop3, ...rawTop3]
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
