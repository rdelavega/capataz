import { Copy, ExternalLink, MapPin, Mic } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { ActivityKind, DayResponse, DayWorker, EventLog, EventsResponse } from '../api/client'
import { fetchDay, fetchEvents } from '../api/client'
import { Avatar } from '../components/Avatar'
import { PhotoLightbox, PhotoThumb, type LightboxEntry } from '../components/PhotoLightbox'
import { LocationChip, TodayStatus } from '../components/TodayStatus'
import { useWorkerDrawer } from '../components/WorkerDrawer'
import { compareWith, fmtHora } from '../lib/format'
import { useSite } from '../lib/site'
import { usePolling } from '../lib/usePolling'

const TYPE_LABEL: Record<string, string> = {
  checkin:  'Check-in',
  photo:    'Foto',
  audio:    'Audio',
  location: 'Ubicación',
  text:     'Mensaje',
  unknown:  'Mensaje',
}
const TYPE_CHIP: Record<string, string> = {
  checkin:  'chip chip-green',
  photo:    'chip chip-amber',
  audio:    'chip chip-amber',
  location: 'chip chip-gray',
  text:     'chip chip-gray',
  unknown:  'chip chip-gray',
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ─── Fila de evento ───────────────────────────────────────────────────────────

function EventRow({ ev, onPhoto }: { ev: EventLog; onPhoto: (entry: LightboxEntry) => void }) {
  const content = ev.transcription ?? ev.text_content
  const isPhoto = ev.event_type === 'photo' && ev.media_url

  return (
    <tr className="border-b border-[#E0C0B6] hover:bg-[#FDF2E4] transition-colors">
      <td className="mono whitespace-nowrap px-4 py-3 text-[#2A2622]">{fmtTime(ev.received_at)}</td>
      <td className="whitespace-nowrap px-4 py-3">
        <span className="text-sm font-semibold text-[#2A2622]">{ev.worker_name ?? <span className="font-normal text-[#8C7169]">Desconocido</span>}</span>
      </td>
      <td className="px-4 py-3">
        <span className={TYPE_CHIP[ev.event_type] ?? 'chip chip-gray'}>
          {TYPE_LABEL[ev.event_type] ?? ev.event_type}
        </span>
      </td>
      <td className="px-4 py-3">
        {isPhoto ? (
          <div className="flex items-center gap-2">
          <button
            onClick={() => onPhoto({ url: ev.media_url!, title: ev.worker_name, subtitle: fmtTime(ev.received_at), compare: compareWith(ev.duplicate_of) })}
            className="group relative block"
            title="Ver foto"
          >
            <img
              src={ev.media_url!}
              alt="Foto"
              className="h-16 w-16 border-2 border-[#2A2622] object-cover shadow-[2px_2px_0_0_#2A2622] transition-transform group-hover:scale-105"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-[#2A2622]/0 group-hover:bg-[#2A2622]/30 transition-colors">
              <span className="opacity-0 group-hover:opacity-100 label text-white text-xs transition-opacity">Ver</span>
            </div>
          </button>
          {ev.duplicate_of && (
            <span className="inline-flex items-center gap-1 border border-[#2A2622] bg-[#BA7517] px-1.5 text-xs font-semibold leading-5 text-white" title="Se ve igual a una foto anterior. Ábrela para compararlas.">
              <Copy size={11} aria-hidden="true" /> Repetida
            </span>
          )}
          </div>
        ) : (
          <>
            {ev.media_url && (
              <a
                href={ev.media_url}
                target="_blank"
                rel="noreferrer"
                className="label inline-flex items-center gap-1 text-[#D85A30] underline underline-offset-2"
              >
                Ver archivo <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
            {content && (
              <p className="text-sm mt-0.5 truncate text-[#2A2622]">{content}</p>
            )}
            {ev.job_title && (
              <p className="text-xs text-[#58423B]">Trabajo: <b className="font-semibold">{ev.job_title}</b></p>
            )}
            {ev.location_label && (
              <p className="text-sm inline-flex items-center gap-1 text-[#58423B]">
                <MapPin size={13} aria-hidden="true" className="shrink-0" />
                {ev.location_label}
              </p>
            )}
            {!ev.media_url && !content && !ev.location_label && (
              <span className="text-sm text-[#8C7169]">—</span>
            )}
          </>
        )}
      </td>
    </tr>
  )
}

// ─── Por persona ──────────────────────────────────────────────────────────────

const ACTIVITY_CLS: Record<ActivityKind, string> = {
  photo: 'text-[#58423B]', enterado: 'text-[#58423B]', en_progreso: 'text-[#58423B]',
  termino: 'font-semibold text-[#4F7D1A]', problema: 'font-semibold text-[#A32D2D]', problema_detalle: 'text-[#A32D2D]',
}

function WorkerDayCard({ w, onPhoto }: { w: DayWorker; onPhoto: (e: LightboxEntry) => void }) {
  const { openWorker } = useWorkerDrawer()
  const site = useSite()
  const nothing = w.messages === 0
  return (
    <article className={`space-y-3 border-2 border-[#2A2622] bg-[#FFF8F3] p-4 ${nothing ? 'opacity-70' : ''}`}>
      <header className="flex items-start gap-3">
        <Avatar name={w.name} photoUrl={w.photo_url} className="h-10 w-10" textClass="font-headline text-sm font-semibold" />
        <div className="min-w-0 flex-1">
          <button onClick={() => openWorker(w.id)} className="truncate text-left font-semibold hover:text-[#D85A30]">{w.name}</button>
          <p className="truncate text-xs text-[#8C7169]">{w.title ?? 'Sin puesto'}{!w.active && ' · dado de baja'}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <TodayStatus status={w.attendance?.status ?? null} checkinAt={w.attendance?.checkin_at ?? null} />
          <LocationChip location={w.attendance?.location ?? null} />
        </div>
      </header>

      {nothing && <p className="text-sm text-[#8C7169]">No mandó nada este día.</p>}

      {w.jobs.length > 0 && (
        <section>
          <h3 className="label mb-1 text-[#8C7169]">Trabajos</h3>
          <ul className="space-y-2">
            {w.jobs.map(j => (
              <li key={j.job_id} className="border-l-[3px] border-[#2A2622] pl-2.5">
                <p className="text-sm font-semibold leading-snug">{j.title}</p>
                <p className="text-xs leading-relaxed">
                  {j.activity.filter(a => a.kind !== 'problema_detalle').map((a, i) => (
                    <span key={i} className={ACTIVITY_CLS[a.kind]}>
                      {i > 0 && <span className="text-[#C9B8AE]"> · </span>}
                      {a.label} <span className="mono text-[#8C7169]">{fmtHora(a.at)}</span>
                    </span>
                  ))}
                </p>
                {j.activity.filter(a => a.kind === 'problema_detalle').map((a, i) => (
                  <q key={i} className="mt-1 block text-xs italic text-[#A32D2D]">{a.text}</q>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {w.photos.length > 0 && (
        <section>
          <h3 className="label mb-1 text-[#8C7169]">Fotos · {w.photos.length}</h3>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {w.photos.map(p => (
              <PhotoThumb
                key={p.id}
                url={p.url}
                duplicate={!!p.duplicate_of}
                label={fmtHora(p.received_at)}
                onOpen={() => onPhoto({ url: p.url, title: p.job_title ?? w.name, subtitle: `${w.name} · ${fmtHora(p.received_at)}`, compare: compareWith(p.duplicate_of) })}
              />
            ))}
          </div>
        </section>
      )}

      {w.reports.length > 0 && (
        <section>
          <h3 className="label mb-1 text-[#8C7169]">Lo que reportó</h3>
          <ul className="space-y-1.5">
            {w.reports.map(r => (
              <li key={r.id} className="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
                <span className="mono pt-px text-xs text-[#8C7169]">{fmtHora(r.received_at)}</span>
                <span className="flex items-start gap-1.5">
                  {r.type === 'audio' && <Mic size={13} className="mt-0.5 shrink-0 text-[#8C7169]" aria-label="Audio" />}
                  <span>{r.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!nothing && w.jobs.length === 0 && w.photos.length === 0 && w.reports.length === 0 && (
        <p className="text-sm text-[#8C7169]">Solo checó su llegada{w.attendance?.location ? '' : ` (sin ubicación de la ${site.one})`}.</p>
      )}
    </article>
  )
}

function DayView({ day, onPhoto }: { day: DayResponse; onPhoto: (e: LightboxEntry) => void }) {
  if (day.branches.length === 0) {
    return (
      <div className="border-2 border-[#E0C0B6] bg-[#FFF8F3] px-6 py-12 text-center">
        <p className="hl-sm text-[#8C7169]">Sin trabajadores</p>
      </div>
    )
  }
  return (
    <>
      {day.branches.map(b => {
        const reported = b.workers.filter(w => w.messages > 0).length
        return (
          <section key={b.id ?? 'sin'}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-[#2A2622] pb-2">
              <h2 className="hl-md text-[#2A2622]">{b.name}</h2>
              <span className="text-xs text-[#58423B]">{reported} de {b.workers.length} reportaron</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {b.workers.map(w => <WorkerDayCard key={w.id} w={w} onPhoto={onPhoto} />)}
            </div>
          </section>
        )
      })}
    </>
  )
}

// ─── Todos los mensajes ───────────────────────────────────────────────────────

function AllMessages({ data, selectedDate, onPhoto }: { data: EventsResponse; selectedDate: string; onPhoto: (e: LightboxEntry) => void }) {
  const site = useSite()
  const byBranch = data.events.reduce<Record<string, EventLog[]>>((acc, ev) => {
    const key = ev.branch_name ?? `Sin ${site.one}`
    ;(acc[key] ??= []).push(ev)
    return acc
  }, {})
  if (data.events.length === 0) {
    return (
      <div className="border-2 border-[#E0C0B6] bg-[#FFF8F3] px-6 py-12 text-center">
        <p className="hl-sm text-[#8C7169]">Sin registros</p>
        <p className="text-sm mt-2 text-[#8C7169]">No hay mensajes para esta fecha.</p>
      </div>
    )
  }
  return (
    <>
      {Object.entries(byBranch).map(([branchName, events]) => (
        <section key={branchName}>
          <div className="mb-3 flex items-center justify-between border-b-2 border-[#2A2622] pb-2">
            <h2 className="hl-md text-[#2A2622]">{branchName}</h2>
            <span className="text-xs text-[#58423B]">{events.length} mensajes</span>
          </div>
          <div className="overflow-x-auto border-2 border-[#2A2622] bg-[#FFF8F3]">
            <div className="flex items-center justify-between bg-[#2A2622] px-4 py-2">
              <span className="label text-white">Todos los mensajes</span>
              <span className="label text-[#8C7169]">{new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b-2 border-[#2A2622] bg-[#ECE1D3]">
                  {['Hora', 'Trabajador', 'Tipo', 'Contenido'].map(h => (
                    <th key={h} className="label px-4 py-2 text-left text-[#58423B]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map(ev => <EventRow key={ev.id} ev={ev} onPhoto={onPhoto} />)}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

type View = 'persona' | 'mensajes'
const VIEW_KEY = 'capataz_registros_vista'

function savedView(): View {
  try { return localStorage.getItem(VIEW_KEY) === 'mensajes' ? 'mensajes' : 'persona' } catch { return 'persona' }
}

export function RegistrosDiarios() {
  const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD en hora local
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [view, setViewState]            = useState<View>(savedView)
  const [day, setDay]                   = useState<DayResponse | null>(null)
  const [data, setData]                 = useState<EventsResponse | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [lightbox, setLightbox]         = useState<LightboxEntry | null>(null)

  function setView(v: View) {
    setViewState(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* sin almacenamiento: solo no se recuerda */ }
  }

  const load = useCallback(async (d: string, v: View, silent = false) => {
    if (!silent) setLoading(true)
    try {
      if (v === 'persona') setDay(await fetchDay(d))
      else setData(await fetchEvents(d))
      setError(null)
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Error')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { load(selectedDate, view) }, [load, selectedDate, view])
  // Solo el día de hoy cambia: los días pasados no se vuelven a pedir.
  usePolling(useCallback(() => { load(selectedDate, view, true) }, [load, selectedDate, view]), selectedDate === todayStr)

  const current = view === 'persona' ? day?.date === selectedDate && day : data?.date === selectedDate && data
  const total = view === 'persona' ? day?.messages : data?.events.length

  return (
    <div className="min-h-screen bg-[#F2EDE4]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 md:gap-6 border-b-2 border-[#2A2622] bg-[#FFF8F3] px-4 py-3 md:px-8 md:py-4 shadow-[4px_4px_0_0_#2A2622]">
        <h1 className="hl-md text-[#2A2622]">Registros diarios</h1>
        <div className="flex items-center gap-2 border-2 border-[#2A2622] bg-white px-3 py-1.5 shadow-hard-sm">
          <label className="label text-[#8C7169]" htmlFor="date-pick">Fecha</label>
          <input
            id="date-pick"
            type="date"
            value={selectedDate}
            max={todayStr}
            onChange={e => setSelectedDate(e.target.value)}
            className="mono border-none bg-transparent text-[#2A2622] outline-none"
          />
        </div>
        <div className="flex border-2 border-[#2A2622]" role="group" aria-label="Vista">
          {([['persona', 'Por persona'], ['mensajes', 'Todos los mensajes']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
              className={`label px-3 py-1.5 transition-colors ${view === v ? 'bg-[#2A2622] text-white' : 'bg-[#FFF8F3] text-[#2A2622] hover:bg-[#ECE1D3]'}`}>
              {label}
            </button>
          ))}
        </div>
        {loading && <span className="label text-[#8C7169]">Cargando...</span>}
        {total !== undefined && (
          <span className="ml-auto text-xs text-[#8C7169]">{total} {total === 1 ? 'mensaje' : 'mensajes'} en el día</span>
        )}
      </header>

      <main className="px-4 py-5 md:px-8 md:py-6 space-y-8">
        {error && (
          <div className="border-2 border-[#A32D2D] bg-[#FFF8F3] px-4 py-3">
            <span className="label text-[#A32D2D]">Error — </span>
            <span className="text-sm text-[#A32D2D]">{error}</span>
          </div>
        )}

        {view === 'persona' && day && current && <DayView day={day} onPhoto={setLightbox} />}
        {view === 'mensajes' && data && current && <AllMessages data={data} selectedDate={selectedDate} onPhoto={setLightbox} />}

        {loading && !current && (
          <div className="h-64 animate-pulse border-2 border-[#E0C0B6] bg-[#FFF8F3]" />
        )}
      </main>

      {lightbox && <PhotoLightbox entry={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
