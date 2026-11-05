import type { DuplicateOf } from '../api/client'

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** '8:30 am' */
export function fmtHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const h = d.getHours() % 12 || 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`
}

function dayDiff(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((ua - ub) / 86_400_000)
}

/** Fecha local 'YYYY-MM-DD' → Date a mediodía (sin brincos de zona horaria). */
export function parseDay(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

/** 'hoy', 'ayer', 'mañana', 'vie 30 oct' */
export function fmtDia(dateOrIso: Date | string): string {
  const d = typeof dateOrIso === 'string'
    ? (dateOrIso.length === 10 ? parseDay(dateOrIso) : new Date(dateOrIso))
    : dateOrIso
  const diff = dayDiff(d, new Date())
  if (diff === 0) return 'hoy'
  if (diff === -1) return 'ayer'
  if (diff === 1) return 'mañana'
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`
}

/** 'hoy 8:30 am', 'ayer 6:10 pm', 'vie 30 oct 4:15 pm' */
export function fmtCuando(iso: string | null | undefined): string {
  if (!iso) return '—'
  return `${fmtDia(iso)} ${fmtHora(iso)}`
}

/** 'hace 5 min', 'hace 2 h', o fecha */
export function fmtHace(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'ahorita'
  if (mins < 60) return `hace ${mins} min`
  if (mins < 60 * 12) return `hace ${Math.round(mins / 60)} h`
  return fmtCuando(iso)
}

export function fmtFechaLarga(iso: string): string {
  return parseDay(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export function firstName(name: string | null | undefined): string {
  return (name ?? '').split(' ')[0]
}

/**
 * Link para escribirle al trabajador desde el WhatsApp del dueño. Es gratis y
 * siempre llega (no depende de la ventana de 24 h de la API).
 */
export function waLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export const EVENT_LABEL: Record<string, string> = {
  checkin: 'Llegada', photo: 'Foto', audio: 'Audio',
  location: 'Ubicación', text: 'Mensaje', unknown: 'Mensaje',
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** La foto anterior de una foto repetida, para mostrarlas lado a lado en el lightbox. */
export function compareWith(dup: DuplicateOf | null | undefined): { url: string; caption: string } | undefined {
  if (!dup?.url) return undefined
  return { url: dup.url, caption: `Anterior · ${dup.worker_name ?? 'otro trabajador'} · ${fmtCuando(dup.received_at)}` }
}
