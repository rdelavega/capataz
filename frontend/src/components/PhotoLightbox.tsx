import { X } from 'lucide-react'
import { useEffect } from 'react'

export interface LightboxEntry {
  url: string
  title: string | null
  subtitle?: string
}

export function PhotoLightbox({ entry, onClose }: { entry: LightboxEntry; onClose: () => void }) {
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
      <div className="relative w-full max-w-2xl border-2 border-[#2A2622] bg-[#FFF8F3] shadow-[8px_8px_0_0_#2A2622]">
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
        <div className="flex items-center justify-center bg-[#2A2622] p-2">
          <img src={entry.url} alt={entry.title ?? 'Evidencia'} className="max-h-[70vh] max-w-full object-contain" />
        </div>
      </div>
    </div>
  )
}

/** Miniatura de foto que abre el lightbox. */
export function PhotoThumb({ url, label, onOpen, className = '' }: {
  url: string
  label?: string
  onOpen: () => void
  className?: string
}) {
  return (
    <button
      onClick={onOpen}
      className={`group relative block aspect-[4/3] overflow-hidden border-2 border-[#2A2622] bg-[#2A2622] ${className}`}
      title="Ver foto"
    >
      <img src={url} alt={label ?? 'Evidencia'} className="h-full w-full object-cover transition-opacity group-hover:opacity-85" loading="lazy" />
      {label && (
        <span className="mono absolute inset-x-0 bottom-0 truncate bg-[#2A2622]/85 px-1.5 py-0.5 text-left text-[10px] text-white">
          {label}
        </span>
      )}
    </button>
  )
}
