export type Phase =
  | 'lobby'
  | 'drawer_select'
  | 'ready'
  | 'drawing'
  | 'answering'
  | 'result'
  | 'finished'

export interface PlayerState {
  playerId: string
  name: string
  score: number
  connected: boolean
  isHost: boolean
}

export interface GameSettings {
  winsToFinish: 3 | 5 | 7
  roundTimeSec: number
  aiWinThreshold: number
  enabledCategoryIds: string[]
}

export type RoundEndReason =
  | 'human_correct'
  | 'ai_correct'
  | 'timeout'
  | 'drawer_disconnected'

export interface HostGameState {
  roomId: string
  phase: Phase
  players: PlayerState[]
  settings: GameSettings
  currentDrawerId: string | null
  currentBuzzPlayerId: string | null
  remainingMs: number
  usedCategoryIds: string[]
  roundWinner: string | 'AI' | null
  gameWinner: string | 'AI' | null
  aiScore: number
  roundId: string | null
  roundEndReason: RoundEndReason | null
  revealedPromptId: string | null
  roundEligiblePlayerIds: string[]
}

export interface PresenceMeta {
  playerId: string
  name: string
  isHost: boolean
  onlineAt: string
}

export interface Point {
  x: number
  y: number
}

export interface Stroke {
  strokeId: string
  points: Point[]
}

export interface AiPrediction {
  categoryId: string
  confidence: number
}

export interface EventEnvelope<TType extends GameEventType = GameEventType, TPayload = unknown> {
  type: TType
  roomId: string
  senderId: string
  roundId: string | null
  eventId: string
  payload: TPayload
}

export type GameEventType =
  | 'state_request'
  | 'buzz'
  | 'round_ready'
  | 'ai_correct'
  | 'answer_result'
  | 'prompt_reveal'
  | 'state_snapshot'
  | 'round_prepare'
  | 'round_started'
  | 'buzz_accepted'
  | 'drawing_resumed'
  | 'round_end'
  | 'game_end'
  | 'stroke_start'
  | 'stroke_chunk'
  | 'stroke_end'
  | 'undo_stroke'
  | 'canvas_clear'
  | 'ai_guess'

export interface GameEventPayloads {
  state_request: Record<string, never>
  buzz: { playerId: string }
  round_ready: Record<string, never>
  ai_correct: { promptId: string; confidence: number; predictedId: string }
  answer_result: { result: 'correct' | 'incorrect' }
  prompt_reveal: { promptId: string }
  state_snapshot: { state: HostGameState }
  round_prepare: { roundId: string; drawerId: string }
  round_started: { roundId: string; startedAtHostMs: number; remainingMs: number }
  buzz_accepted: { playerId: string; remainingMs: number }
  drawing_resumed: { resumedAtHostMs: number; remainingMs: number }
  round_end: {
    reason: RoundEndReason
    winner: string | 'AI' | null
    scores: Record<string, number>
  }
  game_end: { winner: string | 'AI'; scores: Record<string, number> }
  stroke_start: { strokeId: string; point: Point }
  stroke_chunk: { strokeId: string; sequence: number; points: Point[] }
  stroke_end: { strokeId: string; sequence: number; points: Point[] }
  undo_stroke: { strokeId: string }
  canvas_clear: Record<string, never>
  ai_guess: { top3: AiPrediction[] }
}

export type TypedEnvelope<K extends GameEventType> = EventEnvelope<K, GameEventPayloads[K]>

export interface Identity {
  playerId: string
  name: string
  roomId: string
  isHost: boolean
}
