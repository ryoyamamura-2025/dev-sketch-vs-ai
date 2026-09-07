export function randomId(prefix = ''): string {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return prefix ? `${prefix}-${value}` : value
}

export function randomRoomCode(): string {
  const array = new Uint32Array(1)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(array)
    return String(100000 + (array[0] % 900000))
  }
  return String(Math.floor(100000 + Math.random() * 900000))
}
