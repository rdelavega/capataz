const API_URL = import.meta.env.VITE_API_URL ?? ''

export interface LastEvent {
  type: string
  received_at: string
}

export interface WorkerData {
  id: string
  name: string
  phone_number: string
  today_status: 'presente' | 'ausente' | 'tarde' | null
  checkin_at: string | null
  last_event: LastEvent | null
  active_jobs: number
  overdue_jobs: number
}

export interface BranchData {
  id: string
  name: string
  workers: WorkerData[]
  semaforo: 'verde' | 'amarillo' | 'rojo'
}

export interface OverviewResponse {
  branches: BranchData[]
  date: string
}

export async function fetchOverview(): Promise<OverviewResponse> {
  const res = await fetch(`${API_URL}/dashboard/overview`)
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.json()
}
