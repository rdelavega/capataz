import type { WorkerData } from '../api/client'
import { StatusBadge } from './StatusBadge'

interface Props {
  worker: WorkerData
}

const EVENT_LABELS: Record<string, string> = {
  checkin: 'Check-in',
  photo: 'Foto',
  audio: 'Audio',
  location: 'Ubicación',
  text: 'Mensaje',
  unknown: 'Mensaje',
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export function WorkerRow({ worker }: Props) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="whitespace-nowrap py-3 pl-4 pr-3 text-sm font-medium text-gray-900">
        {worker.name}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
        {worker.phone_number}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm">
        <StatusBadge status={worker.today_status} />
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
        {formatTime(worker.checkin_at)}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-500">
        {worker.last_event
          ? `${EVENT_LABELS[worker.last_event.type] ?? worker.last_event.type} · ${formatTime(worker.last_event.received_at)}`
          : '—'}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-center">
        <span className={worker.overdue_jobs > 0 ? 'font-semibold text-red-600' : 'text-gray-700'}>
          {worker.active_jobs}
        </span>
        {worker.overdue_jobs > 0 && (
          <span className="ml-1 text-red-500">({worker.overdue_jobs} atr.)</span>
        )}
      </td>
    </tr>
  )
}
