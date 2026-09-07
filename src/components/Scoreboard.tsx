import type { HostGameState } from '../types/game'

export function Scoreboard({ state }: { state: HostGameState }) {
  return (
    <section className="scoreboard" aria-label="スコア">
      {state.players.map((player) => (
        <div className="score-chip" key={player.playerId}>
          <span>{player.name}{player.playerId === state.currentDrawerId ? ' ✏️' : ''}</span>
          <strong>{player.score}</strong>
        </div>
      ))}
      <div className="score-chip score-chip--ai">
        <span>AI 🤖</span>
        <strong>{state.aiScore}</strong>
      </div>
    </section>
  )
}
