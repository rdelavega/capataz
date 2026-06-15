import type { BranchData } from '../api/client'
import { WorkerFicha } from './WorkerFicha'

interface Props {
  branch: BranchData
}

const SEM_CHIP: Record<string, string> = {
  verde:    'chip chip-green',
  amarillo: 'chip chip-amber',
  rojo:     'chip chip-red',
}
const SEM_LABEL: Record<string, string> = {
  verde: 'Al día', amarillo: 'Parcial', rojo: 'Atención',
}

export function BranchSection({ branch }: Props) {
  return (
    <section>
      {/* Section header — black bar */}
      <div className="mb-3 flex items-center justify-between border-b-2 border-[#2A2622] pb-2">
        <h2 className="hl-md text-[#2A2622]">{branch.name}</h2>
        <div className="flex items-center gap-3">
          <span className={SEM_CHIP[branch.semaforo]}>{SEM_LABEL[branch.semaforo]}</span>
          <span className="label text-[#8C7169]">
            {branch.workers.length} {branch.workers.length === 1 ? 'trabajador' : 'trabajadores'}
          </span>
        </div>
      </div>

      {branch.workers.length === 0 ? (
        <p className="mono py-6 text-center text-[#8C7169]">Sin trabajadores asignados</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branch.workers.map((w) => (
            <WorkerFicha key={w.id} worker={w} />
          ))}
        </div>
      )}
    </section>
  )
}
