import type { WorkerData } from '../api/client'
import { StatusBadge } from './StatusBadge'

interface Props {
  worker: WorkerData
}

const EVENT_LABEL: Record<string, string> = {
  checkin: 'Check-in',
  photo: 'Foto',
  audio: 'Audio',
  location: 'Ubicación',
  text: 'Mensaje',
  unknown: 'Mensaje',
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export function WorkerRow({ worker }: Props) {
  return (
    <tr className="group border-t border-[var(--color-border)] transition-colors duration-100 hover:bg-[var(--color-surface)]">
      <td className="py-3 pl-5 pr-3">
        <span className="text-sm font-medium text-[var(--color-ink)]">{worker.name}</span>
      </td>
      <td className="px-3 py-3">
        <span className="font-mono text-xs text-[var(--color-muted)]">{worker.phone_number}</span>
      </td>
      <td className="px-3 py-3">
        <StatusBadge status={worker.today_status} />
      </td>
      <td className="px-3 py-3 tabular-nums text-sm text-[var(--color-muted)]">
        {fmtTime(worker.checkin_at)}
      </td>
      <td className="px-3 py-3 text-sm text-[var(--color-muted)]">
        {worker.last_event
          ? `${EVENT_LABEL[worker.last_event.type] ?? 'Mensaje'} · ${fmtTime(worker.last_event.received_at)}`
          : '—'}
      </td>
      <td className="py-3 pl-3 pr-5 text-right tabular-nums text-sm">
        {worker.overdue_jobs > 0 ? (
          <span className="badge-rojo inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium">
            {worker.active_jobs} · {worker.overdue_jobs} atr.
          </span>
        ) : (
          <span className="text-[var(--color-muted)]">{worker.active_jobs}</span>
        )}
      </td>
    </tr>
  )
}
