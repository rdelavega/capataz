import type { DayCode } from '../api/client'
import { fmtDia } from '../lib/format'

const CODE_LABEL: Record<DayCode, string> = {
  p: 'a tiempo', t: 'llegó tarde', f: 'faltó', d: 'descanso', n: 'sin reporte aún', '-': 'aún no trabajaba',
}

/** 30 días en miniatura para filas de tabla. Faltas más cortas: se leen sin color. */
export function AttendanceStrip({ codes }: { codes: DayCode[] }) {
  const height: Record<DayCode, string> = { p: '100%', t: '100%', f: '35%', d: '18%', n: '18%', '-': '0' }
  return (
    <div className="flex h-4 items-end gap-px" aria-label="Asistencia de los últimos 30 días">
      {codes.map((c, i) => (
        <i
          key={i}
          className={`block w-1 ${c === 'p' ? 'bg-[#2A2622]' : c === 't' ? 'bg-[#BA7517]' : c === 'f' ? 'bg-[#A32D2D]' : 'bg-[#E0C0B6]'}`}
          style={{ height: height[c] }}
        />
      ))}
    </div>
  )
}

/** Qué significa cada barra de AttendanceStrip. */
export function StripLegend({ className = '' }: { className?: string }) {
  const items: [string, string, string][] = [
    ['bg-[#2A2622]', 'h-3', 'A tiempo'], ['bg-[#BA7517]', 'h-3', 'Tarde'],
    ['bg-[#A32D2D]', 'h-1.5', 'Faltó'], ['bg-[#E0C0B6]', 'h-1', 'Descanso'],
  ]
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#58423B] ${className}`}>
      <span className="font-semibold">Asistencia, últimos 30 días:</span>
      {items.map(([bg, h, label]) => (
        <span key={label} className="inline-flex items-end gap-1">
          <i className={`block w-1 ${bg} ${h}`} aria-hidden="true" />{label}
        </span>
      ))}
    </div>
  )
}

/** Calendario de la ficha: un cuadro por día. */
export function AttendanceCalendar({ days }: { days: { date: string; code: DayCode }[] }) {
  return (
    <div>
      <div className="grid grid-cols-10 gap-[3px] sm:grid-cols-15">
        {days.map(({ date, code }, i) => {
          const tip = `${fmtDia(date)}: ${CODE_LABEL[code]}`
          return (
            <i
              key={date}
              title={tip}
              aria-label={tip}
              className={`day-${code} relative block aspect-square border border-[#2A2622]/35 ${i === days.length - 1 ? 'outline-2 outline-offset-1 outline-[#2A2622]' : ''}`}
            >
              {code === 'f' && (
                <span className="mono absolute inset-0 grid place-items-center text-[10px] font-bold leading-none text-white">×</span>
              )}
            </i>
          )
        })}
      </div>
      <div className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#58423B]">
        <Legend cls="day-p" label="A tiempo" />
        <Legend cls="day-t" label="Tarde" />
        <Legend cls="day-f" label="Faltó" />
        <Legend cls="day-d" label="Descanso" />
      </div>
    </div>
  )
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={`${cls} inline-block h-3 w-3 border border-[#2A2622]/35`} />
      {label}
    </span>
  )
}
