# Implementation Plan

## Goal

Build the smallest playable multiplayer PoC that validates the game loop with real family devices before adding polish or persistence.

Do not optimize for production scale in the first pass.

## Milestone 0 — Project bootstrap

Create:

- React + TypeScript + Vite app
- basic lint/typecheck/test setup
- GitHub Pages deployment workflow
- environment handling for browser-safe Supabase configuration
- category metadata module
- shared game/event type definitions

Acceptance:

- app builds locally
- static bundle builds for GitHub Pages
- no secret/server key is required

## Milestone 1 — Local single-device game shell

Implement the game state machine without networking first.

Required flows:

- lobby
- drawer selection
- ready
- drawing
- answering
- result
- finished

Implement host reducer/state-machine logic as pure TypeScript where possible.

Acceptance:

- a mocked single-browser flow can progress through all phases
- invalid transitions are rejected
- score and first-to-N end conditions work

## Milestone 2 — Canvas drawing

Implement digital drawing only.

Required:

- Pointer Events
- normalized coordinate model
- fixed black stroke on white square canvas
- stroke history
- Undo by stroke
- Clear all
- redraw from stroke history

Acceptance:

- works with mouse and touch/pointer input
- Undo removes exactly one completed stroke
- Clear resets all strokes
- resizing/rendering does not alter normalized drawing geometry

## Milestone 3 — Supabase room / presence

Implement room creation and joining.

Required:

- generate random 6-digit room code
- host player identity
- join by room code + name
- random internal playerId
- same-name rejection within room
- Presence tracking
- host disconnect detection

Acceptance:

- at least 2 separate browsers can join the same room
- both see the same participant list
- host departure terminates the game session UI

## Milestone 4 — Realtime drawing sync

Implement Broadcast drawing events.

Required:

- stroke_start
- stroke_chunk
- stroke_end
- undo_stroke
- canvas_clear
- ~50ms point batching
- roundId stale-event filtering

Acceptance:

- drawing on one device appears smoothly enough on another device
- Undo and Clear remain synchronized
- no Canvas bitmap/image upload is required

## Milestone 5 — Authoritative multiplayer game state

Wire client intents through the Host authority model.

Required:

- state_request / state_snapshot
- round_prepare
- round_ready
- round_started
- buzz
- buzz_accepted
- answer_result
- drawing_resumed
- round_end
- game_end

Acceptance:

- only Host changes authoritative phase
- simultaneous buzzes result in a single accepted answerer
- clients converge on the same score/result

## Milestone 6 — Timer

Implement Host-authoritative timer.

Required:

- default 120 sec
- start on first valid stroke
- pause on accepted buzz
- resume from remaining time after incorrect answer
- Host-only timeout decision

Acceptance:

- two clients may display slight UI timing differences but always receive the same timeout/result
- pause/resume does not reset the round timer

## Milestone 7 — Prompt privacy and category selection

Implement:

- Quick Draw 345 category metadata
- Japanese display mapping
- child preset 72
- all/select none/reset preset controls
- enabled category validation
- used category tracking
- prompt selection only on drawer device
- prompt reveal only after round end

Acceptance:

- Host cannot see current prompt in normal game state or state_snapshot
- duplicate prompt avoided until enabled set is exhausted
- drawer sees exactly one prompt before drawing

## Milestone 8 — On-device AI

Integrate the selected Quick Draw 345 TFLite classifier through LiteRT.js.

Before coding preprocessing, verify the exact model artifact and metadata used by the project.

Required:

- model loading state
- Canvas -> model tensor preprocessing
- inference approximately once per second after first stroke
- enabled-category Top3 selection
- original model confidence display
- message tiers
- configurable AI win threshold (default 15%)
- ai_guess broadcast
- ai_correct intent to Host

Acceptance:

- model runs entirely in browser
- no paid/remote AI API calls
- AI Top3 changes as drawing progresses
- AI win occurs only when Top1 within enabled set matches prompt and original confidence reaches threshold

## Milestone 9 — Full family game UX

Polish only the interactions required for a real playtest.

Focus on:

- very large `わかった！` button
- clear drawer vs answerer UI
- clear STOP/answering state
- large `正解` / `不正解` drawer controls
- readable score including AI
- AI message + Top3 confidence
- result and final winner screens
- mobile-friendly touch targets

Acceptance:

A six-year-old answerer should be able to:

1. look at the drawing,
2. press `わかった！`,
3. say the answer aloud,

without needing to type or navigate additional controls.

## Milestone 10 — GitHub Pages deployment

Deploy static app to GitHub Pages.

Required:

- correct Vite base path for `/dev-sketch-vs-ai/`
- production Supabase public configuration
- page refresh/navigation behavior appropriate for static hosting

Acceptance:

- family devices can open the public GitHub Pages URL directly
- multiple devices can join one room over the internet
- no local development machine/server is required during play

## First real-world playtest checklist

Test on actual family devices before adding more features.

Observe:

- Is 120 sec comfortable for a six-year-old drawer?
- Is AI threshold 15% too strong or too weak?
- Does 1 sec inference cadence feel like a race?
- Is drawing sync smooth enough at ~50ms chunks?
- Can the child reliably hit `わかった！`?
- Does pausing for oral answer feel natural?
- Does Top3/confidence add fun or visual clutter?
- Which categories cause unfair label ambiguity?
- Does AI win often enough to feel competitive?

Record findings manually outside the app if necessary. Do not build analytics before this playtest.

## Tuning order after playtest

If AI balance is poor, adjust in this order:

1. AI win confidence threshold
2. enabled/default categories
3. message thresholds/UI only if confusing
4. inference cadence if necessary
5. model replacement/fine-tuning only after the above prove insufficient

Do not jump directly to custom training.

## Explicit non-goals for first implementation

Do not add:

- authentication
- persistent scores
- cloud database game history
- camera input
- paper drawing
- public matchmaking
- voice recognition
- host migration
- full reconnect recovery
- binary drawing protocol
- custom backend
- Edge Functions unless a new requirement truly requires them

## Suggested test structure

Unit-test at minimum:

- host phase transitions
- buzz acceptance/rejection
- AI vs human race resolution
- score/winner calculations
- timer pause/resume arithmetic
- stale roundId rejection
- category filtering
- AI Top3 subset ranking without confidence renormalization
- AI message tier mapping
- stroke reducer Undo/Clear behavior

Use integration tests/mocks for transport separately from core state logic.
