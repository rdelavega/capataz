import type { BranchData } from '../api/client'
import { WorkerRow } from './WorkerRow'

interface Props {
  branch: BranchData
}

const SEM = {
  verde:    { dot: 'bg-[var(--color-verde)]',    badge: 'badge-verde',    label: 'Al día'   },
  amarillo: { dot: 'bg-[var(--color-amarillo)]', badge: 'badge-amarillo', label: 'Parcial'  },
  rojo:     { dot: 'bg-[var(--color-rojo)]',     badge: 'badge-rojo',     label: 'Atención' },
}

const COLS = ['Nombre', 'Teléfono', 'Asistencia', 'Check-in', 'Último evento', 'Tareas']

export function BranchCard({ branch }: Props) {
  const sem = SEM[branch.semaforo]
  const activeWorkers = branch.workers.length

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4">
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${sem.dot}`} />
        <h2 className="text-sm font-semibold text-[var(--color-ink)] text-wrap-balance flex-1">
          {branch.name}
        </h2>
        <span className={`${sem.badge} inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium`}>
          {sem.label}
        </span>
        <span className="text-xs text-[var(--color-muted)] tabular-nums">
          {activeWorkers} {activeWorkers === 1 ? 'trabajador' : 'trabajadores'}
        </span>
      </div>

      {/* Table */}
      {activeWorkers === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[var(--color-muted)]">
          Sin trabajadores asignados
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
                {COLS.map((col, i) => (
                  <th
                    key={col}
                    className={`py-2 text-xs font-medium text-[var(--color-muted)] ${
                      i === 0 ? 'pl-5 pr-3 text-left' :
                      i === COLS.length - 1 ? 'pl-3 pr-5 text-right' :
                      'px-3 text-left'
                    }`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branch.workers.map((w) => (
                <WorkerRow key={w.id} worker={w} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
