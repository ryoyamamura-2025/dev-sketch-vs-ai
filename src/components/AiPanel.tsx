import { useEffect, useState } from 'react'
import { AiCharacter } from './AiCharacter'
import { aiCharacterState, aiMessage } from '../game/ai'
import { categoryLabelJa } from '../game/categories'
import type { AiPrediction } from '../types/game'
import './AiPanel.css'

const STATE_LABELS = {
  idle: '待機中',
  thinking: '考え中…',
  confident: '自信あり！',
  unsure: 'わからない…',
  victory: '正解！',
} as const

export function AiPanel({ top3, loading, error }: { top3: AiPrediction[]; loading?: boolean; error?: string | null }) {
  const [poseStep, setPoseStep] = useState(0)
  const top1 = top3[0]
  const visualState = aiCharacterState({
    confidence: top1?.confidence,
    loading,
    error: Boolean(error),
  })
  const message = error
    ? 'AIを準備できませんでした'
    : loading || !top1
      ? 'うーん、考え中…'
      : aiMessage(top1.confidence, categoryLabelJa(top1.categoryId))

  useEffect(() => {
    if (top3.length === 0) {
      setPoseStep(0)
      return
    }
    setPoseStep((current) => current + 1)
  }, [top3])

  return (
    <section className="panel ai-panel" aria-label="AIの予想">
      <div className="panel-title">AIの予想</div>
      <div className="ai-panel__body">
        <AiCharacter state={visualState} frameStep={poseStep} />
        <div className="ai-panel__copy">
          <div className="ai-message">{message}</div>
          {top1 && !error ? (
            <div className="ai-confidence">
              <span>確信度</span>
              <strong>{(top1.confidence * 100).toFixed(1)}%</strong>
            </div>
          ) : null}
          <div className="ai-state-label">{STATE_LABELS[visualState]}</div>
          {error ? <div className="inline-error">{error}</div> : null}
        </div>
      </div>
    </section>
  )
}
