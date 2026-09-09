import { describe, expect, it } from 'vitest'
import { grayscaleToQuickDrawInput } from '../src/ai/preprocess'
import { aiMessage, isAiWin, top3Enabled } from '../src/game/ai'
import { CHILD_PRESET_IDS, MODEL_LABELS, QUICK_DRAW_CATEGORIES, choosePrompt } from '../src/game/categories'
import { normalizeCategoryLabelsToHiragana } from '../src/game/categoryDisplay'
import { loadEnabledCategoryIds, saveEnabledCategoryIds } from '../src/game/settingsStorage'
import { appendStrokePoints, clearStrokes, startStroke, undoLastStroke } from '../src/game/strokes'
import { remainingAfterElapsed } from '../src/game/timer'

function memoryStorage(initialValue: string | null) {
  let value = initialValue
  return {
    getItem: () => value,
    setItem: (_key: string, nextValue: string) => {
      value = nextValue
    },
    read: () => value,
  }
}

describe('AI utilities', () => {
  it('ranks only enabled categories without renormalizing confidence', () => {
    const labels = ['cat', 'dog', 'bear', 'car']
    const probabilities = [0.18, 0.11, 0.068, 0.6]
    const top3 = top3Enabled(probabilities, labels, ['cat', 'dog', 'bear'])
    expect(top3).toEqual([
      { categoryId: 'cat', confidence: 0.18 },
      { categoryId: 'dog', confidence: 0.11 },
      { categoryId: 'bear', confidence: 0.068 },
    ])
  })

  it('restores faint downscaled ink to full Quick Draw contrast', () => {
    const grayscale = new Float32Array(28 * 28).fill(1)
    grayscale[14 * 28 + 14] = 0.55
    const input = grayscaleToQuickDrawInput(grayscale)
    expect(input[14 * 28 + 14]).toBeCloseTo(1)
    expect(input[0]).toBe(0)
  })

  it('maps exact message tier boundaries', () => {
    expect(aiMessage(0.029, 'ねこ')).toBe('うーん、わからない…')
    expect(aiMessage(0.03, 'ねこ')).toBe('もしかしてねこ？')
    expect(aiMessage(0.08, 'ねこ')).toBe('ねこかな？')
    expect(aiMessage(0.15, 'ねこ')).toBe('ねこな気がする！')
    expect(aiMessage(0.3, 'ねこ')).toBe('ねこだと思う！')
  })

  it('wins only when enabled top1 matches the prompt and threshold', () => {
    expect(isAiWin([{ categoryId: 'cat', confidence: 0.15 }], 'cat', 0.15)).toBe(true)
    expect(isAiWin([{ categoryId: 'dog', confidence: 0.8 }, { categoryId: 'cat', confidence: 0.7 }], 'cat', 0.15)).toBe(false)
    expect(isAiWin([{ categoryId: 'cat', confidence: 0.149 }], 'cat', 0.15)).toBe(false)
  })
})

describe('categories', () => {
  it('contains the 345 model labels and exact 72 child preset', () => {
    expect(MODEL_LABELS).toHaveLength(345)
    expect(CHILD_PRESET_IDS).toHaveLength(72)
    expect(new Set(MODEL_LABELS).size).toBe(345)
  })

  it('normalizes all 345 display labels to hiragana without changing model ids', () => {
    const idsBefore = QUICK_DRAW_CATEGORIES.map((category) => category.id)
    normalizeCategoryLabelsToHiragana()

    const invalidLabels = QUICK_DRAW_CATEGORIES
      .filter((category) => /[\u3400-\u9fff\u30a1-\u30fa\u30fd-\u30ffA-Za-z]/u.test(category.ja))
      .map((category) => `${category.id}: ${category.ja}`)

    expect(QUICK_DRAW_CATEGORIES.map((category) => category.id)).toEqual(idsBefore)
    expect(QUICK_DRAW_CATEGORIES).toHaveLength(345)
    expect(invalidLabels).toEqual([])
  })

  it('avoids used prompts until all enabled prompts are exhausted', () => {
    expect(choosePrompt(['cat', 'dog'], ['cat'], () => 0)).toBe('dog')
    expect(['cat', 'dog']).toContain(choosePrompt(['cat', 'dog'], ['cat', 'dog'], () => 0.99))
  })
})

describe('prompt category persistence', () => {
  it('restores saved categories, removes duplicates, and ignores removed model ids', () => {
    const storage = memoryStorage(JSON.stringify(['cat', 'dog', 'missing-category', 'cat']))
    expect(loadEnabledCategoryIds(storage)).toEqual(['cat', 'dog'])
  })

  it('keeps an explicitly saved empty selection', () => {
    const storage = memoryStorage(JSON.stringify([]))
    expect(loadEnabledCategoryIds(storage)).toEqual([])
  })

  it('falls back to the child preset when saved data is corrupt', () => {
    const storage = memoryStorage('{not-json')
    expect(loadEnabledCategoryIds(storage)).toEqual([...CHILD_PRESET_IDS])
  })

  it('saves only valid unique model ids', () => {
    const storage = memoryStorage(null)
    saveEnabledCategoryIds(['cat', 'missing-category', 'cat', 'dog'], storage)
    expect(storage.read()).toBe(JSON.stringify(['cat', 'dog']))
  })
})

describe('timer and strokes', () => {
  it('preserves remaining time across elapsed time arithmetic', () => {
    expect(remainingAfterElapsed(120_000, 32_500)).toBe(87_500)
    expect(remainingAfterElapsed(5_000, 9_000)).toBe(0)
  })

  it('undoes exactly one stroke and clear removes everything', () => {
    let strokes = startStroke([], 'a', { x: 0, y: 0 })
    strokes = appendStrokePoints(strokes, 'a', [{ x: 0.5, y: 0.5 }])
    strokes = startStroke(strokes, 'b', { x: 1, y: 1 })
    const undone = undoLastStroke(strokes)
    expect(undone.removedStrokeId).toBe('b')
    expect(undone.strokes.map((s) => s.strokeId)).toEqual(['a'])
    expect(clearStrokes()).toEqual([])
  })
})
