import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { QuickDrawClassifier } from '../ai/QuickDrawClassifier'
import { preprocessCanvas } from '../ai/preprocess'
import { aiMessage, isAiWin, top3Enabled } from '../game/ai'
import { categoryLabelJa, choosePrompt } from '../game/categories'
import {
  acceptBuzz,
  advanceAfterResult,
  createInitialHostState,
  drawerDisconnected,
  prepareRound,
  replayGame,
  resolveAiCorrect,
  resolveAnswer,
  revealPrompt,
  scoreRecord,
  startGame,
  startRoundFromStroke,
  timeoutRound,
  updateSettings,
  validateSettings,
  withPresence,
} from '../game/stateMachine'
import { appendStrokePoints, clearStrokes, removeStroke, startStroke, undoLastStroke } from '../game/strokes'
import { remainingAfterElapsed } from '../game/timer'
import { randomId, randomRoomCode } from '../lib/ids'
import { getSupabaseBrowserConfig, RoomTransport } from '../realtime/RoomTransport'
import type {
  AiPrediction,
  EventEnvelope,
  GameEventPayloads,
  GameEventType,
  GameSettings,
  HostGameState,
  Identity,
  Point,
  PresenceMeta,
  Stroke,
} from '../types/game'

interface TimerAnchor {
  baseRemainingMs: number
  startedAtMs: number
}

interface UseRoomGameResult {
  identity: Identity | null
  gameState: HostGameState | null
  strokes: Stroke[]
  aiTop3: AiPrediction[]
  aiText: string
  privatePromptId: string | null
  drawerReady: boolean
  displayRemainingMs: number
  connectionStatus: string
  error: string | null
  hostDisconnected: boolean
  aiLoading: boolean
  aiError: string | null
  canvasRef: RefObject<HTMLCanvasElement | null>
  hasRealtimeConfig: boolean
  createRoom: (name: string) => Promise<void>
  joinRoom: (roomId: string, name: string) => Promise<void>
  leaveRoom: () => Promise<void>
  updateHostSettings: (settings: GameSettings) => void
  beginGame: () => void
  selectDrawer: (playerId: string) => void
  markReady: () => void
  buzz: () => void
  answerResult: (result: 'correct' | 'incorrect') => void
  nextRound: () => void
  replay: () => void
  undo: () => void
  clearCanvas: () => void
  handleStrokeStart: (strokeId: string, point: Point) => void
  handleLocalPoints: (strokeId: string, points: Point[]) => void
  handleStrokeChunk: (strokeId: string, sequence: number, points: Point[]) => void
  handleStrokeEnd: (strokeId: string, sequence: number, points: Point[]) => void
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function hostSender(state: HostGameState | null, senderId: string): boolean {
  return Boolean(state?.players.some((player) => player.playerId === senderId && player.isHost))
}

export function useRoomGame(): UseRoomGameResult {
  const config = useMemo(() => getSupabaseBrowserConfig(), [])
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [gameState, setGameState] = useState<HostGameState | null>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [aiTop3, setAiTop3] = useState<AiPrediction[]>([])
  const [privatePromptId, setPrivatePromptId] = useState<string | null>(null)
  const [drawerReady, setDrawerReady] = useState(false)
  const [displayRemainingMs, setDisplayRemainingMs] = useState(120_000)
  const [connectionStatus, setConnectionStatus] = useState('OFFLINE')
  const [error, setError] = useState<string | null>(null)
  const [hostDisconnected, setHostDisconnected] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const identityRef = useRef<Identity | null>(null)
  const stateRef = useRef<HostGameState | null>(null)
  const transportRef = useRef<RoomTransport | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const promptRef = useRef<string | null>(null)
  const hostTimerRef = useRef<TimerAnchor | null>(null)
  const uiTimerRef = useRef<TimerAnchor | null>(null)
  const sequenceRef = useRef(new Map<string, number>())
  const classifierRef = useRef<QuickDrawClassifier | null>(null)
  const aiReadyRef = useRef(false)
  const aiCorrectRoundRef = useRef<string | null>(null)
  const revealRoundRef = useRef<string | null>(null)
  const seenHostRef = useRef(false)
  const terminatedRef = useRef(false)

  const setGame = useCallback((next: HostGameState) => {
    stateRef.current = next
    setGameState(next)
    if (!uiTimerRef.current) setDisplayRemainingMs(next.remainingMs)
  }, [])

  const setStrokeState = useCallback((next: Stroke[]) => {
    strokesRef.current = next
    setStrokes(next)
  }, [])

  const setPrompt = useCallback((next: string | null) => {
    promptRef.current = next
    setPrivatePromptId(next)
  }, [])

  const send = useCallback(async <K extends GameEventType>(
    type: K,
    payload: GameEventPayloads[K],
    roundId = stateRef.current?.roundId ?? null,
  ) => {
    const me = identityRef.current
    const transport = transportRef.current
    if (!me || !transport || terminatedRef.current) return
    try {
      await transport.send(me.playerId, roundId, type, payload)
    } catch (cause) {
      console.error(cause)
      setError('通信に失敗しました。接続状態を確認してください。')
    }
  }, [])

  const snapshot = useCallback((state: HostGameState) => {
    void send('state_snapshot', { state }, state.roundId)
  }, [send])

  const applyHostState = useCallback((next: HostGameState) => {
    setGame(next)
    snapshot(next)
  }, [setGame, snapshot])

  const authoritativeRemaining = useCallback((state: HostGameState) => {
    const anchor = hostTimerRef.current
    if (state.phase !== 'drawing' || !anchor) return state.remainingMs
    return remainingAfterElapsed(anchor.baseRemainingMs, Date.now() - anchor.startedAtMs)
  }, [])

  const startHostTimer = useCallback((remainingMs: number) => {
    hostTimerRef.current = { baseRemainingMs: remainingMs, startedAtMs: Date.now() }
  }, [])

  const startUiTimer = useCallback((remainingMs: number) => {
    uiTimerRef.current = { baseRemainingMs: remainingMs, startedAtMs: performance.now() }
    setDisplayRemainingMs(remainingMs)
  }, [])

  const stopUiTimer = useCallback((remainingMs?: number) => {
    const anchor = uiTimerRef.current
    const value = remainingMs ?? (anchor
      ? remainingAfterElapsed(anchor.baseRemainingMs, performance.now() - anchor.startedAtMs)
      : stateRef.current?.remainingMs ?? 0)
    uiTimerRef.current = null
    setDisplayRemainingMs(Math.max(0, value))
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => {
      const anchor = uiTimerRef.current
      if (anchor) {
        setDisplayRemainingMs(remainingAfterElapsed(anchor.baseRemainingMs, performance.now() - anchor.startedAtMs))
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [])

  const finishRound = useCallback((next: HostGameState) => {
    hostTimerRef.current = null
    stopUiTimer(next.remainingMs)
    setGame(next)
    void send('round_end', {
      reason: next.roundEndReason!,
      winner: next.roundWinner,
      scores: scoreRecord(next),
    }, next.roundId)
    snapshot(next)
  }, [send, setGame, snapshot, stopUiTimer])

  const onPresence = useCallback((presence: PresenceMeta[]) => {
    const me = identityRef.current
    if (!me || terminatedRef.current) return
    const hosts = presence.filter((entry) => entry.isHost)
    if (hosts.length) seenHostRef.current = true

    if (!me.isHost) {
      if (seenHostRef.current && hosts.length === 0) {
        terminatedRef.current = true
        setHostDisconnected(true)
        setConnectionStatus('HOST_DISCONNECTED')
        stopUiTimer()
      }
      return
    }

    const current = stateRef.current
    if (!current) return
    let next = withPresence(current, presence)
    const wasConnected = current.currentDrawerId
      ? current.players.find((player) => player.playerId === current.currentDrawerId)?.connected ?? false
      : false
    const isConnected = next.currentDrawerId
      ? next.players.find((player) => player.playerId === next.currentDrawerId)?.connected ?? false
      : false
    if (wasConnected && !isConnected && ['ready', 'drawing', 'answering'].includes(next.phase)) {
      next = drawerDisconnected(next)
      finishRound(next)
      return
    }
    applyHostState(next)
  }, [applyHostState, finishRound, stopUiTimer])

  const onEvent = useCallback((event: EventEnvelope) => {
    const me = identityRef.current
    const current = stateRef.current
    if (!me || event.roomId !== me.roomId || terminatedRef.current) return

    if (me.isHost && current) {
      if (
        event.type === 'stroke_start' &&
        current.phase === 'ready' &&
        event.roundId === current.roundId &&
        event.senderId === current.currentDrawerId
      ) {
        const next = startRoundFromStroke(current, event.senderId, event.roundId)
        if (next !== current) {
          startHostTimer(next.remainingMs)
          setGame(next)
          void send('round_started', {
            roundId: next.roundId!,
            startedAtHostMs: Date.now(),
            remainingMs: next.remainingMs,
          }, next.roundId)
          snapshot(next)
        }
      }

      switch (event.type) {
        case 'state_request':
          snapshot(current)
          break
        case 'buzz': {
          const payload = event.payload as GameEventPayloads['buzz']
          const next = acceptBuzz(
            current,
            event.senderId,
            payload.playerId,
            event.roundId,
            authoritativeRemaining(current),
          )
          if (next !== current) {
            hostTimerRef.current = null
            setGame(next)
            void send('buzz_accepted', { playerId: payload.playerId, remainingMs: next.remainingMs }, next.roundId)
            snapshot(next)
          }
          break
        }
        case 'answer_result': {
          const payload = event.payload as GameEventPayloads['answer_result']
          const next = resolveAnswer(current, event.senderId, event.roundId, payload.result)
          if (next !== current) {
            if (next.phase === 'drawing') {
              startHostTimer(next.remainingMs)
              setGame(next)
              void send('drawing_resumed', { resumedAtHostMs: Date.now(), remainingMs: next.remainingMs }, next.roundId)
              snapshot(next)
            } else {
              finishRound(next)
            }
          }
          break
        }
        case 'ai_correct': {
          const payload = event.payload as GameEventPayloads['ai_correct']
          const base = current.phase === 'drawing'
            ? { ...current, remainingMs: authoritativeRemaining(current) }
            : current
          const next = resolveAiCorrect(base, event.senderId, event.roundId, payload)
          if (next !== base) finishRound(next)
          break
        }
        case 'prompt_reveal': {
          const payload = event.payload as GameEventPayloads['prompt_reveal']
          const next = revealPrompt(current, event.senderId, event.roundId, payload.promptId)
          if (next !== current) applyHostState(next)
          break
        }
        default:
          break
      }
    }

    const latest = stateRef.current
    switch (event.type) {
      case 'state_snapshot': {
        const payload = event.payload as GameEventPayloads['state_snapshot']
        if (payload.state.roomId !== me.roomId) return
        if (!payload.state.players.some((player) => player.playerId === event.senderId && player.isHost)) return
        seenHostRef.current = true
        setGame(payload.state)
        if (payload.state.phase === 'lobby' || payload.state.phase === 'drawer_select') {
          setPrompt(null)
          setDrawerReady(false)
          setAiTop3([])
        }
        break
      }
      case 'round_prepare': {
        if (!hostSender(latest, event.senderId)) return
        const payload = event.payload as GameEventPayloads['round_prepare']
        sequenceRef.current.clear()
        setStrokeState([])
        setAiTop3([])
        setDrawerReady(false)
        aiCorrectRoundRef.current = null
        revealRoundRef.current = null
        if (payload.drawerId === me.playerId) {
          const base = stateRef.current
          setPrompt(base ? choosePrompt(base.settings.enabledCategoryIds, base.usedCategoryIds) : null)
        } else {
          setPrompt(null)
        }
        break
      }
      case 'round_started': {
        if (!hostSender(latest, event.senderId)) return
        const payload = event.payload as GameEventPayloads['round_started']
        startUiTimer(payload.remainingMs)
        break
      }
      case 'buzz_accepted': {
        if (!hostSender(latest, event.senderId)) return
        const payload = event.payload as GameEventPayloads['buzz_accepted']
        stopUiTimer(payload.remainingMs)
        break
      }
      case 'drawing_resumed': {
        if (!hostSender(latest, event.senderId)) return
        const payload = event.payload as GameEventPayloads['drawing_resumed']
        startUiTimer(payload.remainingMs)
        break
      }
      case 'round_end': {
        if (!hostSender(latest, event.senderId)) return
        stopUiTimer()
        const prompt = promptRef.current
        if (
          stateRef.current?.currentDrawerId === me.playerId &&
          prompt &&
          revealRoundRef.current !== event.roundId
        ) {
          revealRoundRef.current = event.roundId
          void send('prompt_reveal', { promptId: prompt }, event.roundId)
        }
        break
      }
      case 'game_end':
        if (hostSender(latest, event.senderId)) stopUiTimer()
        break
      default:
        break
    }

    const visualState = stateRef.current
    if (
      !visualState ||
      event.roundId !== visualState.roundId ||
      event.senderId !== visualState.currentDrawerId ||
      event.senderId === me.playerId
    ) return

    switch (event.type) {
      case 'stroke_start': {
        const payload = event.payload as GameEventPayloads['stroke_start']
        sequenceRef.current.set(payload.strokeId, 0)
        setStrokeState(startStroke(strokesRef.current, payload.strokeId, payload.point))
        break
      }
      case 'stroke_chunk':
      case 'stroke_end': {
        const payload = event.payload as GameEventPayloads['stroke_chunk']
        const lastSequence = sequenceRef.current.get(payload.strokeId) ?? -1
        if (payload.sequence <= lastSequence) return
        sequenceRef.current.set(payload.strokeId, payload.sequence)
        setStrokeState(appendStrokePoints(strokesRef.current, payload.strokeId, payload.points))
        break
      }
      case 'undo_stroke': {
        const payload = event.payload as GameEventPayloads['undo_stroke']
        setStrokeState(removeStroke(strokesRef.current, payload.strokeId))
        break
      }
      case 'canvas_clear':
        sequenceRef.current.clear()
        setStrokeState([])
        break
      case 'ai_guess': {
        const payload = event.payload as GameEventPayloads['ai_guess']
        setAiTop3(payload.top3)
        break
      }
      default:
        break
    }
  }, [
    applyHostState,
    authoritativeRemaining,
    finishRound,
    send,
    setGame,
    setPrompt,
    setStrokeState,
    snapshot,
    startHostTimer,
    startUiTimer,
    stopUiTimer,
  ])

  const cleanup = useCallback(async () => {
    const transport = transportRef.current
    transportRef.current = null
    classifierRef.current?.dispose()
    classifierRef.current = null
    aiReadyRef.current = false
    identityRef.current = null
    stateRef.current = null
    strokesRef.current = []
    promptRef.current = null
    hostTimerRef.current = null
    uiTimerRef.current = null
    sequenceRef.current.clear()
    seenHostRef.current = false
    terminatedRef.current = false
    if (transport) await transport.close().catch(console.error)
    setIdentity(null)
    setGameState(null)
    setStrokes([])
    setAiTop3([])
    setPrivatePromptId(null)
    setDrawerReady(false)
    setDisplayRemainingMs(120_000)
    setConnectionStatus('OFFLINE')
    setError(null)
    setHostDisconnected(false)
    setAiLoading(false)
    setAiError(null)
  }, [])

  useEffect(() => () => {
    void transportRef.current?.close()
    classifierRef.current?.dispose()
  }, [])

  const connect = useCallback(async (roomId: string, name: string, isHost: boolean) => {
    if (!config) throw new Error('Supabaseの公開設定がありません。')
    const playerId = randomId('player')
    const candidate: Identity = { playerId, name, roomId, isHost }
    identityRef.current = candidate
    terminatedRef.current = false
    seenHostRef.current = false
    setConnectionStatus('CONNECTING')
    setHostDisconnected(false)
    setError(null)

    if (isHost) {
      setGame(createInitialHostState(roomId, { playerId, name, isHost: true }))
    }

    const transport = new RoomTransport(config, roomId, playerId)
    transportRef.current = transport
    try {
      await transport.subscribe({ onEvent, onPresence, onStatus: setConnectionStatus })
      await sleep(200)
      const beforeTrack = transport.getPresence()
      if (!isHost) {
        if (!beforeTrack.some((entry) => entry.isHost)) throw new Error('この部屋が見つかりません。')
        if (beforeTrack.some((entry) => entry.name === name)) {
          throw new Error('同じ名前の参加者がいます。別の名前にしてください。')
        }
      } else if (beforeTrack.some((entry) => entry.isHost && entry.playerId !== playerId)) {
        throw new Error('同じ部屋番号が使用中でした。もう一度作成してください。')
      }

      setIdentity(candidate)
      await transport.track({ playerId, name, isHost, onlineAt: new Date().toISOString() })
      if (isHost) {
        const state = stateRef.current
        if (state) snapshot(state)
      } else {
        await sleep(100)
        const duplicates = transport.getPresence().filter((entry) => entry.name === name)
        if (duplicates.length > 1) throw new Error('同じ名前の参加者がいます。別の名前にしてください。')
        await send('state_request', {}, null)
      }
    } catch (cause) {
      await transport.close().catch(console.error)
      transportRef.current = null
      identityRef.current = null
      stateRef.current = null
      setIdentity(null)
      setGameState(null)
      setConnectionStatus('OFFLINE')
      throw cause
    }
  }, [config, onEvent, onPresence, send, setGame, snapshot])

  const createRoom = useCallback(async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('名前を入力してください。')
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await connect(randomRoomCode(), trimmed, true)
        return
      } catch (cause) {
        lastError = cause
        await cleanup()
      }
    }
    throw lastError instanceof Error ? lastError : new Error('部屋を作成できませんでした。')
  }, [cleanup, connect])

  const joinRoom = useCallback(async (roomId: string, name: string) => {
    const code = roomId.replace(/\D/g, '')
    const trimmed = name.trim()
    if (code.length !== 6) throw new Error('6桁の部屋番号を入力してください。')
    if (!trimmed) throw new Error('名前を入力してください。')
    await connect(code, trimmed, false)
  }, [connect])

  useEffect(() => {
    const id = window.setInterval(() => {
      const me = identityRef.current
      const current = stateRef.current
      const anchor = hostTimerRef.current
      if (!me?.isHost || !current || current.phase !== 'drawing' || !anchor || terminatedRef.current) return
      const remaining = remainingAfterElapsed(anchor.baseRemainingMs, Date.now() - anchor.startedAtMs)
      if (remaining > 0) return
      finishRound(timeoutRound({ ...current, remainingMs: 0 }))
    }, 100)
    return () => window.clearInterval(id)
  }, [finishRound])

  useEffect(() => {
    const me = identity
    const state = gameState
    const shouldLoad = Boolean(me && state && state.currentDrawerId === me.playerId && privatePromptId)
    if (!shouldLoad) {
      classifierRef.current?.dispose()
      classifierRef.current = null
      aiReadyRef.current = false
      setAiLoading(false)
      setAiError(null)
      return
    }

    let cancelled = false
    const classifier = new QuickDrawClassifier()
    classifierRef.current?.dispose()
    classifierRef.current = classifier
    aiReadyRef.current = false
    setAiLoading(true)
    setAiError(null)
    classifier.load()
      .then(() => {
        if (!cancelled) {
          aiReadyRef.current = true
          setAiLoading(false)
        }
      })
      .catch((cause) => {
        console.error(cause)
        if (!cancelled) {
          setAiLoading(false)
          setAiError('AIモデルを読み込めませんでした。人間同士では続けられます。')
        }
      })

    return () => {
      cancelled = true
      if (classifierRef.current === classifier) classifierRef.current = null
      aiReadyRef.current = false
      classifier.dispose()
    }
  }, [gameState?.currentDrawerId, identity, privatePromptId])

  useEffect(() => {
    if (
      !identity ||
      !gameState ||
      gameState.phase !== 'drawing' ||
      gameState.currentDrawerId !== identity.playerId ||
      !privatePromptId
    ) return

    let cancelled = false
    let running = false
    const infer = async () => {
      const classifier = classifierRef.current
      const canvas = canvasRef.current
      if (!classifier || !aiReadyRef.current || !canvas || running || cancelled) return
      running = true
      try {
        const probabilities = await classifier.predict(preprocessCanvas(canvas))
        if (cancelled) return
        const next = top3Enabled(probabilities, classifier.labels, gameState.settings.enabledCategoryIds)
        setAiTop3(next)
        await send('ai_guess', { top3: next }, gameState.roundId)
        const top1 = next[0]
        if (
          top1 &&
          isAiWin(next, privatePromptId, gameState.settings.aiWinThreshold) &&
          aiCorrectRoundRef.current !== gameState.roundId
        ) {
          aiCorrectRoundRef.current = gameState.roundId
          await send('ai_correct', {
            promptId: privatePromptId,
            confidence: top1.confidence,
            predictedId: top1.categoryId,
          }, gameState.roundId)
        }
      } catch (cause) {
        console.error(cause)
        setAiError('AI推論でエラーが発生しました。')
      } finally {
        running = false
      }
    }

    void infer()
    const id = window.setInterval(() => void infer(), 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [
    gameState?.currentDrawerId,
    gameState?.phase,
    gameState?.roundId,
    gameState?.settings.aiWinThreshold,
    gameState?.settings.enabledCategoryIds,
    identity,
    privatePromptId,
    send,
  ])

  const updateHostSettings = useCallback((settings: GameSettings) => {
    const me = identityRef.current
    const current = stateRef.current
    if (me?.isHost && current) applyHostState(updateSettings(current, settings))
  }, [applyHostState])

  const beginGame = useCallback(() => {
    const me = identityRef.current
    const current = stateRef.current
    if (!me?.isHost || !current) return
    const validation = validateSettings(current.settings)
    if (validation) {
      setError(validation)
      return
    }
    const next = startGame(current)
    if (next === current) {
      setError('ゲーム開始には接続中のプレイヤーが2人以上必要です。')
      return
    }
    setError(null)
    applyHostState(next)
  }, [applyHostState])

  const selectDrawer = useCallback((playerId: string) => {
    const me = identityRef.current
    const current = stateRef.current
    if (!me?.isHost || !current) return
    const roundId = randomId('round')
    const next = prepareRound(current, playerId, roundId)
    if (next === current) return
    sequenceRef.current.clear()
    setStrokeState([])
    setAiTop3([])
    setGame(next)
    void send('round_prepare', { roundId, drawerId: playerId }, roundId)
    snapshot(next)
  }, [send, setGame, setStrokeState, snapshot])

  const markReady = useCallback(() => {
    const me = identityRef.current
    const current = stateRef.current
    if (!me || !current || current.phase !== 'ready' || current.currentDrawerId !== me.playerId || !promptRef.current) return
    setDrawerReady(true)
    void send('round_ready', {}, current.roundId)
  }, [send])

  const buzz = useCallback(() => {
    const me = identityRef.current
    const current = stateRef.current
    if (!me || !current || current.phase !== 'drawing' || current.currentDrawerId === me.playerId) return
    if (!current.roundEligiblePlayerIds.includes(me.playerId)) return
    void send('buzz', { playerId: me.playerId }, current.roundId)
  }, [send])

  const answerResult = useCallback((result: 'correct' | 'incorrect') => {
    const me = identityRef.current
    const current = stateRef.current
    if (!me || !current || current.phase !== 'answering' || current.currentDrawerId !== me.playerId) return
    void send('answer_result', { result }, current.roundId)
  }, [send])

  const nextRound = useCallback(() => {
    const me = identityRef.current
    const current = stateRef.current
    if (!me?.isHost || !current || current.phase !== 'result') return
    if (current.roundEndReason !== 'drawer_disconnected' && !current.revealedPromptId) {
      setError('お題の公開を待っています。')
      return
    }
    const next = advanceAfterResult(current)
    setError(null)
    applyHostState(next)
    if (next.phase === 'finished' && next.gameWinner) {
      void send('game_end', { winner: next.gameWinner, scores: scoreRecord(next) }, next.roundId)
    }
  }, [applyHostState, send])

  const replay = useCallback(() => {
    const me = identityRef.current
    const current = stateRef.current
    if (!me?.isHost || !current) return
    const next = replayGame(current)
    if (next !== current) applyHostState(next)
  }, [applyHostState])

  const handleStrokeStart = useCallback((strokeId: string, point: Point) => {
    const me = identityRef.current
    const current = stateRef.current
    if (!me || !current || !drawerReady || current.currentDrawerId !== me.playerId) return
    if (current.phase !== 'ready' && current.phase !== 'drawing') return
    sequenceRef.current.set(strokeId, 0)
    setStrokeState(startStroke(strokesRef.current, strokeId, point))
    void send('stroke_start', { strokeId, point }, current.roundId)
  }, [drawerReady, send, setStrokeState])

  const handleLocalPoints = useCallback((strokeId: string, points: Point[]) => {
    setStrokeState(appendStrokePoints(strokesRef.current, strokeId, points))
  }, [setStrokeState])

  const handleStrokeChunk = useCallback((strokeId: string, sequence: number, points: Point[]) => {
    const current = stateRef.current
    if (current) void send('stroke_chunk', { strokeId, sequence, points }, current.roundId)
  }, [send])

  const handleStrokeEnd = useCallback((strokeId: string, sequence: number, points: Point[]) => {
    const current = stateRef.current
    if (current) void send('stroke_end', { strokeId, sequence, points }, current.roundId)
  }, [send])

  const undo = useCallback(() => {
    const me = identityRef.current
    const current = stateRef.current
    if (!me || !current || current.currentDrawerId !== me.playerId || !['ready', 'drawing'].includes(current.phase)) return
    const result = undoLastStroke(strokesRef.current)
    if (!result.removedStrokeId) return
    setStrokeState(result.strokes)
    void send('undo_stroke', { strokeId: result.removedStrokeId }, current.roundId)
  }, [send, setStrokeState])

  const clearCanvas = useCallback(() => {
    const me = identityRef.current
    const current = stateRef.current
    if (!me || !current || current.currentDrawerId !== me.playerId || !['ready', 'drawing'].includes(current.phase)) return
    sequenceRef.current.clear()
    setStrokeState(clearStrokes())
    void send('canvas_clear', {}, current.roundId)
  }, [send, setStrokeState])

  const aiText = aiTop3[0]
    ? aiMessage(aiTop3[0].confidence, categoryLabelJa(aiTop3[0].categoryId))
    : 'うーん、わからない…'

  return {
    identity,
    gameState,
    strokes,
    aiTop3,
    aiText,
    privatePromptId,
    drawerReady,
    displayRemainingMs,
    connectionStatus,
    error,
    hostDisconnected,
    aiLoading,
    aiError,
    canvasRef,
    hasRealtimeConfig: Boolean(config),
    createRoom,
    joinRoom,
    leaveRoom: cleanup,
    updateHostSettings,
    beginGame,
    selectDrawer,
    markReady,
    buzz,
    answerResult,
    nextRound,
    replay,
    undo,
    clearCanvas,
    handleStrokeStart,
    handleLocalPoints,
    handleStrokeChunk,
    handleStrokeEnd,
  }
}
