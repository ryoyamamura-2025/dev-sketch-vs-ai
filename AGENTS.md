# AGENTS.md

## Project

`dev-sketch-vs-ai` is a family-only multiplayer drawing game where human players race an on-device sketch classifier to identify what another player is drawing.

The core UX is intentionally simple: **AIより先に当てろ！**

## Source of truth

When implementing or modifying this repository, treat the files in `docs/` as the product and architecture source of truth.

Priority when instructions conflict:

1. The user's explicit current instruction
2. `docs/MVP_SPEC.md`
3. `docs/ARCHITECTURE.md`
4. `docs/IMPLEMENTATION_PLAN.md`
5. Existing code and comments

Do not infer requirements from previous ChatGPT conversations. If code and docs disagree, prefer the docs unless the user explicitly changes the specification.

## MVP constraints

Keep the first implementation deliberately small.

- Family-only use; no public matchmaking.
- Static web app hosted on GitHub Pages.
- React + TypeScript + Vite.
- Supabase Realtime for multiplayer synchronization.
- No application backend and no persistent database for MVP.
- No user accounts.
- Six-digit room code is the lightweight room access mechanism.
- The browser that creates the room is the fixed host and authoritative game-state owner.
- The player who draws may be different from the host.
- The drawing device alone knows the current prompt until the round ends.
- AI inference runs locally on the drawing device.
- Digital canvas only; no camera/paper input in MVP.
- No score/history persistence after the game ends.
- No host migration or robust reconnection recovery in MVP.

## Authority model

Do not distribute authoritative game decisions across clients.

The host client is authoritative for:

- phase transitions
- accepted buzz / answer right
- timer state
- score changes
- round winner
- game winner
- player list used by the game
- used prompt IDs

The drawing client is authoritative only for private/current-round drawing concerns:

- current prompt
- local canvas and stroke history
- local AI model inference
- reporting `ai_guess`, `ai_correct`, `answer_result`, and prompt reveal events

All other clients are views/controllers that send intents and render host-confirmed state.

## Realtime rules

Use Supabase Realtime Broadcast for ephemeral game events and Presence for connection/presence information.

- Do not persist drawing points to a database.
- Send normalized coordinates (0..1), not raw pixels.
- Batch drawing points approximately every 50 ms.
- The host resolves races by processing the first valid event it receives while the game is in the relevant phase.
- Once the host changes phase, later conflicting events are ignored.

## AI rules

The planned MVP classifier is a Quick Draw 345-class TFLite model running in the browser through LiteRT.js.

- Inference starts after the first stroke.
- Run inference approximately once per second while phase is `drawing`.
- UI displays only the enabled-category Top 1 prediction and its original model confidence value.
- The internal Top 3 ranking may remain for transport and AI-win logic; hiding Top 2/3 is a presentation change only.
- Restrict competition/ranking to currently enabled game categories, but do not renormalize displayed confidence values across that subset.
- Default AI win threshold is 15%, configurable before the game.
- AI wins a round only when enabled-category Top 1 equals the private prompt and its original confidence reaches the configured threshold.
- The AI opponent has visual states for idle, thinking, confident, unsure, and victory.
- Thinking may rotate through multiple character frames; missing character assets must fall back safely without blocking the game.

Treat the concrete third-party model artifact as a replaceable dependency. Before locking its input tensor shape, dtype, normalization, labels, or runtime APIs into production code, verify the actual artifact/metadata used by the repository.

## UX rules

A six-year-old must be able to participate as an answerer with minimal explanation.

- No typed answers during a round.
- No speech recognition.
- Answerers get a large `わかった！` button.
- Pressing `わかった！` pauses drawing, timer, and AI after host acceptance.
- The answer is spoken aloud.
- The drawer marks it `正解` or `不正解`.
- Wrong answers have no penalty in MVP and the same player may buzz again after resume.
- The drawer has only drawing, Undo, and Clear controls in MVP.
- The prompt-reading period is untimed; the 120-second default timer starts on the first stroke.

## Engineering guidelines

- Prefer simple, testable state transitions over clever abstractions.
- Define shared event and state types centrally in TypeScript.
- Keep host-authority validation in one place rather than scattered among components.
- Keep Supabase transport separate from game-state reducer/state-machine logic so the latter can be unit tested without a network.
- Keep AI preprocessing/inference behind an interface so the model can be replaced or retrained later.
- Avoid premature persistence, authentication, server functions, binary protocols, or reconnection machinery unless required by a later specification.
- Do not add camera input, public rooms, accounts, history, matchmaking, or backend services to the MVP without explicit approval.

## Definition of done for first playable PoC

The first playable version is successful when multiple family devices can:

1. join the same room,
2. choose a drawer,
3. show the prompt only on the drawer device,
4. stream drawing strokes in near real time,
5. run local AI guesses roughly once per second,
6. display the AI's current Top 1/confidence with a clear opponent-character state,
7. let a player buzz before the AI,
8. pause and resume correctly after an incorrect spoken answer,
9. award points to either a human player or AI,
10. finish a first-to-N game without divergent client results.
