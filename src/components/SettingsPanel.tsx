import { CHILD_PRESET_IDS, QUICK_DRAW_CATEGORIES } from '../game/categories'
import type { GameSettings } from '../types/game'

interface Props {
  value: GameSettings
  onChange: (settings: GameSettings) => void
  validationError: string | null
}

export function SettingsPanel({ value, onChange, validationError }: Props) {
  const setEnabled = (id: string, checked: boolean) => {
    const enabled = new Set(value.enabledCategoryIds)
    if (checked) enabled.add(id)
    else enabled.delete(id)
    onChange({ ...value, enabledCategoryIds: [...enabled] })
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
            value={value.roundTimeSec}
            onChange={(event) => onChange({ ...value, roundTimeSec: Number(event.target.value) })}
          />
        </label>
        <label>
          AI勝利しきい値（%）
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={Math.round(value.aiWinThreshold * 100)}
            onChange={(event) => onChange({ ...value, aiWinThreshold: Number(event.target.value) / 100 })}
          />
        </label>
      </div>
      <div className="category-toolbar">
        <button type="button" onClick={() => onChange({ ...value, enabledCategoryIds: [...CHILD_PRESET_IDS] })}>
          こども向け72に戻す
        </button>
        <button type="button" onClick={() => onChange({ ...value, enabledCategoryIds: QUICK_DRAW_CATEGORIES.map((c) => c.id) })}>
          すべて選択
        </button>
        <button type="button" onClick={() => onChange({ ...value, enabledCategoryIds: [] })}>
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
