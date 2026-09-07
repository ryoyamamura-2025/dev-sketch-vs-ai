import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type { EventEnvelope, GameEventType, PresenceMeta, TypedEnvelope } from '../types/game'
import { randomId } from '../lib/ids'

export interface TransportHandlers {
  onEvent: (event: EventEnvelope) => void
  onPresence: (players: PresenceMeta[]) => void
  onStatus: (status: string) => void
}

export interface SupabaseBrowserConfig {
  url: string
  key: string
}

export function getSupabaseBrowserConfig(): SupabaseBrowserConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  return url && key ? { url, key } : null
}

function flattenPresence(state: Record<string, unknown[]>): PresenceMeta[] {
  const seen = new Set<string>()
  const result: PresenceMeta[] = []
  for (const entries of Object.values(state)) {
    for (const raw of entries) {
      const item = raw as Partial<PresenceMeta>
      if (!item.playerId || !item.name || seen.has(item.playerId)) continue
      seen.add(item.playerId)
      result.push({
        playerId: item.playerId,
        name: item.name,
        isHost: Boolean(item.isHost),
        onlineAt: item.onlineAt ?? '',
      })
    }
  }
  return result
}

export class RoomTransport {
  private readonly client: SupabaseClient
  private readonly channel: RealtimeChannel
  private handlers: TransportHandlers | null = null

  constructor(config: SupabaseBrowserConfig, readonly roomId: string, readonly playerId: string) {
    this.client = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    this.channel = this.client.channel(`room:${roomId}`, {
      config: {
        broadcast: { self: true, ack: false },
        presence: { key: playerId },
      },
    })
  }

  async subscribe(handlers: TransportHandlers): Promise<void> {
    this.handlers = handlers
    this.channel
      .on('broadcast', { event: 'game-event' }, ({ payload }) => {
        handlers.onEvent(payload as EventEnvelope)
      })
      .on('presence', { event: 'sync' }, () => handlers.onPresence(this.getPresence()))
      .on('presence', { event: 'join' }, () => handlers.onPresence(this.getPresence()))
      .on('presence', { event: 'leave' }, () => handlers.onPresence(this.getPresence()))

    await new Promise<void>((resolve, reject) => {
      let settled = false
      this.channel.subscribe((status) => {
        handlers.onStatus(status)
        if (status === 'SUBSCRIBED' && !settled) {
          settled = true
          resolve()
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
          settled = true
          reject(new Error(`Realtime connection failed: ${status}`))
        }
      })
    })
  }

  getPresence(): PresenceMeta[] {
    return flattenPresence(this.channel.presenceState() as Record<string, unknown[]>)
  }

  async track(meta: PresenceMeta): Promise<void> {
    await this.channel.track(meta)
    this.handlers?.onPresence(this.getPresence())
  }

  async send<K extends GameEventType>(
    senderId: string,
    roundId: string | null,
    type: K,
    payload: TypedEnvelope<K>['payload'],
  ): Promise<void> {
    const envelope: TypedEnvelope<K> = {
      type,
      roomId: this.roomId,
      senderId,
      roundId,
      eventId: randomId('evt'),
      payload,
    }
    await this.channel.send({ type: 'broadcast', event: 'game-event', payload: envelope })
  }

  async close(): Promise<void> {
    try {
      await this.channel.untrack()
    } finally {
      await this.client.removeChannel(this.channel)
    }
  }
}
