import { describe, expect, it } from 'vitest'
import { aiMessage, isAiWin, top3Enabled } from '../src/game/ai'
import { CHILD_PRESET_IDS, MODEL_LABELS, choosePrompt } from '../src/game/categories'
import { appendStrokePoints, clearStrokes, startStroke, undoLastStroke } from '../src/game/strokes'
import { remainingAfterElapsed } from '../src/game/timer'

describe('AI utilities', () => {
  it('ranks enabled categories first without renormalizing and appends raw top3 for diagnosis', () => {
    const labels = ['cat', 'dog', 'bear', 'car']
    const probabilities = [0.18, 0.11, 0.068, 0.6]
    const top3 = top3Enabled(probabilities, labels, ['cat', 'dog', 'bear'])
    expect(top3).toEqual([
      { categoryId: 'cat', confidence: 0.18 },
      { categoryId: 'dog', confidence: 0.11 },
      { categoryId: 'bear', confidence: 0.068 },
      { categoryId: 'car', confidence: 0.6 },
      { categoryId: 'cat', confidence: 0.18 },
      { categoryId: 'dog', confidence: 0.11 },
    ])
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

  it('avoids used prompts until all enabled prompts are exhausted', () => {
    expect(choosePrompt(['cat', 'dog'], ['cat'], () => 0)).toBe('dog')
    expect(['cat', 'dog']).toContain(choosePrompt(['cat', 'dog'], ['cat', 'dog'], () => 0.99))
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
