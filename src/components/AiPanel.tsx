import { aiMessage } from '../game/ai'
import { categoryLabelJa } from '../game/categories'
import type { AiPrediction } from '../types/game'

export function AiPanel({ top3, loading, error }: { top3: AiPrediction[]; loading?: boolean; error?: string | null }) {
  const top1 = top3[0]
  const message = error
    ? 'AIを準備できませんでした'
    : loading
      ? 'AIが準備中…'
      : top1
        ? aiMessage(top1.confidence, categoryLabelJa(top1.categoryId))
        : 'うーん、わからない…'

  return (
    <section className="panel ai-panel" aria-label="AIの予想">
      <div className="panel-title">🤖 AIの予想</div>
      <div className="ai-message">{message}</div>
      {error ? <div className="inline-error">{error}</div> : null}
      <ol className="prediction-list">
        {top3.map((prediction) => (
          <li key={prediction.categoryId}>
            <span>{categoryLabelJa(prediction.categoryId)}</span>
            <strong>{(prediction.confidence * 100).toFixed(1)}%</strong>
          </li>
        ))}
      </ol>
    </section>
  )
}
