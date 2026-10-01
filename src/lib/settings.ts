import { createPersistedStore } from './store'
import { uid } from './ids'

export const USER_COLORS = ['#e5484d', '#f76b15', '#d6a100', '#30a46c', '#0091b4', '#3e63dd', '#8e4ec6', '#d6409f', '#12a594']

export interface Settings {
  userName: string
  userColor: string
  theme: 'auto' | 'light' | 'dark'
  /** Se false l'app lavora solo in locale (nessuna connessione al server). */
  syncEnabled: boolean
  /** URL del server di sincronizzazione; vuoto = stesso indirizzo da cui è servita l'app. */
  serverUrl: string
  password: string
  deviceId: string
}

const colorFor = (seed: string) => USER_COLORS[[...seed].reduce((a, c) => a + c.charCodeAt(0), 0) % USER_COLORS.length]

const deviceId = uid(8)
export const settings = createPersistedStore<Settings>('nc:settings', {
  userName: '',
  userColor: colorFor(deviceId),
  theme: 'auto',
  syncEnabled: true,
  serverUrl: '',
  password: '',
  deviceId,
})

export const displayName = (s: Settings) => s.userName.trim() || `Ospite ${s.deviceId.slice(0, 3)}`

export function applyTheme(theme: Settings['theme']) {
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

/** Base URL http(s) del server. */
export function httpBase(s: Settings = settings.get()): string {
  const raw = s.serverUrl.trim().replace(/\/+$/, '')
  if (!raw) return ''
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`
}

export function wsBase(s: Settings = settings.get()): string {
  const http = httpBase(s) || location.origin
  return http.replace(/^http/, 'ws') + '/sync'
}
