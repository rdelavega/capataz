import { ArrowDown, ArrowUp, CheckCircle2, MessageCircle, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AttentionItem, BranchStat, FeedItem, Metrics, TodayResponse } from '../api/client'
import { fetchToday } from '../api/client'
import type { Page } from '../components/Sidebar'
import { Sparkbars } from '../components/Sparkbars'
import { PhotoLightbox, PhotoThumb, type LightboxEntry } from '../components/PhotoLightbox'
import { useWorkerDrawer } from '../components/WorkerDrawer'
import { fmtCuando, fmtFechaLarga, fmtHora, firstName, plural, waLink } from '../lib/format'

const POLL_ACTIVE_MS  = 10_000
const POLL_PASSIVE_MS = 60_000

export function Dashboard({ userName, onNavigate }: { userName: string; onNavigate: (p: Page) => void }) {
  const [data, setData] = useState<TodayResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [photo, setPhoto] = useState<LightboxEntry | null>(null)
  const mounted = useRef(true)
  const { version } = useWorkerDrawer()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetchToday()
      if (mounted.current) { setData(r); setError(null) }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    load()
    let id = setInterval(load, document.hidden ? POLL_PASSIVE_MS : POLL_ACTIVE_MS)
    function onVisibility() {
      clearInterval(id)
      id = setInterval(load, document.hidden ? POLL_PASSIVE_MS : POLL_ACTIVE_MS)
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      mounted.current = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  useEffect(() => { if (version) load() }, [version, load])

  return (
    <div className="min-h-screen bg-[#F2EDE4]">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b-2 border-[#2A2622] bg-[#FFF8F3] px-4 py-3 shadow-[4px_4px_0_0_#2A2622] md:px-8 md:py-4">
        <div>
          <p className="label capitalize text-[#8C7169]">{data ? fmtFechaLarga(data.date) : ' '}</p>
          <h1 className="hl-md text-[#2A2622]">
            {data ? `${data.greeting}${userName ? `, ${firstName(userName)}` : ''}` : 'Hoy'}
          </h1>
        </div>
        <button onClick={load} disabled={loading} className="btn btn-primary px-3 py-2.5" aria-label="Actualizar">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">{loading ? 'Cargando…' : 'Actualizar'}</span>
        </button>
      </header>

      <main className="space-y-6 px-4 py-5 md:px-8 md:py-6">
        {error && (
          <div className="border-2 border-[#A32D2D] bg-[#FFF8F3] px-4 py-3">
            <span className="label text-[#A32D2D]">No se pudo cargar — </span>
            <span className="mono text-[#A32D2D]">{error}</span>
          </div>
        )}

        {!data && !error && (
          <div className="space-y-6">
            <div className="h-56 animate-pulse border-2 border-[#E0C0B6] bg-[#FFF8F3]" />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[0, 1, 2, 3].map(i => <div key={i} className="h-32 animate-pulse border-2 border-[#E0C0B6] bg-[#FFF8F3]" />)}
            </div>
          </div>
        )}

        {data && (
          <>
            <AttentionList items={data.attention} onNavigate={onNavigate} />
            <MetricTiles m={data.metrics} />
            <div className="grid items-start gap-6 2xl:grid-cols-[1.6fr_1fr]">
              <BranchTable branches={data.branches} />
              <Feed items={data.feed} onPhoto={setPhoto} />
            </div>
          </>
        )}
      </main>

      {photo && <PhotoLightbox entry={photo} onClose={() => setPhoto(null)} />}
    </div>
  )
}

// ─── Necesita tu atención ─────────────────────────────────────────────────────

const SEV_BAR: Record<string, string> = { urgent: 'bg-[#A32D2D]', review: 'bg-[#D85A30]', warn: 'bg-[#BA7517]' }
const SEV_LABEL: Record<string, string> = { urgent: 'Urgente', review: 'Revisar', warn: 'Ojo' }

function waText(item: AttentionItem): string {
  const n = firstName(item.worker_name)
  if (item.kind === 'no_llego') return `Hola ${n}, ¿todo bien? No tengo tu registro de hoy.`
  if (item.kind === 'tarea_atrasada' || item.kind === 'vence_hoy') return `Hola ${n}, ¿cómo va la tarea? Mándame foto del avance.`
  return `Hola ${n}, `
}

function AttentionList({ items, onNavigate }: { items: AttentionItem[]; onNavigate: (p: Page) => void }) {
  const { openWorker } = useWorkerDrawer()
  const urgent = items.filter(i => i.severity === 'urgent').length

  return (
    <section className="border-2 border-[#2A2622] bg-[#FFF8F3] shadow-hard" aria-labelledby="attn-title">
      <div className="flex items-center justify-between gap-3 border-b-2 border-[#2A2622] bg-[#2A2622] px-4 py-3 text-white">
        <h2 id="attn-title" className="hl-sm">Necesita tu atención</h2>
        <span className="mono text-xs text-[#F4C6B4]">
          {items.length === 0 ? 'nada pendiente' : `${plural(items.length, 'pendiente', 'pendientes')}${urgent ? ` · ${urgent} urgente${urgent > 1 ? 's' : ''}` : ''}`}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6">
          <CheckCircle2 size={28} className="shrink-0 text-[#639922]" aria-hidden="true" />
          <div>
            <p className="font-semibold">Todo en orden.</p>
            <p className="mono text-xs text-[#8C7169]">Nadie falta, no hay tareas atrasadas ni fotos por revisar.</p>
          </div>
        </div>
      ) : (
        <ul>
          {items.map(item => (
            <li key={item.id} className="grid grid-cols-[8px_1fr] border-b-2 border-[#E0C0B6] last:border-b-0 sm:grid-cols-[8px_1fr_auto]">
              <span className={SEV_BAR[item.severity]} aria-hidden="true" />
              <div className="min-w-0 px-4 py-3">
                <p className="font-semibold leading-snug">
                  <span className="sr-only">{SEV_LABEL[item.severity]}: </span>
                  {item.worker_id && item.worker_name && item.title.startsWith(item.worker_name) ? (
                    <>
                      <button className="underline decoration-[#E0C0B6] decoration-2 underline-offset-2 hover:decoration-[#D85A30]" onClick={() => openWorker(item.worker_id!)}>
                        {item.worker_name}
                      </button>
                      {item.title.slice(item.worker_name.length)}
                    </>
                  ) : item.title}
                </p>
                <p className="mono mt-0.5 text-xs text-[#8C7169]">{item.detail}</p>
              </div>
              <div className="col-start-2 flex items-center gap-2 px-4 pb-3 sm:col-start-3 sm:py-3">
                {item.action === 'whatsapp' && item.phone_number && (
                  <a className="btn btn-wa" href={waLink(item.phone_number, waText(item))} target="_blank" rel="noreferrer">
                    <MessageCircle size={13} /> Escribirle
                  </a>
                )}
                {item.action === 'review' && (
                  <button className="btn btn-primary" onClick={() => onNavigate('tareas')}>Revisar fotos</button>
                )}
                {item.action === 'tasks' && (
                  <button className="btn" onClick={() => onNavigate('tareas')}>Ver tarea</button>
                )}
                {(item.action === 'worker' || item.action === 'whatsapp') && item.worker_id && (
                  <button className="btn" onClick={() => openWorker(item.worker_id!)}>Ver ficha</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ─── Métricas ─────────────────────────────────────────────────────────────────

function Delta({ now, prev, unit, invert }: { now: number | null; prev: number | null; unit: string; invert?: boolean }) {
  if (now === null || prev === null) return <span className="mono text-xs text-[#8C7169]">sin datos de la semana pasada</span>
  const d = now - prev
  if (d === 0) return <span className="mono text-xs text-[#58423B]">igual que la semana pasada</span>
  const good = invert ? d < 0 : d > 0
  return (
    <span className={`mono inline-flex items-center gap-0.5 text-xs ${good ? 'text-[#4F7D1A]' : 'text-[#A32D2D]'}`}>
      {d > 0 ? <ArrowUp size={12} aria-label="subió" /> : <ArrowDown size={12} aria-label="bajó" />} {Math.abs(d)}{unit} vs semana pasada
    </span>
  )
}

function Tile({ label, children, chart }: { label: string; children: React.ReactNode; chart: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-2 border-[#2A2622] bg-[#FFF8F3] px-4 pb-3 pt-3.5">
      <span className="label text-[#58423B]">{label}</span>
      {children}
      <div className="mt-auto">{chart}</div>
    </div>
  )
}

function MetricTiles({ m }: { m: Metrics }) {
  const a = m.attendance
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Métricas">
      <Tile
        label="Llegaron hoy"
        chart={<Sparkbars values={a.series} days={m.days} format={v => `${v}% llegó`} label="Asistencia de los últimos 14 días" />}
      >
        <span className="hl-lg leading-none tabular-nums">
          {a.present}<span className="text-xl text-[#8C7169]">/{a.expected}</span>
        </span>
        <span className="mono text-xs text-[#58423B]">
          {a.rest_day ? 'hoy es día de descanso' : a.present === a.expected ? 'equipo completo' : `faltan ${a.expected - a.present}`}
        </span>
      </Tile>
      <Tile
        label="Llegaron a tiempo"
        chart={<Sparkbars values={m.on_time.series} days={m.days} format={v => `${v}% a tiempo`} label="Puntualidad de los últimos 14 días" />}
      >
        <span className="hl-lg leading-none tabular-nums">
          {m.on_time.week_pct ?? '—'}<span className="text-xl text-[#8C7169]">%</span>
        </span>
        <Delta now={m.on_time.week_pct} prev={m.on_time.prev_week_pct} unit=" pts" />
      </Tile>
      <Tile
        label="Tareas cerradas · 7 días"
        chart={<Sparkbars values={m.closed.series} days={m.days} format={v => plural(v, 'tarea cerrada', 'tareas cerradas')} label="Tareas cerradas por día" />}
      >
        <span className="hl-lg leading-none tabular-nums">{m.closed.week}</span>
        <span className="mono text-xs text-[#58423B]">{m.closed.week_with_photo} con foto de evidencia</span>
        <Delta now={m.closed.week} prev={m.closed.prev_week} unit="" />
      </Tile>
      <Tile
        label="Tareas atrasadas"
        chart={<Sparkbars values={m.overdue.series} days={m.days} format={v => plural(v, 'atrasada', 'atrasadas')} bad label="Tareas atrasadas por día" />}
      >
        <span className={`hl-lg leading-none tabular-nums ${m.overdue.now > 0 ? 'text-[#A32D2D]' : ''}`}>{m.overdue.now}</span>
        <span className="mono text-xs text-[#58423B]">
          de {m.overdue.active} activas · {plural(m.overdue.due_this_week, 'vence', 'vencen')} esta semana
        </span>
      </Tile>
    </section>
  )
}

// ─── Obras / sucursales ──────────────────────────────────────────────────────

const SEMAFORO: Record<BranchStat['semaforo'], { bar: string; chip: string }> = {
  rojo:     { bar: 'bg-[#A32D2D]', chip: 'chip chip-red'   },
  amarillo: { bar: 'bg-[#BA7517]', chip: 'chip chip-amber' },
  verde:    { bar: 'bg-[#639922]', chip: 'chip chip-green' },
}

function Meter({ value, total, left, right }: { value: number; total: number; left: string; right: string }) {
  const pct = total ? Math.round((100 * value) / total) : 0
  return (
    <div className="space-y-1">
      <div className="mono flex justify-between gap-2 whitespace-nowrap text-[11px] text-[#58423B]"><span>{left}</span><span>{right}</span></div>
      <div className="relative h-2 border border-[#8C7169] bg-[#E5DFD3]" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={left}>
        <div className="absolute inset-y-0 left-0 bg-[#2A2622]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function BranchTable({ branches }: { branches: BranchStat[] }) {
  return (
    <section className="border-2 border-[#2A2622] bg-[#FFF8F3]">
      <div className="flex items-center justify-between border-b-2 border-[#2A2622] px-4 py-2.5">
        <h2 className="hl-sm">Sucursales</h2>
        <span className="label text-[#8C7169]">semáforo de hoy</span>
      </div>
      {branches.length === 0 && <p className="mono px-4 py-8 text-center text-[#8C7169]">No hay sucursales todavía.</p>}
      <ul>
        {branches.map(b => {
          const s = SEMAFORO[b.semaforo]
          const done = b.jobs_done_week
          return (
            <li key={b.id} className="grid grid-cols-[8px_1fr_auto] border-b-2 border-[#E0C0B6] last:border-b-0 md:grid-cols-[8px_minmax(170px,1.3fr)_1fr_1fr_96px_auto]">
              <span className={s.bar} aria-hidden="true" />
              <div className="px-4 py-3">
                <p className="hl-sm text-[17px] leading-tight">{b.name}</p>
                <p className="mono text-[11px] text-[#8C7169]">
                  {b.jobs_review > 0 ? `${b.jobs_review} por revisar · ` : ''}{b.jobs_open} tareas abiertas
                </p>
              </div>
              <div className="hidden self-center pr-4 md:block">
                <Meter value={b.present} total={b.expected} left={`${b.present} de ${b.expected} llegaron`} right={b.expected ? `${Math.round((100 * b.present) / b.expected)}%` : '—'} />
              </div>
              <div className="hidden self-center pr-4 md:block">
                <Meter
                  value={done}
                  total={done + b.jobs_open}
                  left={`${done} cerradas (7 días)`}
                  right={b.jobs_overdue ? `${b.jobs_overdue} atrasada${b.jobs_overdue > 1 ? 's' : ''}` : 'al día'}
                />
              </div>
              <div className="mono hidden self-center pr-4 text-xs md:block">
                <span className="label block text-[10px] text-[#8C7169]">Última foto</span>
                {b.last_photo_at ? fmtCuando(b.last_photo_at).replace('hoy ', '') : '—'}
              </div>
              <div className="self-center pr-4">
                <span className={s.chip}>{b.reason}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ─── Lo último que llegó ─────────────────────────────────────────────────────

const FEED_VERB: Record<string, string> = {
  checkin: 'mandó "presente"', photo: 'mandó foto', audio: 'mandó audio',
  location: 'mandó ubicación', text: 'escribió', unknown: 'escribió',
}

function Feed({ items, onPhoto }: { items: FeedItem[]; onPhoto: (e: LightboxEntry) => void }) {
  const { openWorker } = useWorkerDrawer()
  return (
    <section className="border-2 border-[#2A2622] bg-[#FFF8F3]">
      <div className="flex items-center justify-between border-b-2 border-[#2A2622] px-4 py-2.5">
        <h2 className="hl-sm">Lo último que llegó</h2>
        <span className="label text-[#8C7169]">en vivo</span>
      </div>
      {items.length === 0 && <p className="mono px-4 py-8 text-center text-[#8C7169]">Hoy todavía no llega nada.</p>}
      <ul>
        {items.map(e => (
          <li key={e.id} className="grid grid-cols-[72px_1fr] gap-2 border-b-2 border-[#E0C0B6] px-4 py-2.5 last:border-b-0">
            <span className="mono whitespace-nowrap pt-0.5 text-xs font-bold">{fmtHora(e.received_at)}</span>
            <div className="min-w-0 text-sm">
              <p>
                {e.worker_id ? (
                  <button className="font-semibold hover:text-[#D85A30]" onClick={() => openWorker(e.worker_id!)}>{e.worker_name}</button>
                ) : <b>Desconocido</b>}{' '}
                {e.job_status === 'por_revisar' && e.type !== 'photo' ? 'terminó' : FEED_VERB[e.type] ?? 'escribió'}
                {e.job_title && <> · <b className="font-semibold">{e.job_title}</b></>}
              </p>
              {e.text && e.type !== 'checkin' && (
                <p className="mono truncate text-[11px] text-[#8C7169]">"{e.text}"</p>
              )}
              {e.media_url && e.type === 'photo' && (
                <PhotoThumb
                  url={e.media_url}
                  className="mt-1.5 w-24"
                  onOpen={() => onPhoto({ url: e.media_url!, title: e.worker_name, subtitle: fmtHora(e.received_at) })}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
