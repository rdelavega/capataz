import { MapPin, MapPinCheck, MapPinOff } from 'lucide-react'
import type { AttendanceStatus, CheckinLocation } from '../api/client'
import { fmtDistance, fmtHora } from '../lib/format'
import { useSite } from '../lib/site'

/** Estado de hoy en un solo chip, con hora. Es el único lugar donde se muestra. */
export function TodayStatus({ status, checkinAt }: { status: AttendanceStatus | null; checkinAt: string | null }) {
  if (status === 'presente') return <span className="chip chip-green">Llegó {fmtHora(checkinAt)}</span>
  if (status === 'tarde') return <span className="chip chip-amber">Tarde {fmtHora(checkinAt)}</span>
  if (status === 'ausente') return <span className="chip chip-red">No viene hoy</span>
  return <span className="chip chip-gray">Sin reporte</span>
}

const LOCATION_CLS: Record<CheckinLocation['status'], string> = {
  en_sitio:       'text-[#4F7D1A] font-semibold',
  // Lo único que el dueño tiene que notar: con fondo.
  lejos:          'border-2 border-[#2A2622] bg-[#BA7517] px-1.5 font-semibold text-white',
  sin_referencia: 'text-[#8C7169]',
  sin_ubicacion:  'text-[#8C7169]',
}

function locationTitle(status: CheckinLocation['status'], one: string): string {
  return {
    en_sitio: `Checó desde la ${one}`,
    lejos: `Checó lejos de la ${one}. Puede que lo hayan mandado a otro lado. Solo se guarda la distancia, no dónde estaba.`,
    sin_referencia: `Mandó su ubicación, pero la ${one} no tiene ubicación para comparar. Fíjala en Equipo.`,
    sin_ubicacion: 'Checó sin mandar su ubicación',
  }[status]
}

/**
 * Si el check-in de hoy se hizo desde la obra. Nunca muestra dónde estaba, solo la distancia.
 * ownBranch: la obra del trabajador. Si se pasa (p. ej. en una lista agrupada por obra),
 * no se repite su nombre: "En obra" / "A 2.4 km".
 */
export function LocationChip({ location, ownBranch }: { location: CheckinLocation | null; ownBranch?: string | null }) {
  const site = useSite()
  if (!location) return null
  const cls = LOCATION_CLS[location.status]
  const title = locationTitle(location.status, site.one)
  const Icon = location.status === 'en_sitio' ? MapPinCheck : location.status === 'lejos' ? MapPin : MapPinOff
  let label = location.label
  if (ownBranch !== undefined && location.branch_name === ownBranch) {
    if (location.status === 'en_sitio') label = `En ${site.one}`
    if (location.status === 'lejos' && location.distance_m !== null) label = `A ${fmtDistance(location.distance_m)}`
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs leading-5 ${cls}`} title={title}>
      <Icon size={12} aria-hidden="true" className="shrink-0" />
      {label}
    </span>
  )
}
