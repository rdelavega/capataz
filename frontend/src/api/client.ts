const API_URL = import.meta.env.VITE_API_URL ?? ''

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.json()
}

// ─── Overview ────────────────────────────────────────────────────────────────

export interface LastEvent {
  type: string
  received_at: string
}

export interface WorkerData {
  id: string
  name: string
  phone_number: string
  title: string | null
  branch_name: string
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

export const fetchOverview = () =>
  apiFetch<OverviewResponse>('/dashboard/overview')

// ─── Registros diarios ───────────────────────────────────────────────────────

export interface EventLog {
  id: string
  received_at: string
  worker_id: string | null
  worker_name: string | null
  branch_name: string | null
  event_type: string
  text_content: string | null
  media_url: string | null
  transcription: string | null
  latitude: number | null
  longitude: number | null
}

export interface EventsResponse {
  date: string
  events: EventLog[]
}

export const fetchEvents = (date?: string) =>
  apiFetch<EventsResponse>(`/dashboard/events${date ? `?date=${date}` : ''}`)

// ─── Equipo ──────────────────────────────────────────────────────────────────

export interface WorkerDetail {
  id: string
  name: string
  phone_number: string
  title: string | null
  branch_id: string | null
  branch_name: string | null
  active: boolean
  events_today: number
  last_event: LastEvent | null
}

export interface WorkersResponse {
  workers: WorkerDetail[]
}

export const fetchWorkers = () =>
  apiFetch<WorkersResponse>('/dashboard/workers')

// ─── Worker CRUD ─────────────────────────────────────────────────────────────

export interface BranchOption {
  id: string
  name: string
}

export interface BranchesResponse {
  branches: BranchOption[]
}

export interface WorkerCreate {
  name: string
  phone_number: string
  branch_id: string
  title?: string
}

export const fetchBranches = () =>
  apiFetch<BranchesResponse>('/workers/branches')

export const createWorker = (data: WorkerCreate) =>
  apiFetch<{ id: string; name: string }>('/workers', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateWorkerTitle = (id: string, title: string | null) =>
  apiFetch<{ ok: boolean }>(`/workers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })

export const deactivateWorker = (id: string) =>
  apiFetch<{ ok: boolean }>(`/workers/${id}`, { method: 'DELETE' })
