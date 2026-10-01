import { Extension, type Editor, type Range } from '@tiptap/core'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'

export interface SlashItem {
  title: string
  hint: string
  icon: string
  keywords: string
  run: (args: { editor: Editor; range: Range }) => void
}

export interface SlashState {
  items: SlashItem[]
  selected: number
  rect: DOMRect | null
  pick: (index: number) => void
}

interface Options {
  getItems: () => SlashItem[]
  onState: (s: SlashState | null) => void
}

export const SlashCommand = Extension.create<Options>({
  name: 'slashCommand',
  addOptions() { return { getItems: () => [], onState: () => {} } },
  addProseMirrorPlugins() {
    const { getItems, onState } = this.options
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        allowedPrefixes: [' ', '\n'],
        startOfLine: false,
        items: ({ query }) => {
          const q = query.toLowerCase().trim()
          return getItems().filter((i) => !q || i.title.toLowerCase().includes(q) || i.keywords.includes(q)).slice(0, 30)
        },
        command: ({ editor, range, props }) => props.run({ editor, range }),
        render: () => {
          let selected = 0
          let current: SuggestionProps<SlashItem, SlashItem> | null = null
          const push = () => {
            if (!current) return
            const c = current
            onState({
              items: c.items,
              selected,
              rect: c.clientRect?.() ?? null,
              pick: (i) => { const it = c.items[i]; if (it) c.command(it) },
            })
          }
          return {
            onStart: (p) => { current = p; selected = 0; push() },
            onUpdate: (p) => { current = p; selected = Math.min(selected, Math.max(0, p.items.length - 1)); push() },
            onKeyDown: ({ event }) => {
              if (!current || !current.items.length) return false
              const n = current.items.length
              if (event.key === 'ArrowDown') { selected = (selected + 1) % n; push(); return true }
              if (event.key === 'ArrowUp') { selected = (selected - 1 + n) % n; push(); return true }
              if (event.key === 'Enter' || event.key === 'Tab') { current.command(current.items[selected]); return true }
              if (event.key === 'Escape') { onState(null); return true }
              return false
            },
            onExit: () => { current = null; onState(null) },
          }
        },
      }),
    ]
  },
})
