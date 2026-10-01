import { Popover } from './Popover'
import type { RefObject } from 'react'

const EMOJIS = [
  '📄', '📘', '📝', '📌', '📎', '📅', '📊', '📈', '🗂️', '📋', '✅', '⭐', '🔥', '💡', '🎯', '🚀',
  '🎉', '🎊', '🥂', '🍸', '🍾', '🎶', '🎧', '🎤', '🪩', '🕺', '💃', '🎟️', '🏠', '🏢', '🏝️', '✈️',
  '🚗', '🛒', '💶', '💰', '🧾', '📞', '✉️', '👥', '🤝', '🧠', '🎨', '🛠️', '⚙️', '🔒', '🔑', '🌍',
  '🍕', '🍔', '🥗', '☕', '🍷', '🍰', '🎂', '🎁', '🏆', '🏃', '💪', '📚', '🎓', '🔬', '💻', '📱',
]

export function EmojiPicker({ anchor, onPick, onClose }: { anchor: RefObject<HTMLElement | null>; onPick: (e: string) => void; onClose: () => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={296}>
      <div className="emoji-grid">
        {EMOJIS.map((e) => (
          <button key={e} className="emoji-btn" onClick={() => { onPick(e); onClose() }}>{e}</button>
        ))}
      </div>
      <button className="menu-item" onClick={() => { onPick(''); onClose() }}>Rimuovi icona</button>
    </Popover>
  )
}
