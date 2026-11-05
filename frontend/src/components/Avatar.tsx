import { Camera, LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { deleteWorkerPhoto, uploadWorkerPhoto } from '../api/client'
import { initials } from '../lib/format'

/** Foto de perfil, o las iniciales si no tiene. El tamaño y la letra vienen en className/textClass. */
export function Avatar({ name, photoUrl, className = 'h-8 w-8', textClass = 'font-headline text-xs font-semibold' }: {
  name: string
  photoUrl?: string | null
  className?: string
  textClass?: string
}) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden border-2 border-[#2A2622] bg-[#ECE1D3] ${className}`}>
      {photoUrl
        ? <img src={photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        : <span className={textClass} aria-hidden="true">{initials(name)}</span>}
    </span>
  )
}

/** En la ficha: tocar la foto (o las iniciales) para subir o cambiar la foto de perfil. */
export function EditableAvatar({ workerId, name, photoUrl, onChanged }: {
  workerId: string
  name: string
  photoUrl: string | null
  onChanged: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setErr(null)
    try {
      await action()
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar la foto')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="group relative"
        aria-label={photoUrl ? `Cambiar foto de ${name}` : `Agregar foto de ${name}`}
        title={photoUrl ? 'Cambiar foto' : 'Agregar foto'}
      >
        <Avatar name={name} photoUrl={photoUrl} className="h-14 w-14" textClass="hl-md" />
        <span className={`absolute inset-0 flex items-center justify-center bg-[#2A2622]/55 text-white transition-opacity ${busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Camera size={18} />}
        </span>
        {!photoUrl && !busy && (
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center border-2 border-[#2A2622] bg-[#D85A30] text-white" aria-hidden="true">
            <Camera size={10} />
          </span>
        )}
      </button>
      {photoUrl && !busy && (
        <button type="button" onClick={() => run(() => deleteWorkerPhoto(workerId))}
          className="text-[11px] text-[#8C7169] underline underline-offset-2 hover:text-[#A32D2D]">
          Quitar
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          e.target.value = ''  // permitir volver a elegir la misma foto
          if (file) run(() => uploadWorkerPhoto(workerId, file))
        }}
      />
      {err && <p className="max-w-[9rem] text-center text-[11px] text-[#A32D2D]">{err}</p>}
    </div>
  )
}
