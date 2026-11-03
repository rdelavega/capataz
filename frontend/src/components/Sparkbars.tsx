import { fmtDia } from '../lib/format'

interface Props {
  values: (number | null)[]
  days: string[]
  /** Texto para el tooltip: recibe el valor y regresa '90%' o '2 tareas'. */
  format: (v: number) => string
  /** Pinta el último día en rojo (para métricas donde más es peor). */
  bad?: boolean
  label: string
}

const W = 200
const H = 40
const GAP = 2

/** Barras de los últimos días. Una serie, sin leyenda: el título de la tarjeta la nombra. */
export function Sparkbars({ values, days, format, bad, label }: Props) {
  const n = values.length
  const bw = (W - GAP * (n - 1)) / n
  const max = Math.max(1, ...values.map(v => v ?? 0))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-1 block h-10 w-full" role="img" aria-label={label}>
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#E0C0B6" strokeWidth={1} />
      {values.map((v, i) => {
        const last = i === n - 1
        const empty = v === null || v === 0
        const h = empty ? 2 : Math.max(3, (v / max) * (H - 4))
        const fill = v === null ? '#E0C0B6' : last ? (bad && v > 0 ? '#A32D2D' : '#D85A30') : '#2A2622'
        const tip = `${fmtDia(days[i])}: ${v === null ? 'descanso' : format(v)}`
        return (
          <g key={days[i]}>
            <rect x={i * (bw + GAP)} y={H - h} width={bw} height={h} fill={fill} opacity={last || v === null ? 1 : 0.78} />
            <rect x={i * (bw + GAP) - GAP / 2} y={0} width={bw + GAP} height={H} fill="transparent">
              <title>{tip}</title>
            </rect>
          </g>
        )
      })}
    </svg>
  )
}
