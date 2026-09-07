import { aiMessage } from '../game/ai'
import { categoryLabelJa } from '../game/categories'
import type { AiPrediction } from '../types/game'

export function AiPanel({ top3, loading, error }: { top3: AiPrediction[]; loading?: boolean; error?: string | null }) {
  const enabledTop3 = top3.slice(0, 3)
  const rawTop3 = top3.slice(3, 6)
  const top1 = enabledTop3[0]
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
        {enabledTop3.map((prediction) => (
          <li key={`enabled-${prediction.categoryId}`}>
            <span>{categoryLabelJa(prediction.categoryId)}</span>
            <strong>{(prediction.confidence * 100).toFixed(1)}%</strong>
          </li>
        ))}
      </ol>
      {rawTop3.length > 0 ? (
        <div className="ai-diagnostic">
          <small>診断：全345カテゴリの生Top3</small>
          <ol className="prediction-list prediction-list--diagnostic">
            {rawTop3.map((prediction) => (
              <li key={`raw-${prediction.categoryId}`}>
                <span>{categoryLabelJa(prediction.categoryId)}</span>
                <strong>{(prediction.confidence * 100).toFixed(1)}%</strong>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}
