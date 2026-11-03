import type { AttendanceStatus } from '../api/client'
import { fmtHora } from '../lib/format'

/** Estado de hoy en un solo chip, con hora. Es el único lugar donde se muestra. */
export function TodayStatus({ status, checkinAt }: { status: AttendanceStatus | null; checkinAt: string | null }) {
  if (status === 'presente') return <span className="chip chip-green">Llegó {fmtHora(checkinAt)}</span>
  if (status === 'tarde') return <span className="chip chip-amber">Tarde {fmtHora(checkinAt)}</span>
  if (status === 'ausente') return <span className="chip chip-red">No viene hoy</span>
  return <span className="chip chip-gray">Sin reporte</span>
}
