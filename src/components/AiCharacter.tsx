import { useMemo, useState } from 'react'
import type { AiCharacterState } from '../game/ai'
import './AiCharacter.css'

interface CharacterFrame {
  spriteIndex: number
  fallback: string
  label: string
}

const SPRITE_FILE = 'character-sprite.png'
const SPRITE_FRAME_COUNT = 7

const FRAMES: Record<AiCharacterState, CharacterFrame[]> = {
  idle: [
    { spriteIndex: 0, fallback: '🤖', label: 'AIが待機中' },
  ],
  thinking: [
    { spriteIndex: 1, fallback: '🤔', label: 'AIが考え中' },
    { spriteIndex: 2, fallback: '🧐', label: 'AIが考え中' },
    { spriteIndex: 3, fallback: '💭', label: 'AIが考え中' },
  ],
  confident: [
    { spriteIndex: 5, fallback: '😎', label: 'AIが自信あり' },
  ],
  unsure: [
    { spriteIndex: 4, fallback: '😵‍💫', label: 'AIがわからない様子' },
  ],
  victory: [
    { spriteIndex: 6, fallback: '🥳', label: 'AIが正解して喜んでいる' },
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
  const [failed, setFailed] = useState(false)
  const frame = frames[Math.abs(frameStep) % frames.length]
  const src = useMemo(
    () => `${import.meta.env.BASE_URL}ai-character/${SPRITE_FILE}`,
    [],
  )

  return (
    <div className={`ai-character ai-character--${state}${compact ? ' ai-character--compact' : ''}`} aria-label={frame.label}>
      {!failed ? (
        <img
          className="ai-character__image ai-character__image--sprite"
          src={src}
          alt={frame.label}
          style={{
            width: `${SPRITE_FRAME_COUNT * 100}%`,
            left: `-${frame.spriteIndex * 100}%`,
          }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="ai-character__fallback" aria-hidden="true">{frame.fallback}</span>
      )}
    </div>
  )
}
