export type PageType = 'page' | 'database'

export interface PageMeta {
  id: string
  title: string
  icon: string
  parent: string | null
  type: PageType
  order: number
  /** Database incorporato in un'altra pagina: non compare nella barra laterale. */
  inline: boolean
  trashed: boolean
  createdAt: number
  updatedAt: number
}

export type ConnectionStatus = 'connected' | 'connecting' | 'offline' | 'local'

export interface PresenceUser {
  clientId: number
  name: string
  color: string
  pageId: string | null
  self: boolean
}
