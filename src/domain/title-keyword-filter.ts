export function normalizeBlockedKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLocaleLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function isTitleBlocked(title: string, keywords: readonly string[]): boolean {
  const normalizedTitle = title.toLocaleLowerCase()
  return keywords.some((keyword) => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase()
    return Boolean(normalizedKeyword) && normalizedTitle.includes(normalizedKeyword)
  })
}
