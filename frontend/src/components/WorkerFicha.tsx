import type { WorkerData } from '../api/client'
import { StatusBadge } from './StatusBadge'

interface Props {
  worker: WorkerData
}

const EVENT_LABEL: Record<string, string> = {
  checkin: 'Check-in', photo: 'Foto', audio: 'Audio',
  location: 'Ubic.', text: 'Mensaje', unknown: 'Mensaje',
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

const BAR_COLOR: Record<string, string> = {
  presente: '#639922',
  tarde:    '#BA7517',
  ausente:  '#A32D2D',
}

const STAMP: Record<string, { cls: string; label: string }> = {
  presente: { cls: 'stamp stamp-green', label: 'Presente' },
  tarde:    { cls: 'stamp stamp-amber', label: 'Tarde'    },
  ausente:  { cls: 'stamp stamp-red',   label: 'Ausente'  },
}

export function WorkerFicha({ worker }: Props) {
  const barColor = BAR_COLOR[worker.today_status ?? ''] ?? '#8C7169'
  const stamp = STAMP[worker.today_status ?? '']

  return (
    <div className="card-press shadow-hard relative flex overflow-hidden border-2 border-[#2A2622] bg-[#FFF8F3]">
      {/* Status bar */}
      <div className="w-3 shrink-0" style={{ backgroundColor: barColor }} />

      <div className="flex flex-1 flex-col gap-3 p-4">
        {/* Avatar + name */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-[#2A2622] bg-[#ECE1D3]"
            aria-hidden="true"
          >
            <span className="hl-sm text-[#2A2622]">{initials(worker.name)}</span>
          </div>
          <div className="min-w-0">
            <h3 className="hl-sm leading-tight text-[#2A2622]">{worker.name}</h3>
            <p className="label mt-0.5 text-[#D85A30]">
              {worker.title ?? worker.branch_name}
            </p>
            <p className="mono text-[#8C7169]">{worker.phone_number}</p>
          </div>
        </div>

        {/* Data grid */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t-2 border-[#E0C0B6] pt-3">
          <div>
            <dt className="label text-[#8C7169]">Check-in</dt>
            <dd className="mono mt-0.5 text-[#2A2622]">{fmtTime(worker.checkin_at)}</dd>
          </div>
          <div>
            <dt className="label text-[#8C7169]">Último evento</dt>
            <dd className="mono mt-0.5 text-[#2A2622]">
              {worker.last_event
                ? `${EVENT_LABEL[worker.last_event.type]} · ${fmtTime(worker.last_event.received_at)}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="label text-[#8C7169]">Tareas activas</dt>
            <dd className="mono mt-0.5 text-[#2A2622]">{worker.active_jobs}</dd>
          </div>
          {worker.overdue_jobs > 0 && (
            <div>
              <dt className="label text-[#A32D2D]">Atrasadas</dt>
              <dd className="mono mt-0.5 font-bold text-[#A32D2D]">{worker.overdue_jobs}</dd>
            </div>
          )}
        </dl>

        {/* Bottom: status badge */}
        <div className="mt-auto">
          <StatusBadge status={worker.today_status} />
        </div>
      </div>

      {/* Rubber stamp — corner */}
      {stamp && (
        <div
          className="pointer-events-none absolute -bottom-1 -right-1 rotate-[-5deg]"
          aria-hidden="true"
        >
          <span className={stamp.cls}>{stamp.label}</span>
        </div>
      )}
    </div>
  )
}
