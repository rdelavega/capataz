import { MapPin, MapPinCheck, MapPinOff } from 'lucide-react'
import type { AttendanceStatus, CheckinLocation } from '../api/client'
import { fmtHora } from '../lib/format'

/** Estado de hoy en un solo chip, con hora. Es el único lugar donde se muestra. */
export function TodayStatus({ status, checkinAt }: { status: AttendanceStatus | null; checkinAt: string | null }) {
  if (status === 'presente') return <span className="chip chip-green">Llegó {fmtHora(checkinAt)}</span>
  if (status === 'tarde') return <span className="chip chip-amber">Tarde {fmtHora(checkinAt)}</span>
  if (status === 'ausente') return <span className="chip chip-red">No viene hoy</span>
  return <span className="chip chip-gray">Sin reporte</span>
}

const LOCATION_CHIP: Record<CheckinLocation['status'], { cls: string; title: string }> = {
  en_sitio:       { cls: 'chip chip-green', title: 'Checó desde la obra' },
  lejos:          { cls: 'chip chip-amber', title: 'Checó lejos de la obra. Puede que lo hayan mandado a otro lado. Solo se guarda la distancia, no dónde estaba.' },
  sin_referencia: { cls: 'chip chip-gray',  title: 'Mandó su ubicación, pero la obra no tiene ubicación para comparar. Fíjala en Equipo.' },
  sin_ubicacion:  { cls: 'chip chip-gray',  title: 'Checó sin mandar su ubicación' },
}

/** Si el check-in de hoy se hizo desde la obra. Nunca muestra dónde estaba, solo la distancia. */
export function LocationChip({ location }: { location: CheckinLocation | null }) {
  if (!location) return null
  const { cls, title } = LOCATION_CHIP[location.status]
  const Icon = location.status === 'en_sitio' ? MapPinCheck : location.status === 'lejos' ? MapPin : MapPinOff
  return (
    <span className={`${cls} inline-flex items-center gap-1`} title={title}>
      <Icon size={11} aria-hidden="true" />
      {location.label}
    </span>
  )
}
