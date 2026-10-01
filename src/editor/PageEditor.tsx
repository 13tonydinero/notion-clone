import { useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import type { Editor } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'
import { schemaExtensions, placeholderExtension } from './extensions'
import { BlockPresence } from './BlockPresence'
import { SlashCommand, type SlashState } from './SlashCommand'
import { buildSlashItems } from './slashItems'
import { useWorkspace } from '../components/WorkspaceContext'
import { settings, displayName } from '../lib/settings'
import type { DocHandle } from '../sync/session'

function SlashMenu({ state }: { state: SlashState }) {
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' })
  useEffect(() => {
    const r = state.rect
    if (!r) return
    const h = 320
    const vh = window.visualViewport?.height ?? window.innerHeight
    const below = vh - r.bottom
    const top = below > 220 || below > r.top ? r.bottom + 6 : Math.max(8, r.top - Math.min(h, r.top - 8) - 6)
    setStyle({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - 288)), maxHeight: Math.min(h, below > 220 || below > r.top ? below - 12 : r.top - 12) })
  }, [state.rect])
  useEffect(() => {
    document.querySelector('.slash-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [state.selected])
  if (!state.items.length) return null
  return (
    <div className="slash-menu" style={style} onMouseDown={(e) => e.preventDefault()}>
      {state.items.map((it, i) => (
        <button key={it.title} className={`slash-item ${i === state.selected ? 'active' : ''}`} onClick={() => state.pick(i)}>
          <span className="slash-icon">{it.icon}</span>
          <span><b>{it.title}</b><small>{it.hint}</small></span>
        </button>
      ))}
    </div>
  )
}

function Btn({ on, label, title, onClick, disabled }: { on?: boolean; label: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className={`tb-btn ${on ? 'on' : ''}`} title={title} aria-label={title} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{label}</button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      code: e.isActive('code'), highlight: e.isActive('highlight'), link: e.isActive('link'),
      h1: e.isActive('heading', { level: 1 }), h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), task: e.isActive('taskList'), quote: e.isActive('blockquote'),
      callout: e.isActive('callout'), table: e.isActive('table'),
    }),
  })
  const c = () => editor.chain().focus()
  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Indirizzo del link (vuoto per rimuoverlo)', prev ?? 'https://')
    if (url === null) return
    if (url.trim() === '') c().extendMarkRange('link').unsetLink().run()
    else c().extendMarkRange('link').setLink({ href: /^(https?:|mailto:|tel:)/.test(url) ? url : `https://${url}` }).run()
  }
  return (
    <div className="toolbar" role="toolbar" aria-label="Formattazione">
      <Btn title="Annulla" label="↶" onClick={() => editor.commands.undo()} />
      <Btn title="Ripeti" label="↷" onClick={() => editor.commands.redo()} />
      <span className="tb-sep" />
      <Btn title="Titolo 1" on={s.h1} label="H1" onClick={() => c().toggleHeading({ level: 1 }).run()} />
      <Btn title="Titolo 2" on={s.h2} label="H2" onClick={() => c().toggleHeading({ level: 2 }).run()} />
      <Btn title="Titolo 3" on={s.h3} label="H3" onClick={() => c().toggleHeading({ level: 3 }).run()} />
      <span className="tb-sep" />
      <Btn title="Grassetto" on={s.bold} label={<b>B</b>} onClick={() => c().toggleBold().run()} />
      <Btn title="Corsivo" on={s.italic} label={<i>I</i>} onClick={() => c().toggleItalic().run()} />
      <Btn title="Sottolineato" on={s.underline} label={<u>U</u>} onClick={() => c().toggleUnderline().run()} />
      <Btn title="Barrato" on={s.strike} label={<s>S</s>} onClick={() => c().toggleStrike().run()} />
      <Btn title="Codice" on={s.code} label="</>" onClick={() => c().toggleCode().run()} />
      <Btn title="Evidenzia" on={s.highlight} label="🖍" onClick={() => c().toggleHighlight({ color: '#fff3a3' }).run()} />
      <Btn title="Link" on={s.link} label="🔗" onClick={setLink} />
      <span className="tb-sep" />
      <Btn title="Elenco puntato" on={s.bullet} label="•≡" onClick={() => c().toggleBulletList().run()} />
      <Btn title="Elenco numerato" on={s.ordered} label="1≡" onClick={() => c().toggleOrderedList().run()} />
      <Btn title="Lista attività" on={s.task} label="☑" onClick={() => c().toggleTaskList().run()} />
      <Btn title="Citazione" on={s.quote} label="❝" onClick={() => c().toggleBlockquote().run()} />
      <Btn title="Callout" on={s.callout} label="💡" onClick={() => c().toggleCallout().run()} />
      <span className="tb-sep" />
      <Btn title="Inserisci tabella" on={s.table} label="▦" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
      {s.table && (
        <>
          <Btn title="Aggiungi riga sotto" label="＋riga" onClick={() => c().addRowAfter().run()} />
          <Btn title="Aggiungi colonna a destra" label="＋col" onClick={() => c().addColumnAfter().run()} />
          <Btn title="Elimina riga" label="−riga" onClick={() => c().deleteRow().run()} />
          <Btn title="Elimina colonna" label="−col" onClick={() => c().deleteColumn().run()} />
          <Btn title="Riga di intestazione" label="Hdr" onClick={() => c().toggleHeaderRow().run()} />
          <Btn title="Unisci celle" label="⊞" onClick={() => c().mergeCells().run()} />
          <Btn title="Dividi cella" label="⊟" onClick={() => c().splitCell().run()} />
          <Btn title="Elimina tabella" label="🗑" onClick={() => c().deleteTable().run()} />
        </>
      )}
    </div>
  )
}

function Inner({ handle, pageId }: { handle: DocHandle; pageId: string }) {
  const { session, openPage } = useWorkspace()
  const [slash, setSlash] = useState<SlashState | null>(null)
  const user = settings.use()
  const provider = handle.provider

  const items = useMemo(() => buildSlashItems(session, pageId, openPage), [session, pageId, openPage])
  const itemsRef = useMemo(() => ({ current: items }), [])
  itemsRef.current = items

  const editor = useEditor(
    {
      extensions: [
        ...schemaExtensions(),
        placeholderExtension,
        Collaboration.configure({ document: handle.doc, field: 'content' }),
        ...(provider
          ? [
              CollaborationCaret.configure({
                provider,
                user: { name: displayName(settings.get()), color: settings.get().userColor },
                render: (u) => {
                  const caret = document.createElement('span')
                  caret.classList.add('remote-caret')
                  caret.style.setProperty('--rc', u.color)
                  const label = document.createElement('span')
                  label.classList.add('remote-caret-label')
                  label.textContent = u.name
                  caret.appendChild(label)
                  return caret
                },
                selectionRender: (u) => ({ nodeName: 'span', class: 'remote-selection', style: `background-color:${u.color}33` }),
              }),
              BlockPresence.configure({ awareness: provider.awareness }),
            ]
          : []),
        SlashCommand.configure({ getItems: () => itemsRef.current, onState: setSlash }),
      ],
      editorProps: { attributes: { class: 'prose', spellcheck: 'true' } },
    },
    [handle],
  )

  // Se l'utente cambia nome/colore, aggiorna il cursore condiviso.
  useEffect(() => {
    editor?.commands.updateUser({ name: displayName(user), color: user.userColor })
  }, [editor, user.userName, user.userColor]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null
  return (
    <div className="editor">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      <div
        className="editor-tail"
        onClick={() => {
          // Clic sotto l'ultimo blocco: sposta il cursore in fondo, aggiungendo un paragrafo vuoto
          // se l'ultimo blocco non lo è già (tabella, database, callout, elenco…), come in Notion.
          // Operazioni sincrone: nessun tasto premuto subito dopo può andare perso.
          const last = editor.state.doc.lastChild
          if (!(last && last.type.name === 'paragraph' && last.content.size === 0)) {
            editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'paragraph' })
          }
          editor.view.dispatch(editor.state.tr.setSelection(Selection.atEnd(editor.state.doc)))
          editor.view.focus()
        }}
      />
      {slash && <SlashMenu state={slash} />}
    </div>
  )
}

export function PageEditor({ pageId }: { pageId: string }) {
  const { session } = useWorkspace()
  const [handle, setHandle] = useState<DocHandle | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const h = session.acquire(pageId)
    let alive = true
    h.whenReady().then(() => { if (alive) { setHandle(h); setReady(true) } })
    return () => { alive = false; setReady(false); setHandle(null); session.release(pageId) }
  }, [session, pageId])
  if (!handle || !ready) return <div className="db-loading">Caricamento…</div>
  return <Inner key={pageId} handle={handle} pageId={pageId} />
}
