import type { BranchData } from '../api/client'
import { WorkerFicha } from './WorkerFicha'

interface Props {
  branch: BranchData
}

// Solo mostrar badge cuando hay algo que reportar — verde es silencio
const ALERT_CHIP: Partial<Record<string, { cls: string; label: string }>> = {
  amarillo: { cls: 'chip chip-amber', label: 'Parcial'   },
  rojo:     { cls: 'chip chip-red',   label: 'Atención'  },
}

export function BranchSection({ branch }: Props) {
  const alert = ALERT_CHIP[branch.semaforo]

  return (
    <section>
      <div className="mb-3 flex items-center justify-between border-b-2 border-[#2A2622] pb-2">
        <h2 className="hl-md text-[#D85A30]">{branch.name}</h2>
        <div className="flex items-center gap-3">
          {alert && <span className={alert.cls}>{alert.label}</span>}
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
