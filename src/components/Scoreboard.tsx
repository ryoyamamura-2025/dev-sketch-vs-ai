import { AiCharacter } from './AiCharacter'
import type { HostGameState } from '../types/game'

export function Scoreboard({ state }: { state: HostGameState }) {
  const aiWonRound = state.phase === 'result' && state.roundWinner === 'AI'

  return (
    <>
      {aiWonRound ? (
        <div className="ai-victory-strip" role="status">
          <AiCharacter state="victory" compact />
          <span>AIが当てた！</span>
        </div>
      ) : null}
      <section className="scoreboard" aria-label="スコア">
        {state.players.map((player) => (
          <div className="score-chip" key={player.playerId}>
            <span>{player.name}{player.playerId === state.currentDrawerId ? ' ✏️' : ''}</span>
            <strong>{player.score}</strong>
          </div>
        ))}
        <div className="score-chip score-chip--ai">
          <span>AI <AiCharacter state="idle" compact /></span>
          <strong>{state.aiScore}</strong>
        </div>
      </section>
    </>
  )
}
