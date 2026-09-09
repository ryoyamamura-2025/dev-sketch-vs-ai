import { useMemo, useState } from 'react'
import type { AiCharacterState } from '../game/ai'
import './AiCharacter.css'

interface CharacterFrame {
  file: string
  fallback: string
  label: string
}

const FRAMES: Record<AiCharacterState, CharacterFrame[]> = {
  idle: [
    { file: 'idle.webp', fallback: '🤖', label: 'AIが待機中' },
  ],
  thinking: [
    { file: 'thinking-1.webp', fallback: '🤔', label: 'AIが考え中' },
    { file: 'thinking-2.webp', fallback: '🧐', label: 'AIが考え中' },
    { file: 'thinking-3.webp', fallback: '💭', label: 'AIが考え中' },
  ],
  confident: [
    { file: 'confident.webp', fallback: '😎', label: 'AIが自信あり' },
  ],
  unsure: [
    { file: 'unsure.webp', fallback: '😵‍💫', label: 'AIがわからない様子' },
  ],
  victory: [
    { file: 'victory.webp', fallback: '🥳', label: 'AIが正解して喜んでいる' },
  ],
}

export function AiCharacter({
  state,
  frameStep = 0,
  compact = false,
}: {
  state: AiCharacterState
  frameStep?: number
  compact?: boolean
}) {
  const frames = FRAMES[state]
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set())
  const frame = frames[Math.abs(frameStep) % frames.length]
  const src = useMemo(
    () => `${import.meta.env.BASE_URL}ai-character/${frame.file}`,
    [frame.file],
  )
  const failed = failedSources.has(src)

  return (
    <div className={`ai-character ai-character--${state}${compact ? ' ai-character--compact' : ''}`} aria-label={frame.label}>
      {!failed ? (
        <img
          className="ai-character__image"
          src={src}
          alt={frame.label}
          onError={() => {
            setFailedSources((current) => {
              const next = new Set(current)
              next.add(src)
              return next
            })
          }}
        />
      ) : (
        <span className="ai-character__fallback" aria-hidden="true">{frame.fallback}</span>
      )}
    </div>
  )
}
