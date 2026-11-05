import { Copy, X } from 'lucide-react'
import { useEffect } from 'react'

export interface LightboxEntry {
  url: string
  title: string | null
  subtitle?: string
  /** Foto anterior de la que esta parece copia: se muestran lado a lado. */
  compare?: { url: string; caption: string }
}

export function PhotoLightbox({ entry, onClose }: { entry: LightboxEntry; onClose: () => void }) {
  const thisCaption = entry.subtitle ? `Esta foto · ${entry.subtitle}` : 'Esta foto'
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[#2A2622]/80 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`relative w-full ${entry.compare ? 'max-w-5xl' : 'max-w-2xl'} border-2 border-[#2A2622] bg-[#FFF8F3] shadow-[8px_8px_0_0_#2A2622]`}>
        <div className="flex items-center justify-between border-b-2 border-[#2A2622] bg-[#ECE1D3] px-4 py-3">
          <div className="min-w-0">
            <span className="label text-[#2A2622]">{entry.title ?? 'Foto'}</span>
            {entry.subtitle && <span className="mono ml-3 text-xs text-[#8C7169]">{entry.subtitle}</span>}
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center border-2 border-[#2A2622] text-[#58423B] transition-colors hover:bg-[#2A2622] hover:text-white"
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>
        </div>
        {entry.compare ? (
          <>
            <p className="mono border-b-2 border-[#2A2622] bg-[#FBEBDD] px-4 py-2 text-xs text-[#58423B]">
              Estas dos fotos se ven iguales. Puede ser la misma foto mandada otra vez, o dos fotos del mismo
              lugar desde el mismo ángulo. Tú decides.
            </p>
            <div className="grid gap-2 bg-[#2A2622] p-2 sm:grid-cols-2">
              {[{ url: entry.url, caption: thisCaption }, entry.compare].map(f => (
                <figure key={f.url} className="flex flex-col items-center gap-1">
                  <img src={f.url} alt={f.caption} className="max-h-[60vh] max-w-full object-contain" />
                  <figcaption className="mono text-[11px] text-[#F4C6B4]">{f.caption}</figcaption>
                </figure>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center bg-[#2A2622] p-2">
            <img src={entry.url} alt={entry.title ?? 'Evidencia'} className="max-h-[70vh] max-w-full object-contain" />
          </div>
        )}
      </div>
    </div>
  )
}

/** Miniatura de foto que abre el lightbox. */
export function PhotoThumb({ url, label, onOpen, className = '', duplicate = false }: {
  url: string
  label?: string
  onOpen: () => void
  className?: string
  /** Se ve igual a una foto anterior. */
  duplicate?: boolean
}) {
  return (
    <button
      onClick={onOpen}
      className={`group relative block aspect-[4/3] overflow-hidden border-2 border-[#2A2622] bg-[#2A2622] ${className}`}
      title="Ver foto"
    >
      <img src={url} alt={label ?? 'Evidencia'} className="h-full w-full object-cover transition-opacity group-hover:opacity-85" loading="lazy" />
      {duplicate && (
        <span className="chip chip-amber absolute left-1 top-1 inline-flex items-center gap-1" title="Se ve igual a una foto anterior">
          <Copy size={10} aria-hidden="true" /> Repetida
        </span>
      )}
      {label && (
        <span className="mono absolute inset-x-0 bottom-0 truncate bg-[#2A2622]/85 px-1.5 py-0.5 text-left text-[10px] text-white">
          {label}
        </span>
      )}
    </button>
  )
}
