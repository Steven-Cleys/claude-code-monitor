const SESSION_PALETTE = [
  '#a78bfa', // violet
  '#f472b6', // pink
  '#fb923c', // orange
  '#facc15', // yellow
  '#2dd4bf', // teal
  '#e879f9', // fuchsia
  '#34d399', // emerald
  '#60a5fa', // blue
  '#f87171', // coral
  '#a3e635', // lime
  '#22d3ee', // sky
  '#fbbf24', // gold
]

function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff
  }
  return hash
}

export function getSessionColor(sessionId: string): string {
  return SESSION_PALETTE[hashString(sessionId) % SESSION_PALETTE.length]
}
