import type { DbHandles, DbSnapshot, SelectOption, View } from './schema'
import type { ViewResult } from './query'
import type { RemoteFocus } from './Cells'

export interface ViewCtx {
  db: DbHandles
  snap: DbSnapshot
  view: View
  result: ViewResult
  remoteCells: Map<string, RemoteFocus>
  setFocusCell: (key: string | null) => void
  openRow: (rowId: string) => void
  createOption: (colId: string, label: string) => SelectOption | null
  /** Crea una riga applicando i valori forniti più i default impliciti della vista (es. filtri semplici). */
  newRow: (cells?: Record<string, unknown>, opts?: { after?: string; open?: boolean }) => string
}
