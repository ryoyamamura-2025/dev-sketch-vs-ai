import { describe, expect, it } from 'vitest'
import {
  acceptBuzz,
  advanceAfterResult,
  createInitialHostState,
  prepareRound,
  replayGame,
  resolveAiCorrect,
  resolveAnswer,
  startGame,
  startRoundFromStroke,
  timeoutRound,
  withPresence,
} from '../src/game/stateMachine'
import type { HostGameState, PresenceMeta } from '../src/types/game'

const host: PresenceMeta = { playerId: 'host', name: 'パパ', isHost: true, onlineAt: 'now' }
const child: PresenceMeta = { playerId: 'child', name: 'はな', isHost: false, onlineAt: 'now' }

function readyState(): HostGameState {
  let state = createInitialHostState('123456', { playerId: host.playerId, name: host.name, isHost: true })
  state = withPresence(state, [host, child])
  state = startGame(state)
  state = prepareRound(state, host.playerId, 'round-1')
  return state
}

describe('host authority state machine', () => {
  it('progresses through ready, drawing, answering, result and next round', () => {
    let state = readyState()
    expect(state.phase).toBe('ready')

    state = startRoundFromStroke(state, 'host', 'round-1')
    expect(state.phase).toBe('drawing')

    state = acceptBuzz(state, 'child', 'child', 'round-1', 87_000)
    expect(state.phase).toBe('answering')
    expect(state.remainingMs).toBe(87_000)

    state = resolveAnswer(state, 'host', 'round-1', 'incorrect')
    expect(state.phase).toBe('drawing')
    expect(state.remainingMs).toBe(87_000)

    state = acceptBuzz(state, 'child', 'child', 'round-1', 80_000)
    state = resolveAnswer(state, 'host', 'round-1', 'correct')
    expect(state.phase).toBe('result')
    expect(state.players.find((p) => p.playerId === 'child')?.score).toBe(1)

    state = advanceAfterResult(state)
    expect(state.phase).toBe('drawer_select')
  })

  it('rejects invalid roles and stale round ids', () => {
    let state = readyState()
    expect(startRoundFromStroke(state, 'child', 'round-1')).toBe(state)
    state = startRoundFromStroke(state, 'host', 'round-1')
    expect(acceptBuzz(state, 'child', 'child', 'old-round', 90_000)).toBe(state)
    expect(acceptBuzz(state, 'host', 'host', 'round-1', 90_000)).toBe(state)
  })

  it('accepts only the first valid human/AI race event', () => {
    const drawing = startRoundFromStroke(readyState(), 'host', 'round-1')
    const humanFirst = acceptBuzz(drawing, 'child', 'child', 'round-1', 99_000)
    expect(humanFirst.phase).toBe('answering')
    expect(resolveAiCorrect(humanFirst, 'host', 'round-1', {
      promptId: 'cat', predictedId: 'cat', confidence: 0.8,
    })).toBe(humanFirst)

    const aiFirst = resolveAiCorrect(drawing, 'host', 'round-1', {
      promptId: 'cat', predictedId: 'cat', confidence: 0.8,
    })
    expect(aiFirst.phase).toBe('result')
    expect(aiFirst.aiScore).toBe(1)
    expect(acceptBuzz(aiFirst, 'child', 'child', 'round-1', 99_000)).toBe(aiFirst)
  })

  it('finishes at winsToFinish and can replay with zeroed scores', () => {
    let state = startRoundFromStroke(readyState(), 'host', 'round-1')
    state = { ...state, players: state.players.map((p) => p.playerId === 'child' ? { ...p, score: 2 } : p) }
    state = acceptBuzz(state, 'child', 'child', 'round-1', 60_000)
    state = resolveAnswer(state, 'host', 'round-1', 'correct')
    expect(state.gameWinner).toBe('child')
    state = advanceAfterResult(state)
    expect(state.phase).toBe('finished')
    state = replayGame(state)
    expect(state.phase).toBe('drawer_select')
    expect(state.players.every((p) => p.score === 0)).toBe(true)
    expect(state.aiScore).toBe(0)
  })

  it('times out with no winner', () => {
    const state = timeoutRound(startRoundFromStroke(readyState(), 'host', 'round-1'))
    expect(state.phase).toBe('result')
    expect(state.remainingMs).toBe(0)
    expect(state.roundWinner).toBeNull()
  })
})
