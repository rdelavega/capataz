import { useEffect, useRef, useState } from 'react'
import type { EventLog, EventsResponse } from '../api/client'
import { fetchEvents } from '../api/client'

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

// ─── Lightbox ─────────────────────────────────────────────────────────────────

interface LightboxEntry { url: string; worker: string | null; time: string }

function PhotoLightbox({ entry, onClose }: { entry: LightboxEntry; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2A2622]/80 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative max-w-2xl w-full border-2 border-[#2A2622] bg-[#FFF8F3] shadow-[8px_8px_0_0_#2A2622]">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#2A2622] bg-[#ECE1D3] px-4 py-3">
          <div>
            <span className="label text-[#2A2622]">{entry.worker ?? 'Trabajador'}</span>
            <span className="mono text-xs text-[#8C7169] ml-3">{entry.time}</span>
          </div>
          <button
            onClick={onClose}
            className="label flex h-7 w-7 items-center justify-center border-2 border-[#2A2622] text-[#58423B] hover:bg-[#2A2622] hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {/* Image */}
        <div className="bg-[#2A2622] flex items-center justify-center p-2">
          <img
            src={entry.url}
            alt="Evidencia"
            className="max-h-[70vh] max-w-full object-contain"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Fila de evento ───────────────────────────────────────────────────────────

function EventRow({ ev, onPhoto }: { ev: EventLog; onPhoto: (entry: LightboxEntry) => void }) {
  const content = ev.transcription ?? ev.text_content
  const isPhoto = ev.event_type === 'photo' && ev.media_url

  return (
    <tr className="border-b border-[#E0C0B6] hover:bg-[#FDF2E4] transition-colors">
      <td className="mono whitespace-nowrap px-4 py-3 text-[#2A2622]">{fmtTime(ev.received_at)}</td>
      <td className="px-4 py-3">
        <span className="label text-[#58423B]">{ev.branch_name ?? '—'}</span>
      </td>
      <td className="px-4 py-3">
        <span className="label text-[#2A2622]">{ev.worker_name ?? <span className="text-[#8C7169]">Desconocido</span>}</span>
      </td>
      <td className="px-4 py-3">
        <span className={TYPE_CHIP[ev.event_type] ?? 'chip chip-gray'}>
          {TYPE_LABEL[ev.event_type] ?? ev.event_type}
        </span>
      </td>
      <td className="px-4 py-3">
        {isPhoto ? (
          <button
            onClick={() => onPhoto({ url: ev.media_url!, worker: ev.worker_name, time: fmtTime(ev.received_at) })}
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
        ) : (
          <>
            {ev.media_url && (
              <a
                href={ev.media_url}
                target="_blank"
                rel="noreferrer"
                className="label text-[#D85A30] underline underline-offset-2"
              >
                Ver archivo ↗
              </a>
            )}
            {content && (
              <p className="mono mt-0.5 truncate text-[#2A2622]">{content}</p>
            )}
            {ev.latitude != null && ev.longitude != null && (
              <p className="mono text-[#8C7169]">
                {ev.latitude.toFixed(5)}, {ev.longitude.toFixed(5)}
              </p>
            )}
            {!ev.media_url && !content && ev.latitude == null && (
              <span className="mono text-[#8C7169]">—</span>
            )}
          </>
        )}
      </td>
    </tr>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function RegistrosDiarios() {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [data, setData]                 = useState<EventsResponse | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [lightbox, setLightbox]         = useState<LightboxEntry | null>(null)

  async function load(d: string) {
    setLoading(true)
    try {
      const r = await fetchEvents(d)
      setData(r)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(selectedDate) }, [selectedDate])

  const byBranch = data
    ? data.events.reduce<Record<string, EventLog[]>>((acc, ev) => {
        const key = ev.branch_name ?? 'Sin sucursal'
        ;(acc[key] ??= []).push(ev)
        return acc
      }, {})
    : {}

  return (
    <div className="min-h-screen bg-[#F2EDE4]">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-6 border-b-2 border-[#2A2622] bg-[#FFF8F3] px-8 py-4 shadow-[4px_4px_0_0_#2A2622]">
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
        {loading && <span className="label text-[#8C7169]">Cargando...</span>}
        {data && (
          <span className="label ml-auto text-[#8C7169]">
            {data.events.length} {data.events.length === 1 ? 'registro' : 'registros'}
          </span>
        )}
      </header>

      <main className="px-8 py-6 space-y-8">
        {error && (
          <div className="border-2 border-[#A32D2D] bg-[#FFF8F3] px-4 py-3">
            <span className="label text-[#A32D2D]">Error — </span>
            <span className="mono text-[#A32D2D]">{error}</span>
          </div>
        )}

        {data && data.events.length === 0 && (
          <div className="border-2 border-[#E0C0B6] bg-[#FFF8F3] px-6 py-12 text-center">
            <p className="hl-sm text-[#8C7169]">Sin registros</p>
            <p className="mono mt-2 text-[#8C7169]">No hay mensajes para esta fecha.</p>
          </div>
        )}

        {Object.entries(byBranch).map(([branchName, events]) => (
          <section key={branchName}>
            <div className="mb-3 flex items-center justify-between border-b-2 border-[#2A2622] pb-2">
              <h2 className="hl-md text-[#2A2622]">{branchName}</h2>
              <span className="label text-[#8C7169]">{events.length} registros</span>
            </div>

            <div className="overflow-x-auto border-2 border-[#2A2622] bg-[#FFF8F3]">
              <div className="flex items-center justify-between bg-[#2A2622] px-4 py-2">
                <span className="label text-white">Bitácora de mensajes</span>
                <span className="label text-[#8C7169]">{new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b-2 border-[#2A2622] bg-[#ECE1D3]">
                    {['Hora', 'Sucursal', 'Trabajador', 'Tipo', 'Contenido'].map(h => (
                      <th key={h} className="label px-4 py-2 text-left text-[#58423B]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {events.map(ev => (
                    <EventRow key={ev.id} ev={ev} onPhoto={setLightbox} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        {loading && !data && (
          <div className="h-64 animate-pulse border-2 border-[#E0C0B6] bg-[#FFF8F3]" />
        )}
      </main>

      {lightbox && <PhotoLightbox entry={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
