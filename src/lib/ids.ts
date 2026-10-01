const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** ID casuale URL-safe (usa crypto quando disponibile). */
export function uid(len = 10): string {
  const bytes = new Uint8Array(len)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes)
  else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

/** ID del workspace: lungo, perché funge anche da "chiave" di accesso condivisa. */
export const newWorkspaceId = () => 'w' + uid(20)
export const newPageId = () => 'p' + uid(12)
export const newRowId = () => 'r' + uid(10)
export const newColId = () => 'c' + uid(8)
export const newViewId = () => 'v' + uid(8)
export const newOptionId = () => 'o' + uid(6)
