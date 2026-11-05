import { Bot, Camera, CheckCircle2, Flag, MessageCircle, Plus, TriangleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { JobDetail, JobHistoryItem } from '../api/client'
import { approveJob, fetchJobDetail, rejectJob, remindJob } from '../api/client'
import { compareWith, fmtCuando, fmtDia, fmtHora, firstName } from '../lib/format'
import { usePolling } from '../lib/usePolling'
import { PhotoLightbox, PhotoThumb, type LightboxEntry } from './PhotoLightbox'
import { useWorkerDrawer } from './WorkerDrawer'

const STATUS_CHIP: Record<string, { cls: string; label: string }> = {
  pendiente:   { cls: 'chip chip-gray',   label: 'Pendiente' },
  en_progreso: { cls: 'chip chip-gray',   label: 'En curso' },
  por_revisar: { cls: 'chip chip-orange', label: 'Por revisar' },
  atrasado:    { cls: 'chip chip-red',    label: 'Con problema' },
  completado:  { cls: 'chip chip-green',  label: 'Terminada' },
}

/** Ícono de cada paso de la historia (lucide, sin emojis). */
function HistoryIcon({ kind }: { kind: string }) {
  const cls = 'shrink-0'
  if (kind === 'creado') return <Plus size={13} className={cls} />
  if (kind === 'bot' || kind === 'bot_error') return <Bot size={13} className={cls} />
  if (kind === 'photo') return <Camera size={13} className={cls} />
  if (kind === 'termino' || kind === 'aprobado') return <CheckCircle2 size={13} className={cls} />
  if (kind === 'problema' || kind === 'problema_detalle') return <TriangleAlert size={13} className={cls} />
  if (kind === 'enterado') return <Flag size={13} className={cls} />
  return <MessageCircle size={13} className={cls} />
}

const HISTORY_COLOR: Record<string, string> = {
  termino: 'text-[#4F7D1A]', aprobado: 'text-[#4F7D1A]',
  problema: 'text-[#A32D2D]', problema_detalle: 'text-[#A32D2D]', bot_error: 'text-[#A32D2D]',
}

/** Panel lateral con todo sobre un trabajo: datos, fotos, historia y acciones. */
export function JobDrawer({ jobId, onClose, onChanged }: { jobId: string; onClose: () => void; onChanged: () => void }) {
  const { openWorker } = useWorkerDrawer()
  const [data, setData] = useState<JobDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [photo, setPhoto] = useState<LightboxEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    fetchJobDetail(jobId)
      .then(r => { setData(r); setError(null) })
      .catch(e => setError(e instanceof Error ? e.message : 'Error al cargar'))
  }, [jobId])

  useEffect(() => { load() }, [load])  // el padre pone key={jobId}: cada trabajo arranca vacío
  usePolling(load)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !photo) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, photo])

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      if (ok) setMsg(ok)
      load()
      onChanged()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo')
    } finally {
      setBusy(false)
    }
  }

  const j = data
  const chip = j ? STATUS_CHIP[j.overdue && j.status !== 'por_revisar' && j.status !== 'completado' ? 'atrasado' : j.status] : null
  const n = firstName(j?.contact_name)
  const open = j && ['pendiente', 'en_progreso', 'atrasado'].includes(j.status)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#2A2622]/40" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <aside
        className="drawer-in flex h-full w-full max-w-[520px] flex-col overflow-y-auto border-l-2 border-[#2A2622] bg-[#FFF8F3]"
        aria-label={j ? `Trabajo: ${j.title}` : 'Trabajo'}
      >
        <div className="sticky top-0 z-10 space-y-2 border-b-2 border-[#2A2622] bg-[#FFF8F3] px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="hl-md leading-tight text-[#2A2622]">{j?.title ?? 'Cargando…'}</h2>
              {j && (
                <p className="mt-1 text-xs text-[#58423B]">
                  {j.contact_id ? (
                    <button className="font-semibold underline decoration-[#E0C0B6] decoration-2 underline-offset-2 hover:decoration-[#D85A30]"
                      onClick={() => openWorker(j.contact_id!)}>{j.assignee}</button>
                  ) : j.assignee}
                  {j.branch_name && ` · ${j.branch_name}`}
                  {' · '}{j.due_date ? `vence ${fmtDia(j.due_date)}` : 'sin fecha'}
                </p>
              )}
            </div>
            {chip && <span className={chip.cls}>{chip.label}</span>}
            <button onClick={onClose} className="btn btn-sm h-8 w-8 p-0" aria-label="Cerrar"><X size={14} /></button>
          </div>
        </div>

        {error && <p className="px-5 py-6 text-sm text-[#A32D2D]">{error}</p>}
        {!j && !error && <div className="m-5 h-48 animate-pulse border-2 border-[#E0C0B6]" />}

        {j && (
          <div className="space-y-5 px-5 py-5">
            {j.description && <p className="whitespace-pre-line text-sm text-[#2A2622]">{j.description}</p>}

            {j.status === 'atrasado' && j.problem_at && (
              <Box tone="red" title="Reportó un problema">
                {j.problem_note ? `“${j.problem_note}”` : `Todavía no dice qué pasó (avisó a las ${fmtHora(j.problem_at)}).`}
              </Box>
            )}
            {j.review_note && j.status !== 'completado' && (
              <Box tone="amber" title="Se lo regresaste">“{j.review_note}”</Box>
            )}

            {/* Acciones */}
            <div className="space-y-2">
              {j.status === 'por_revisar' && !rejecting && (
                <div className="flex gap-2">
                  <button className="btn btn-primary flex-1" disabled={busy} onClick={() => run(() => approveJob(j.id))}>Aprobar</button>
                  <button className="btn flex-1" disabled={busy} onClick={() => setRejecting(true)}>Regresar</button>
                </div>
              )}
              {rejecting && (
                <form className="space-y-2" onSubmit={e => {
                  e.preventDefault()
                  if (note.trim()) run(() => rejectJob(j.id, note.trim()), `Le avisamos a ${n} por WhatsApp.`).then(() => { setRejecting(false); setNote('') })
                }}>
                  <label htmlFor="reject-note" className="label text-[#58423B]">¿Qué le falta?</label>
                  <textarea id="reject-note" value={note} onChange={e => setNote(e.target.value)} rows={2} autoFocus
                    className="w-full border-2 border-[#2A2622] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#D85A30]" />
                  <div className="flex gap-2">
                    <button type="submit" className="btn btn-primary flex-1" disabled={busy || !note.trim()}>Regresar con nota</button>
                    <button type="button" className="btn" onClick={() => setRejecting(false)}>Cancelar</button>
                  </div>
                </form>
              )}
              {open && j.contact_id && (
                <button className="btn w-full" disabled={busy} onClick={() => run(() => remindJob(j.id), `El bot ya le preguntó a ${n}.`)}>
                  <Bot size={14} /> Que el bot le pregunte a {n} cómo va
                </button>
              )}
              {msg && <p className="text-xs text-[#58423B]">{msg}</p>}
            </div>

            {/* Fotos */}
            <Section title={`Fotos · ${j.photos.length}`}>
              {j.photos.length === 0 ? (
                <p className="text-sm text-[#8C7169]">Todavía no hay fotos de este trabajo.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {j.photos.map(p => (
                    <PhotoThumb key={p.id} url={p.url} duplicate={!!p.duplicate_of} label={fmtCuando(p.received_at)}
                      onOpen={() => setPhoto({ url: p.url, title: j.title, subtitle: fmtCuando(p.received_at), compare: compareWith(p.duplicate_of) })} />
                  ))}
                </div>
              )}
            </Section>

            {/* Historia */}
            <Section title="Historia">
              <ol className="space-y-2.5">
                {j.history.map((h, i) => <HistoryRow key={i} h={h} onPhoto={setPhoto} title={j.title} />)}
              </ol>
              {j.history.length <= 1 && (
                <p className="mt-2 text-xs text-[#8C7169]">Cuando contesten por WhatsApp, aquí aparece.</p>
              )}
            </Section>
          </div>
        )}
      </aside>
      {photo && <PhotoLightbox entry={photo} onClose={() => setPhoto(null)} />}
    </div>
  )
}

function HistoryRow({ h, onPhoto, title }: { h: JobHistoryItem; onPhoto: (e: LightboxEntry) => void; title: string }) {
  return (
    <li className="grid grid-cols-[92px_1fr] gap-x-3">
      <span className="mono pt-0.5 text-[11px] text-[#8C7169]">{fmtCuando(h.at)}</span>
      <div className="min-w-0 text-sm">
        <p className={`flex items-center gap-1.5 ${HISTORY_COLOR[h.kind] ?? 'text-[#2A2622]'}`}>
          <HistoryIcon kind={h.kind} />
          <span>{h.label}{h.who && <span className="text-[#8C7169]"> · {h.who}</span>}</span>
        </p>
        {h.text && <q className="mt-0.5 block border-l-[3px] border-[#E0C0B6] pl-2 text-[13px] italic text-[#58423B]">{h.text}</q>}
        {h.photo && (
          <PhotoThumb url={h.photo.url} className="mt-1 w-28" duplicate={!!h.photo.duplicate_of}
            onOpen={() => onPhoto({ url: h.photo!.url, title, subtitle: fmtCuando(h.at), compare: compareWith(h.photo!.duplicate_of) })} />
        )}
      </div>
    </li>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="label mb-2 border-b-2 border-[#2A2622] pb-1 text-[#2A2622]">{title}</h3>
      {children}
    </section>
  )
}

function Box({ tone, title, children }: { tone: 'red' | 'amber'; title: string; children: ReactNode }) {
  const border = tone === 'red' ? 'border-[#A32D2D]' : 'border-[#BA7517]'
  const color = tone === 'red' ? 'text-[#A32D2D]' : 'text-[#8A5410]'
  return (
    <div className={`border-l-[4px] ${border} bg-[#FBEBDD] px-3 py-2 text-sm`}>
      <b className={`block text-xs font-semibold ${color}`}>{title}</b>
      {children}
    </div>
  )
}
