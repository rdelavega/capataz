import type { BranchData } from '../api/client'
import { WorkerRow } from './WorkerRow'

interface Props {
  branch: BranchData
}

const SEMAFORO = {
  verde: { dot: 'bg-green-500', label: 'Al día', ring: 'ring-green-200' },
  amarillo: { dot: 'bg-yellow-400', label: 'Parcial', ring: 'ring-yellow-200' },
  rojo: { dot: 'bg-red-500', label: 'Atención', ring: 'ring-red-200' },
}

export function BranchCard({ branch }: Props) {
  const sem = SEMAFORO[branch.semaforo]
  return (
    <div className={`rounded-xl bg-white shadow-sm ring-1 ${sem.ring} overflow-hidden`}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <span className={`h-3 w-3 rounded-full ${sem.dot}`} />
        <h2 className="text-base font-semibold text-gray-800">{branch.name}</h2>
        <span className="ml-auto text-xs text-gray-400">{sem.label}</span>
        <span className="text-xs text-gray-400">{branch.workers.length} trabajadores</span>
      </div>

      {branch.workers.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-400 text-center">Sin trabajadores asignados</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {['Nombre', 'Teléfono', 'Estado', 'Check-in', 'Último evento', 'Tareas'].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wide first:pl-4"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
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
