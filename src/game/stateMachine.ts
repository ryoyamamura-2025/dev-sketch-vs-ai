import { CHILD_PRESET_IDS } from './categories'
import { clampRoundTimeSec } from './timer'
import type {
  GameSettings,
  HostGameState,
  PlayerState,
  PresenceMeta,
  RoundEndReason,
} from '../types/game'

export const DEFAULT_SETTINGS: GameSettings = {
  winsToFinish: 3,
  roundTimeSec: 120,
  aiWinThreshold: 0.45,
  enabledCategoryIds: [...CHILD_PRESET_IDS],
}

export function createInitialHostState(roomId: string, host: Omit<PlayerState, 'score' | 'connected'>): HostGameState {
  return {
    roomId,
    phase: 'lobby',
    players: [{ ...host, score: 0, connected: true }],
    settings: { ...DEFAULT_SETTINGS, enabledCategoryIds: [...DEFAULT_SETTINGS.enabledCategoryIds] },
    currentDrawerId: null,
    currentBuzzPlayerId: null,
    remainingMs: DEFAULT_SETTINGS.roundTimeSec * 1000,
    usedCategoryIds: [],
    roundWinner: null,
    gameWinner: null,
    aiScore: 0,
    roundId: null,
    roundEndReason: null,
    revealedPromptId: null,
    roundEligiblePlayerIds: [],
  }
}

export function normalizeSettings(settings: GameSettings): GameSettings {
  const winsToFinish: 3 | 5 | 7 = [3, 5, 7].includes(settings.winsToFinish)
    ? settings.winsToFinish
    : 3
  return {
    winsToFinish,
    roundTimeSec: clampRoundTimeSec(settings.roundTimeSec),
    aiWinThreshold: Math.min(1, Math.max(0, Number.isFinite(settings.aiWinThreshold) ? settings.aiWinThreshold : 0.45)),
    enabledCategoryIds: [...new Set(settings.enabledCategoryIds)],
  }
}

export function validateSettings(settings: GameSettings): string | null {
  if (![3, 5, 7].includes(settings.winsToFinish)) return '先取数は3・5・7のどれかにしてください。'
  if (!Number.isFinite(settings.roundTimeSec) || settings.roundTimeSec < 10 || settings.roundTimeSec > 600) {
    return '制限時間は10〜600秒にしてください。'
  }
  if (!Number.isFinite(settings.aiWinThreshold) || settings.aiWinThreshold < 0 || settings.aiWinThreshold > 1) {
    return 'AIしきい値は0〜100%にしてください。'
  }
  if (settings.enabledCategoryIds.length < 2) return 'お題は2個以上選んでください。'
  return null
}

export function withPresence(state: HostGameState, presence: PresenceMeta[]): HostGameState {
  const byId = new Map(presence.map((item) => [item.playerId, item]))
  const existingIds = new Set(state.players.map((player) => player.playerId))
  const players = state.players.map((player) => ({
    ...player,
    connected: byId.has(player.playerId),
  }))

  for (const meta of presence) {
    if (existingIds.has(meta.playerId)) continue
    if (players.some((player) => player.name === meta.name)) continue
    players.push({
      playerId: meta.playerId,
      name: meta.name,
      score: 0,
      connected: true,
      isHost: meta.isHost,
    })
  }
  return { ...state, players }
}

export function updateSettings(state: HostGameState, settings: GameSettings): HostGameState {
  if (state.phase !== 'lobby') return state
  const normalized = normalizeSettings(settings)
  return {
    ...state,
    settings: normalized,
    remainingMs: normalized.roundTimeSec * 1000,
    usedCategoryIds: state.usedCategoryIds.filter((id) => normalized.enabledCategoryIds.includes(id)),
  }
}

export function startGame(state: HostGameState): HostGameState {
  if (state.phase !== 'lobby' || validateSettings(state.settings)) return state
  if (state.players.filter((player) => player.connected).length < 2) return state
  return {
    ...state,
    phase: 'drawer_select',
    currentDrawerId: null,
    currentBuzzPlayerId: null,
    roundWinner: null,
    roundEndReason: null,
    revealedPromptId: null,
  }
}

export function prepareRound(state: HostGameState, drawerId: string, roundId: string): HostGameState {
  if (state.phase !== 'drawer_select') return state
  const drawer = state.players.find((player) => player.playerId === drawerId && player.connected)
  if (!drawer) return state
  const enabled = new Set(state.settings.enabledCategoryIds)
  const usedEnabledCount = new Set(state.usedCategoryIds.filter((id) => enabled.has(id))).size
  const usedCategoryIds = usedEnabledCount >= enabled.size ? [] : state.usedCategoryIds.filter((id) => enabled.has(id))
  return {
    ...state,
    phase: 'ready',
    currentDrawerId: drawerId,
    currentBuzzPlayerId: null,
    remainingMs: state.settings.roundTimeSec * 1000,
    usedCategoryIds,
    roundWinner: null,
    roundId,
    roundEndReason: null,
    revealedPromptId: null,
    roundEligiblePlayerIds: state.players.filter((player) => player.connected).map((player) => player.playerId),
  }
}

export function acceptRoundReady(state: HostGameState, senderId: string, roundId: string | null): HostGameState {
  if (state.phase !== 'ready' || state.currentDrawerId !== senderId || state.roundId !== roundId) return state
  return state
}

export function startRoundFromStroke(state: HostGameState, senderId: string, roundId: string | null): HostGameState {
  if (state.phase !== 'ready') return state
  if (!state.roundId || state.roundId !== roundId || state.currentDrawerId !== senderId) return state
  return { ...state, phase: 'drawing' }
}

export function acceptBuzz(
  state: HostGameState,
  senderId: string,
  buzzPlayerId: string,
  roundId: string | null,
  remainingMs: number,
): HostGameState {
  if (state.phase !== 'drawing' || state.roundId !== roundId) return state
  if (senderId !== buzzPlayerId || buzzPlayerId === state.currentDrawerId) return state
  const player = state.players.find((item) => item.playerId === buzzPlayerId && item.connected)
  if (!player || !state.roundEligiblePlayerIds.includes(buzzPlayerId)) return state
  return {
    ...state,
    phase: 'answering',
    currentBuzzPlayerId: buzzPlayerId,
    remainingMs: Math.max(0, remainingMs),
  }
}

function winnerAfterScore(state: HostGameState, winner: string | 'AI', nextScore: number): string | 'AI' | null {
  return nextScore >= state.settings.winsToFinish ? winner : null
}

function resultState(
  state: HostGameState,
  reason: RoundEndReason,
  winner: string | 'AI' | null,
): HostGameState {
  return {
    ...state,
    phase: 'result',
    currentBuzzPlayerId: null,
    remainingMs: Math.max(0, state.remainingMs),
    roundWinner: winner,
    roundEndReason: reason,
  }
}

export function resolveAnswer(
  state: HostGameState,
  senderId: string,
  roundId: string | null,
  result: 'correct' | 'incorrect',
): HostGameState {
  if (state.phase !== 'answering' || state.roundId !== roundId || senderId !== state.currentDrawerId) return state
  if (!state.currentBuzzPlayerId) return state

  if (result === 'incorrect') {
    return { ...state, phase: 'drawing', currentBuzzPlayerId: null }
  }

  const winnerId = state.currentBuzzPlayerId
  const players = state.players.map((player) =>
    player.playerId === winnerId ? { ...player, score: player.score + 1 } : player,
  )
  const winnerScore = players.find((player) => player.playerId === winnerId)?.score ?? 0
  return {
    ...resultState({ ...state, players }, 'human_correct', winnerId),
    gameWinner: winnerAfterScore(state, winnerId, winnerScore),
  }
}

export function resolveAiCorrect(
  state: HostGameState,
  senderId: string,
  roundId: string | null,
  payload: { promptId: string; confidence: number; predictedId: string },
): HostGameState {
  if (state.phase !== 'drawing' || state.roundId !== roundId || senderId !== state.currentDrawerId) return state
  if (payload.promptId !== payload.predictedId) return state
  if (!state.settings.enabledCategoryIds.includes(payload.promptId)) return state
  if (payload.confidence < state.settings.aiWinThreshold) return state
  const aiScore = state.aiScore + 1
  return {
    ...resultState({ ...state, aiScore }, 'ai_correct', 'AI'),
    gameWinner: winnerAfterScore(state, 'AI', aiScore),
  }
}

export function timeoutRound(state: HostGameState): HostGameState {
  if (state.phase !== 'drawing') return state
  return resultState({ ...state, remainingMs: 0 }, 'timeout', null)
}

export function drawerDisconnected(state: HostGameState): HostGameState {
  if (!state.currentDrawerId || !['ready', 'drawing', 'answering'].includes(state.phase)) return state
  return resultState(state, 'drawer_disconnected', null)
}

export function revealPrompt(
  state: HostGameState,
  senderId: string,
  roundId: string | null,
  promptId: string,
): HostGameState {
  if (state.phase !== 'result' || state.roundId !== roundId || state.currentDrawerId !== senderId) return state
  if (!state.settings.enabledCategoryIds.includes(promptId)) return state
  const usedCategoryIds = [...new Set([...state.usedCategoryIds, promptId])]
  return { ...state, revealedPromptId: promptId, usedCategoryIds }
}

export function advanceAfterResult(state: HostGameState): HostGameState {
  if (state.phase !== 'result') return state
  if (state.gameWinner) {
    return { ...state, phase: 'finished' }
  }
  return {
    ...state,
    phase: 'drawer_select',
    currentDrawerId: null,
    currentBuzzPlayerId: null,
    remainingMs: state.settings.roundTimeSec * 1000,
    roundWinner: null,
    roundId: null,
    roundEndReason: null,
    revealedPromptId: null,
    roundEligiblePlayerIds: [],
  }
}

export function replayGame(state: HostGameState): HostGameState {
  if (state.phase !== 'finished') return state
  return {
    ...state,
    phase: 'drawer_select',
    players: state.players.map((player) => ({ ...player, score: 0 })),
    aiScore: 0,
    currentDrawerId: null,
    currentBuzzPlayerId: null,
    remainingMs: state.settings.roundTimeSec * 1000,
    usedCategoryIds: [],
    roundWinner: null,
    gameWinner: null,
    roundId: null,
    roundEndReason: null,
    revealedPromptId: null,
    roundEligiblePlayerIds: [],
  }
}

export function scoreRecord(state: HostGameState): Record<string, number> {
  return Object.fromEntries([
    ...state.players.map((player) => [player.playerId, player.score] as const),
    ['AI', state.aiScore] as const,
  ])
}
