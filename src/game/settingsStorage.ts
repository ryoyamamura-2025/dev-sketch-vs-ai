import { CHILD_PRESET_IDS, MODEL_LABELS } from './categories'

const ENABLED_CATEGORY_IDS_STORAGE_KEY = 'dev-sketch-vs-ai:enabled-category-ids'
const MODEL_LABEL_SET = new Set<string>(MODEL_LABELS)

interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

function defaultCategoryIds(): string[] {
  return [...CHILD_PRESET_IDS]
}

export function loadEnabledCategoryIds(storage: StorageLike | null = browserStorage()): string[] {
  if (!storage) return defaultCategoryIds()

  try {
    const raw = storage.getItem(ENABLED_CATEGORY_IDS_STORAGE_KEY)
    if (raw === null) return defaultCategoryIds()

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
      return defaultCategoryIds()
    }

    return [...new Set(parsed.filter((id) => MODEL_LABEL_SET.has(id)))]
  } catch {
    return defaultCategoryIds()
  }
}

export function saveEnabledCategoryIds(
  enabledCategoryIds: string[],
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage) return

  try {
    const validIds = [...new Set(enabledCategoryIds.filter((id) => MODEL_LABEL_SET.has(id)))]
    storage.setItem(ENABLED_CATEGORY_IDS_STORAGE_KEY, JSON.stringify(validIds))
  } catch {
    // Local storage may be unavailable (private mode, quota, browser policy). Game play should continue without persistence.
  }
}
