const KEY = 'crm_verified_users'

export function getVerifiedUsers(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

export function setUserVerified(userId: string, verified: boolean) {
  const set = getVerifiedUsers()
  if (verified) set.add(userId)
  else set.delete(userId)
  try { localStorage.setItem(KEY, JSON.stringify(Array.from(set))) } catch {}
}
