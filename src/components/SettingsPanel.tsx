import { useEffect, useRef, useState } from 'react'
import { CHILD_PRESET_IDS, QUICK_DRAW_CATEGORIES } from '../game/categories'
import { loadEnabledCategoryIds, saveEnabledCategoryIds } from '../game/settingsStorage'
import type { GameSettings } from '../types/game'

interface Props {
  value: GameSettings
  onChange: (settings: GameSettings) => void
  validationError: string | null
}

function sameCategoryIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function SettingsPanel({ value, onChange, validationError }: Props) {
  const [roundTimeInput, setRoundTimeInput] = useState(() => String(value.roundTimeSec))
  const [aiThresholdInput, setAiThresholdInput] = useState(() => String(Math.round(value.aiWinThreshold * 100)))
  const restoredCategories = useRef(false)

  useEffect(() => {
    setRoundTimeInput(String(value.roundTimeSec))
  }, [value.roundTimeSec])

  useEffect(() => {
    setAiThresholdInput(String(Math.round(value.aiWinThreshold * 100)))
  }, [value.aiWinThreshold])

  useEffect(() => {
    if (restoredCategories.current) return
    restoredCategories.current = true
    const savedCategoryIds = loadEnabledCategoryIds()
    if (sameCategoryIds(savedCategoryIds, value.enabledCategoryIds)) return
    onChange({ ...value, enabledCategoryIds: savedCategoryIds })
  }, [onChange, value])

  const updateCategories = (enabledCategoryIds: string[]) => {
    saveEnabledCategoryIds(enabledCategoryIds)
    onChange({ ...value, enabledCategoryIds })
  }

  const setEnabled = (id: string, checked: boolean) => {
    const enabled = new Set(value.enabledCategoryIds)
    if (checked) enabled.add(id)
    else enabled.delete(id)
    updateCategories([...enabled])
  }

  const updateRoundTimeInput = (raw: string) => {
    setRoundTimeInput(raw)
    if (raw.trim() === '') return
    const next = Number(raw)
    if (!Number.isFinite(next) || next < 10 || next > 600) return
    onChange({ ...value, roundTimeSec: next })
  }

  const updateAiThresholdInput = (raw: string) => {
    setAiThresholdInput(raw)
    if (raw.trim() === '') return
    const next = Number(raw)
    if (!Number.isFinite(next) || next < 0 || next > 100) return
    onChange({ ...value, aiWinThreshold: next / 100 })
  }

  return (
    <details className="panel settings-panel">
      <summary>ゲーム設定</summary>
      <div className="settings-grid">
        <label>
          先取
          <select
            value={value.winsToFinish}
            onChange={(event) => onChange({ ...value, winsToFinish: Number(event.target.value) as 3 | 5 | 7 })}
          >
            <option value={3}>3勝</option>
            <option value={5}>5勝</option>
            <option value={7}>7勝</option>
          </select>
        </label>
        <label>
          制限時間（秒）
          <input
            type="number"
            min={10}
            max={600}
            value={roundTimeInput}
            onChange={(event) => updateRoundTimeInput(event.target.value)}
            onBlur={() => setRoundTimeInput(String(value.roundTimeSec))}
          />
        </label>
        <label>
          AI勝利しきい値（%）
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={aiThresholdInput}
            onChange={(event) => updateAiThresholdInput(event.target.value)}
            onBlur={() => setAiThresholdInput(String(Math.round(value.aiWinThreshold * 100)))}
          />
        </label>
      </div>
      <div className="category-toolbar">
        <button type="button" onClick={() => updateCategories([...CHILD_PRESET_IDS])}>
          こども向け72に戻す
        </button>
        <button type="button" onClick={() => updateCategories(QUICK_DRAW_CATEGORIES.map((c) => c.id))}>
          すべて選択
        </button>
        <button type="button" onClick={() => updateCategories([])}>
          すべて解除
        </button>
      </div>
      <div className="category-count">選択中: {value.enabledCategoryIds.length} / 345</div>
      {validationError ? <div className="inline-error">{validationError}</div> : null}
      <div className="category-list">
        {QUICK_DRAW_CATEGORIES.map((category) => (
          <label key={category.id} className="category-item">
            <input
              type="checkbox"
              checked={value.enabledCategoryIds.includes(category.id)}
              onChange={(event) => setEnabled(category.id, event.target.checked)}
            />
            <span>{category.ja}</span>
            <small>{category.id}</small>
          </label>
        ))}
      </div>
    </details>
  )
}
