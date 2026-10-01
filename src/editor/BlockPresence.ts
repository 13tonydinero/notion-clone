import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import * as Y from 'yjs'
import { relativePositionToAbsolutePosition, ySyncPluginKey } from '@tiptap/y-tiptap'
import type { Awareness } from 'y-protocols/awareness'

const key = new PluginKey('blockPresence')

interface Options { awareness: Awareness | null }

/**
 * Evidenzia il blocco (paragrafo, titolo, tabella…) in cui stanno lavorando gli altri utenti,
 * con il loro colore e nome. I cursori puntuali sono gestiti da CollaborationCaret.
 */
export const BlockPresence = Extension.create<Options>({
  name: 'blockPresence',
  addOptions() { return { awareness: null } },
  addProseMirrorPlugins() {
    const awareness = this.options.awareness
    if (!awareness) return []
    return [
      new Plugin({
        key,
        view(view) {
          const refresh = () => {
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, 'refresh'))
          }
          awareness.on('change', refresh)
          return { destroy: () => awareness.off('change', refresh) }
        },
        props: {
          decorations(state) {
            const ystate = ySyncPluginKey.getState(state)
            if (!ystate?.doc || !ystate.binding) return DecorationSet.empty
            const byBlock = new Map<number, { names: string[]; color: string; size: number }>()
            awareness.getStates().forEach((st, clientId) => {
              if (clientId === awareness.clientID) return
              const head = st.cursor?.head
              if (!head || !st.user) return
              try {
                const abs = relativePositionToAbsolutePosition(ystate.doc, ystate.type, Y.createRelativePositionFromJSON(head), ystate.binding.mapping)
                if (abs == null) return
                const $pos = state.doc.resolve(Math.min(abs, state.doc.content.size))
                if ($pos.depth < 1) return
                const start = $pos.before(1)
                const node = state.doc.nodeAt(start)
                if (!node) return
                const entry = byBlock.get(start) ?? { names: [], color: st.user.color as string, size: node.nodeSize }
                entry.names.push(st.user.name as string)
                byBlock.set(start, entry)
              } catch { /* posizione non risolvibile durante una sincronizzazione */ }
            })
            if (!byBlock.size) return DecorationSet.empty
            return DecorationSet.create(
              state.doc,
              [...byBlock].map(([from, e]) =>
                Decoration.node(from, from + e.size, {
                  class: 'remote-block',
                  style: `--rc:${e.color}`,
                  'data-remote-names': e.names.join(', '),
                }),
              ),
            )
          },
        },
      }),
    ]
  },
})
