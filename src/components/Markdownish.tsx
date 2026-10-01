import type { ReactNode } from 'react'

/** Rendering minimale di **grassetto** e a-capo (niente HTML grezzo: sicuro per testi generati). */
export function Markdownish({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const parts: ReactNode[] = []
        line.split(/(\*\*[^*]+\*\*)/g).forEach((chunk, j) => {
          if (chunk.startsWith('**') && chunk.endsWith('**')) parts.push(<b key={j}>{chunk.slice(2, -2)}</b>)
          else if (chunk) parts.push(chunk)
        })
        return <div key={i} className="md-line">{parts.length ? parts : ' '}</div>
      })}
    </>
  )
}
