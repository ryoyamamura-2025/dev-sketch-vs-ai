# Architecture

## 1. Overview

MVPは静的WebアプリとしてGitHub Pagesから配信し、複数端末同期にSupabase Realtimeを使用する。

独自アプリケーションサーバーは持たない。

```text
GitHub Pages
  └─ React/Vite app
       ├─ Supabase Realtime <-> other browsers
       └─ LiteRT.js + Quick Draw TFLite model (drawer device only)
```

## 2. Core authority model

ゲーム状態の分散確定を避けるため、最初に部屋を作ったブラウザを固定Hostとする。

Host is authoritative for:

- phase
- accepted buzz
- timer
- scores
- round result
- game result
- current drawer
- settings
- used prompt IDs

Drawer device is authoritative only for:

- private current prompt
- canvas stroke history
- AI inference
- reporting prompt/AI/answer-result events

All other clients send intents and render host-confirmed state.

## 3. State machine

Canonical phases:

```text
lobby
  -> drawer_select
  -> ready
  -> drawing
  -> answering
       -> drawing   (incorrect)
       -> result    (correct)
  -> result         (AI win / timeout)
  -> drawer_select  (game not finished)
  -> finished       (winsToFinish reached)
```

Only the Host changes authoritative phase.

## 4. Host state

Recommended TypeScript shape:

```ts
interface PlayerState {
  playerId: string
  name: string
  score: number
  connected: boolean
}

type Phase =
  | 'lobby'
  | 'drawer_select'
  | 'ready'
  | 'drawing'
  | 'answering'
  | 'result'
  | 'finished'

interface GameSettings {
  winsToFinish: 3 | 5 | 7
  roundTimeSec: number
  aiWinThreshold: number
  enabledCategoryIds: string[]
}

interface HostGameState {
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
}
```

`currentPrompt` must not exist in HostGameState.

## 5. Drawer-private state

```ts
interface DrawerPrivateState {
  currentPromptId: string | null
  strokes: Stroke[]
  aiTop3: AiPrediction[]
  modelReady: boolean
}
```

This state is never included in general host snapshots before round result.

## 6. Supabase Realtime

Use one room-specific Realtime channel per game session.

Conceptual channel name:

```text
room:<six-digit-room-code>
```

### Broadcast

Use for ephemeral game and drawing events.

### Presence

Use for currently connected participants and host-disconnect detection.

Recommended Presence payload:

```ts
interface PresenceMeta {
  playerId: string
  name: string
  isHost: boolean
}
```

Do not rely on Presence as the authoritative score/game-state store.

## 7. Event envelope

Use a common envelope for traceability and stale-event rejection.

```ts
interface EventEnvelope<TType extends string, TPayload> {
  type: TType
  roomId: string
  senderId: string
  roundId: string | null
  eventId: string
  payload: TPayload
}
```

`roundId` should be regenerated each round so late events from a previous round can be ignored.

## 8. Event catalog

### Client -> Host intents

#### `state_request`

Request latest host snapshot.

#### `buzz`

```ts
{ playerId: string }
```

Valid only while Host phase is `drawing` and sender is not the drawer.

#### `round_ready`

Sent by current drawer after prompt confirmation.

#### `ai_correct`

Sent by current drawer when private prompt win condition is satisfied locally.

Recommended payload:

```ts
{
  promptId: string
  confidence: number
  predictedId: string
}
```

Host should validate sender == currentDrawerId and phase == drawing, but cannot independently validate the private prompt before reveal in a backendless MVP. Family-only trust is accepted here.

#### `answer_result`

Drawer only.

```ts
{ result: 'correct' | 'incorrect' }
```

Valid only in `answering`.

#### `prompt_reveal`

Drawer reveals the prompt when the round ends.

```ts
{ promptId: string }
```

### Host -> All authoritative events

#### `state_snapshot`

Contains current host state, excluding private prompt.

#### `round_prepare`

```ts
{ roundId: string; drawerId: string }
```

#### `round_started`

```ts
{
  roundId: string
  startedAtHostMs: number
  remainingMs: number
}
```

#### `buzz_accepted`

```ts
{ playerId: string; remainingMs: number }
```

#### `drawing_resumed`

```ts
{
  resumedAtHostMs: number
  remainingMs: number
}
```

#### `round_end`

```ts
{
  reason: 'human_correct' | 'ai_correct' | 'timeout' | 'drawer_disconnected'
  winner: string | 'AI' | null
  scores: Record<string, number>
}
```

Prompt can be revealed immediately before/with result after drawer reports it.

#### `game_end`

```ts
{
  winner: string | 'AI'
  scores: Record<string, number>
}
```

### Drawer -> All visual events

#### `stroke_start`
#### `stroke_chunk`
#### `stroke_end`
#### `undo_stroke`
#### `canvas_clear`
#### `ai_guess`

These are visual/non-authoritative except insofar as the Host uses first valid drawing activity to start the round.

## 9. Drawing protocol

### Coordinate normalization

Use normalized coordinates so different display sizes render consistently.

```ts
interface Point {
  x: number // 0..1
  y: number // 0..1
}
```

### Stroke representation

```ts
interface Stroke {
  strokeId: string
  points: Point[]
}
```

### Sending strategy

- pointerdown -> local stroke creation + `stroke_start`
- pointermove -> append locally
- every ~50 ms -> send accumulated new points in `stroke_chunk`
- pointerup -> flush pending points + `stroke_end`

Recommended chunk:

```ts
{
  strokeId: string
  sequence: number
  points: Point[]
}
```

### Undo

Undo is stroke-based.

`undo_stroke` may carry the removed strokeId. Receivers remove it from local stroke history and redraw the canvas from remaining strokes.

### Clear

`canvas_clear` empties all local stroke history and redraws white canvas.

## 10. Timer architecture

Host time is authoritative.

Other clients may animate a local countdown for UI but never declare timeout.

### Start

First valid drawing start while Host phase is `ready`:

- Host changes phase to `drawing`.
- Host stores authoritative start time and remainingMs.
- Host emits `round_started`.

### Buzz pause

When first valid `buzz` arrives:

- calculate remainingMs using Host clock
- phase -> `answering`
- emit `buzz_accepted`

### Resume

On incorrect answer:

- phase -> `drawing`
- restart from preserved remainingMs
- emit `drawing_resumed`

### Timeout

Only Host emits timeout/round_end.

## 11. Race resolution

The Host processes relevant intents serially against current phase.

Example:

```text
phase = drawing

buzz arrives first
  -> phase = answering

ai_correct arrives afterwards
  -> reject because phase != drawing
```

The reverse order gives AI the round.

Do not attempt cross-device millisecond clock synchronization for MVP.

## 12. AI architecture

### Candidate runtime

- TFLite Quick Draw 345-class classifier
- LiteRT.js in browser

Treat the model artifact as replaceable.

Before implementation locks in preprocessing, verify actual selected artifact metadata:

- tensor shape
- dtype
- channel order
- background/foreground polarity
- input normalization
- label order

### Inference ownership

Only current drawer loads/runs inference for the active round.

### Inference scheduling

- no inference before first stroke
- approximately once per second in `drawing`
- stop in `answering`, `result`, `finished`
- resume after incorrect answer

### Prediction processing

Given 345 model outputs:

1. retain original probability/confidence per class
2. filter ranking candidates to enabledCategoryIds
3. select Top3 within enabled set
4. display original confidence values without subset renormalization
5. compare Top1 to private prompt
6. if Top1 == prompt and confidence >= threshold, emit `ai_correct`

## 13. Static hosting and configuration

The app is statically built and hosted on GitHub Pages.

Browser-safe configuration only:

- Supabase project URL
- Supabase publishable/anon-style public client key appropriate for browser usage

Never place a Supabase secret/service-role key in the repository or browser bundle.

No server-side secret is required for the agreed MVP architecture.

## 14. Room access model

MVP deliberately uses lightweight room access rather than strong authentication.

- random 6-digit code
- no accounts
- no sensitive data
- ephemeral room
- no persistence

This is not strong authorization and should not be represented as secure private-room authentication.

## 15. Late join / disconnect behavior

### Late join during active round

- receive host state snapshot
- do not reconstruct existing canvas in MVP
- observe limited state / wait for next round
- participate normally from next round

### Normal player disconnect

- mark/remove from active participant view
- continue game

### Drawer disconnect

- invalidate current round
- no score
- Host moves to result/next drawer selection

### Host disconnect

- game ends for everyone
- show host-disconnected error
- no host migration in MVP

## 16. Testing boundaries

Keep these pieces separately testable:

- pure Host state machine / reducer
- event validation by phase and sender role
- timer calculations
- stroke history reducers
- AI Top3 filtering and threshold decision
- AI message-tier selection
- category preset logic
- Supabase transport adapter
- model adapter/preprocessing

Network and AI runtime should not be required to unit-test core game-state transitions.
