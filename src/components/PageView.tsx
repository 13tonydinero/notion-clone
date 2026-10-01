import { useRef, useState } from 'react'
import { EmojiPicker } from './EmojiPicker'
import { PageEditor } from '../editor/PageEditor'
import { DatabaseView } from '../db/DatabaseView'
import { useWorkspace } from './WorkspaceContext'
import type { PageMeta } from '../types'

export function PageView({ page }: { page: PageMeta }) {
  const { session } = useWorkspace()
  const [picker, setPicker] = useState(false)
  const iconBtn = useRef<HTMLButtonElement>(null)

  return (
    <article className={`page ${page.type === 'database' ? 'page-db' : ''}`}>
      <div className="page-head">
        <button ref={iconBtn} className="page-icon" onClick={() => setPicker(true)} aria-label="Cambia icona" title="Cambia icona">
          {page.icon || <span className="page-icon-empty">😀</span>}
        </button>
        {picker && <EmojiPicker anchor={iconBtn} onPick={(e) => session.updatePage(page.id, { icon: e })} onClose={() => setPicker(false)} />}
        <input
          className="page-title"
          value={page.title}
          placeholder="Senza titolo"
          maxLength={200}
          onChange={(e) => session.updatePage(page.id, { title: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (document.querySelector('.ProseMirror') as HTMLElement | null)?.focus() } }}
          aria-label="Titolo della pagina"
        />
      </div>
      {page.trashed && <div className="banner">Questa pagina è nel cestino. <button className="btn" onClick={() => session.restorePage(page.id)}>Ripristina</button></div>}
      {page.type === 'database' ? <DatabaseView key={page.id} session={session} pageId={page.id} title={page.title} /> : <PageEditor key={page.id} pageId={page.id} />}
    </article>
  )
}
