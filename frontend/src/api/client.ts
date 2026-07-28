const API_URL = import.meta.env.VITE_API_URL ?? ''

const TOKEN_KEY = 'capataz_token'
const USER_KEY  = 'capataz_user'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, { headers, ...init })

  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    window.location.reload()
    throw new Error('Sesión expirada')
  }
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.json()
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  name: string
  email: string
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (res.status === 401) throw new Error('Email o contraseña incorrectos')
  if (!res.ok) throw new Error(`Error ${res.status}`)
  const data = await res.json()
  localStorage.setItem(TOKEN_KEY, data.access_token)
  const user: AuthUser = { name: data.name, email: data.email }
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  return user
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
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

export const createBranch = (name: string) =>
  apiFetch<{ id: string; name: string }>('/workers/branches', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

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

// ─── Jobs / Tareas ───────────────────────────────────────────────────────────

export interface JobData {
  id: string
  title: string
  description: string | null
  status: 'pendiente' | 'en_progreso' | 'completado' | 'atrasado'
  due_date: string | null
  worker_id: string | null
  worker_name: string | null
  branch_id: string | null
  branch_name: string | null
  created_at: string
  updated_at: string
}

export interface JobsResponse {
  jobs: JobData[]
}

export interface JobCreate {
  title: string
  description?: string
  worker_id?: string
  due_date?: string
}

export interface JobUpdate {
  title?: string
  description?: string
  status?: string
  worker_id?: string
  due_date?: string
}

export const fetchJobs = (status?: string) =>
  apiFetch<JobsResponse>(`/jobs${status ? `?status=${status}` : ''}`)

export const createJob = (data: JobCreate) =>
  apiFetch<{ id: string }>('/jobs', { method: 'POST', body: JSON.stringify(data) })

export const updateJob = (id: string, data: JobUpdate) =>
  apiFetch<{ ok: boolean }>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteJob = (id: string) =>
  apiFetch<{ ok: boolean }>(`/jobs/${id}`, { method: 'DELETE' })

export const remindJob = (id: string) =>
  apiFetch<{ ok: boolean }>(`/jobs/${id}/remind`, { method: 'POST' })

export const remindWorker = (id: string) =>
  apiFetch<{ ok: boolean }>(`/workers/${id}/remind`, { method: 'POST' })
