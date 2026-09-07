import { useMemo, useState, type FormEvent } from 'react'
import { AiPanel } from './components/AiPanel'
import { DrawingCanvas } from './components/DrawingCanvas'
import { Scoreboard } from './components/Scoreboard'
import { SettingsPanel } from './components/SettingsPanel'
import { categoryLabelJa } from './game/categories'
import { validateSettings } from './game/stateMachine'
import { useRoomGame } from './hooks/useRoomGame'
import type { HostGameState } from './types/game'
import './styles.css'

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function playerName(state: HostGameState, id: string | 'AI' | null): string {
  if (!id) return ''
  if (id === 'AI') return 'AI 🤖'
  return state.players.find((player) => player.playerId === id)?.name ?? 'プレイヤー'
}

function ConnectionBadge({ status }: { status: string }) {
  const okay = status === 'SUBSCRIBED'
  return <span className={`connection-badge ${okay ? 'connection-badge--ok' : ''}`}>{okay ? '接続中' : status}</span>
}

export default function App() {
  const game = useRoomGame()
  const [createName, setCreateName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const state = game.gameState
  const me = game.identity
  const isHost = Boolean(me?.isHost)
  const isDrawer = Boolean(me && state?.currentDrawerId === me.playerId)
  const isEligibleAnswerer = Boolean(
    me && state && state.currentDrawerId !== me.playerId && state.roundEligiblePlayerIds.includes(me.playerId),
  )
  const drawerName = state ? playerName(state, state.currentDrawerId) : ''
  const buzzName = state ? playerName(state, state.currentBuzzPlayerId) : ''
  const settingsError = state ? validateSettings(state.settings) : null

  const resultText = useMemo(() => {
    if (!state || state.phase !== 'result') return ''
    if (state.roundEndReason === 'timeout') return '時間切れ！ このラウンドは引き分け'
    if (state.roundEndReason === 'drawer_disconnected') return '描き手の接続が切れました。得点なしです。'
    if (state.roundWinner === 'AI') return 'AIが先に当てた！'
    if (state.roundWinner) return `${playerName(state, state.roundWinner)}の正解！`
    return 'ラウンド終了'
  }, [state])

  const runForm = async (action: () => Promise<void>) => {
    setWorking(true)
    setFormError(null)
    try {
      await action()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : '接続できませんでした。')
    } finally {
      setWorking(false)
    }
  }

  const create = (event: FormEvent) => {
    event.preventDefault()
    void runForm(() => game.createRoom(createName))
  }

  const join = (event: FormEvent) => {
    event.preventDefault()
    void runForm(() => game.joinRoom(joinCode, joinName))
  }

  if (!me || !state) {
    return (
      <main className="app-shell top-screen">
        <section className="hero">
          <div className="eyebrow">家族で遊ぶ お絵描き早押し</div>
          <h1>AIより先に当てろ！</h1>
          <p>1人が描いて、家族とAIが同時に予想。分かったら「わかった！」を押して口で答えよう。</p>
        </section>

        {!game.hasRealtimeConfig ? (
          <div className="setup-warning" role="alert">
            <strong>Supabase Realtimeの公開設定がまだありません。</strong>
            <span><code>VITE_SUPABASE_URL</code> と <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> を設定すると部屋を作れます。</span>
          </div>
        ) : null}

        <div className="entry-grid">
          <form className="panel entry-card" onSubmit={create}>
            <div className="entry-icon">🏠</div>
            <h2>部屋を作る</h2>
            <label>
              あなたの名前
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                maxLength={20}
                autoComplete="nickname"
                placeholder="パパ"
              />
            </label>
            <button className="primary-button" disabled={working || !game.hasRealtimeConfig} type="submit">
              部屋を作る
            </button>
          </form>

          <form className="panel entry-card" onSubmit={join}>
            <div className="entry-icon">🚪</div>
            <h2>部屋に入る</h2>
            <label>
              6桁の部屋番号
              <input
                className="room-code-input"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
              />
            </label>
            <label>
              あなたの名前
              <input
                value={joinName}
                onChange={(event) => setJoinName(event.target.value)}
                maxLength={20}
                autoComplete="nickname"
                placeholder="はな"
              />
            </label>
            <button className="primary-button" disabled={working || !game.hasRealtimeConfig} type="submit">
              入る
            </button>
          </form>
        </div>
        {formError || game.error ? <div className="global-error">{formError ?? game.error}</div> : null}
        <footer>ゲーム内容は保存されません。</footer>
      </main>
    )
  }

  if (game.hostDisconnected) {
    return (
      <main className="app-shell centered-screen">
        <section className="panel fatal-card">
          <div className="fatal-icon">🔌</div>
          <h1>ホストとの接続が切れました</h1>
          <p>このゲームはここで終了です。ホスト移行はMVPでは行いません。</p>
          <button className="primary-button" onClick={() => void game.leaveRoom()}>トップへ戻る</button>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell game-shell">
      <header className="game-header">
        <div>
          <div className="eyebrow">AIより先に当てろ！</div>
          <div className="room-line">部屋 <strong>{me.roomId}</strong> <ConnectionBadge status={game.connectionStatus} /></div>
        </div>
        <button className="text-button" onClick={() => void game.leaveRoom()}>退出</button>
      </header>

      {game.error ? <div className="global-error">{game.error}</div> : null}
      <Scoreboard state={state} />

      {state.phase === 'lobby' ? (
        <section className="phase-layout">
          <div className="panel lobby-card">
            <h2>みんな集まった？</h2>
            <p className="room-code-big">{state.roomId}</p>
            <p className="muted">この6桁を家族に伝えてね。</p>
            <div className="player-list">
              {state.players.map((player) => (
                <div className="player-row" key={player.playerId}>
                  <span className={`presence-dot ${player.connected ? 'presence-dot--on' : ''}`} />
                  <strong>{player.name}</strong>
                  {player.isHost ? <span className="host-pill">ホスト</span> : null}
                  <span className="player-status">{player.connected ? '参加中' : '切断'}</span>
                </div>
              ))}
            </div>
            {!isHost ? <p className="wait-message">ホストがゲームを始めるのを待っています。</p> : null}
          </div>

          {isHost ? (
            <div className="host-lobby-controls">
              <SettingsPanel value={state.settings} onChange={game.updateHostSettings} validationError={settingsError} />
              <button
                className="primary-button primary-button--large"
                onClick={game.beginGame}
                disabled={Boolean(settingsError) || state.players.filter((player) => player.connected).length < 2}
              >
                ゲームスタート
              </button>
              {state.players.filter((player) => player.connected).length < 2 ? (
                <p className="muted center">2人以上そろうとスタートできます。</p>
              ) : null}
            </div>
          ) : (
            <section className="panel settings-summary">
              <h3>ゲーム設定</h3>
              <p>{state.settings.winsToFinish}勝先取</p>
              <p>1ラウンド {state.settings.roundTimeSec}秒</p>
              <p>AI勝利 {Math.round(state.settings.aiWinThreshold * 100)}%〜</p>
              <p>お題 {state.settings.enabledCategoryIds.length}個</p>
            </section>
          )}
        </section>
      ) : null}

      {state.phase === 'drawer_select' ? (
        <section className="panel centered-card">
          <div className="phase-icon">✏️</div>
          <h2>次に描く人を選ぼう</h2>
          {isHost ? (
            <div className="drawer-grid">
              {state.players.filter((player) => player.connected).map((player) => (
                <button className="drawer-button" key={player.playerId} onClick={() => game.selectDrawer(player.playerId)}>
                  <span>{player.name}</span>
                  {player.isHost ? <small>ホスト</small> : null}
                </button>
              ))}
            </div>
          ) : <p className="wait-message">ホストが描き手を選んでいます…</p>}
        </section>
      ) : null}

      {state.phase === 'ready' ? (
        <section className="play-layout">
          {isDrawer ? (
            !game.drawerReady ? (
              <section className="panel prompt-card">
                <div className="phase-icon">🤫</div>
                <p className="muted">ほかの人には見えていません</p>
                <h2>お題は…</h2>
                <div className="prompt-word">{game.privatePromptId ? categoryLabelJa(game.privatePromptId) : 'お題を準備中…'}</div>
                <button className="primary-button primary-button--large" onClick={game.markReady} disabled={!game.privatePromptId}>
                  準備OK
                </button>
              </section>
            ) : (
              <section className="drawing-area">
                <div className="ready-hint">最初の1画でタイマーとAIがスタート！</div>
                <DrawingCanvas
                  strokes={game.strokes}
                  editable
                  canvasRef={game.canvasRef}
                  onStrokeStart={game.handleStrokeStart}
                  onLocalPoints={game.handleLocalPoints}
                  onStrokeChunk={game.handleStrokeChunk}
                  onStrokeEnd={game.handleStrokeEnd}
                />
                <div className="draw-controls">
                  <button onClick={game.undo} disabled={game.strokes.length === 0}>↶ Undo</button>
                  <button onClick={game.clearCanvas} disabled={game.strokes.length === 0}>Clear</button>
                </div>
              </section>
            )
          ) : (
            <section className="panel centered-card">
              <div className="phase-icon">🤫</div>
              <h2>{drawerName}さんがお題を確認中</h2>
              <p className="wait-message">お題は描き手の端末だけに表示されています。</p>
            </section>
          )}
          <section className="panel timer-card timer-card--idle"><span>制限時間</span><strong>{formatTime(state.remainingMs)}</strong><small>最初の1画から</small></section>
        </section>
      ) : null}

      {state.phase === 'drawing' ? (
        <section className="play-layout">
          <div className="play-main">
            <div className="timer-live" aria-label="残り時間">残り <strong>{formatTime(game.displayRemainingMs)}</strong></div>
            <DrawingCanvas
              strokes={game.strokes}
              editable={isDrawer}
              canvasRef={game.canvasRef}
              onStrokeStart={game.handleStrokeStart}
              onLocalPoints={game.handleLocalPoints}
              onStrokeChunk={game.handleStrokeChunk}
              onStrokeEnd={game.handleStrokeEnd}
            />
            {isDrawer ? (
              <div className="draw-controls">
                <button onClick={game.undo} disabled={game.strokes.length === 0}>↶ Undo</button>
                <button onClick={game.clearCanvas} disabled={game.strokes.length === 0}>Clear</button>
              </div>
            ) : isEligibleAnswerer ? (
              <button className="buzz-button" onClick={game.buzz}>わかった！</button>
            ) : (
              <div className="late-join-note">このラウンドは観戦中。次のラウンドから参加できます。</div>
            )}
          </div>
          <AiPanel top3={game.aiTop3} loading={isDrawer && game.aiLoading} error={isDrawer ? game.aiError : null} />
        </section>
      ) : null}

      {state.phase === 'answering' ? (
        <section className="play-layout">
          <div className="play-main">
            <div className="stop-banner">STOP!</div>
            <div className="timer-live timer-live--paused">残り <strong>{formatTime(game.displayRemainingMs)}</strong></div>
            <DrawingCanvas strokes={game.strokes} editable={false} canvasRef={game.canvasRef} paused />
          </div>
          <section className="panel answer-card">
            <div className="phase-icon">🙋</div>
            <h2>{buzzName}さんが回答！</h2>
            <p>答えを声に出して言ってね。</p>
            {isDrawer ? (
              <div className="answer-controls">
                <button className="correct-button" onClick={() => game.answerResult('correct')}>正解</button>
                <button className="incorrect-button" onClick={() => game.answerResult('incorrect')}>不正解</button>
              </div>
            ) : <p className="wait-message">{drawerName}さんが判定します。</p>}
          </section>
          <AiPanel top3={game.aiTop3} />
        </section>
      ) : null}

      {state.phase === 'result' ? (
        <section className="panel result-card">
          <div className="phase-icon">{state.roundWinner === 'AI' ? '🤖' : state.roundWinner ? '🎉' : '⏰'}</div>
          <h2>{resultText}</h2>
          {state.revealedPromptId ? (
            <div className="reveal-line">お題：<strong>{categoryLabelJa(state.revealedPromptId)}</strong></div>
          ) : state.roundEndReason === 'drawer_disconnected' ? (
            <div className="reveal-line">お題は公開できませんでした。</div>
          ) : (
            <div className="reveal-line">お題を公開中…</div>
          )}
          <Scoreboard state={state} />
          {isHost ? (
            <button
              className="primary-button primary-button--large"
              onClick={game.nextRound}
              disabled={state.roundEndReason !== 'drawer_disconnected' && !state.revealedPromptId}
            >
              {state.gameWinner ? '結果へ' : '次のラウンド'}
            </button>
          ) : <p className="wait-message">ホストが次へ進めます。</p>}
        </section>
      ) : null}

      {state.phase === 'finished' ? (
        <section className="panel result-card finished-card">
          <div className="trophy">🏆</div>
          <p className="eyebrow">ゲーム終了</p>
          <h1>{playerName(state, state.gameWinner)} の勝ち！</h1>
          <Scoreboard state={state} />
          {isHost ? (
            <div className="finished-actions">
              <button className="primary-button primary-button--large" onClick={game.replay}>もう一度</button>
              <button className="secondary-button" onClick={() => void game.leaveRoom()}>トップへ戻る</button>
            </div>
          ) : (
            <button className="secondary-button" onClick={() => void game.leaveRoom()}>トップへ戻る</button>
          )}
        </section>
      ) : null}
    </main>
  )
}
