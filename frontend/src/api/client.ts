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

// ─── Panel de hoy ────────────────────────────────────────────────────────────

export interface LastEvent {
  type: string
  received_at: string
}

export type Severity = 'urgent' | 'review' | 'warn'

export interface AttentionItem {
  id: string
  severity: Severity
  kind: 'no_llego' | 'ausente' | 'tarea_atrasada' | 'vence_hoy' | 'por_revisar' | 'tarde_repetido' | 'obra_sin_fotos'
  title: string
  detail: string
  action: 'whatsapp' | 'review' | 'worker' | 'tasks' | 'none'
  worker_id?: string | null
  worker_name?: string | null
  phone_number?: string | null
  job_id?: string
  branch_id?: string
  count?: number
}

export interface Metrics {
  days: string[]
  attendance: { present: number; expected: number; rest_day: boolean; series: (number | null)[] }
  on_time: { week_pct: number | null; prev_week_pct: number | null; series: (number | null)[] }
  closed: { week: number; week_with_photo: number; prev_week: number; series: number[] }
  overdue: { now: number; active: number; due_this_week: number; series: number[] }
}

export interface BranchStat {
  id: string
  name: string
  semaforo: 'verde' | 'amarillo' | 'rojo'
  reason: string
  present: number
  expected: number
  jobs_done_week: number
  jobs_open: number
  jobs_overdue: number
  jobs_review: number
  last_photo_at: string | null
}

export interface FeedItem {
  id: string
  type: string
  received_at: string
  worker_id: string | null
  worker_name: string | null
  branch_name: string | null
  text: string | null
  media_url: string | null
  job_title: string | null
  job_status: string | null
}

export interface TodayResponse {
  date: string
  now: string
  greeting: string
  attention: AttentionItem[]
  metrics: Metrics
  branches: BranchStat[]
  feed: FeedItem[]
}

export const fetchToday = () => apiFetch<TodayResponse>('/dashboard/today')

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

export type AttendanceStatus = 'presente' | 'ausente' | 'tarde'
/** p a tiempo · t tarde · f faltó · d descanso · n hoy sin reporte · - aún no trabajaba */
export type DayCode = 'p' | 't' | 'f' | 'd' | 'n' | '-'

export interface WorkerDetail {
  id: string
  name: string
  phone_number: string
  title: string | null
  branch_id: string | null
  branch_name: string | null
  active: boolean
  today_status: AttendanceStatus | null
  checkin_at: string | null
  last_event: LastEvent | null
  active_jobs: number
  overdue_jobs: number
  attendance_30d: DayCode[]
  attendance_pct: number | null
  late_week: number
}

export interface WorkersResponse {
  workers: WorkerDetail[]
  date: string
}

export const fetchWorkers = () =>
  apiFetch<WorkersResponse>('/dashboard/workers')

export interface JobCardData {
  id: string
  title: string
  status: JobStatus
  due_date: string | null
  overdue: boolean
  completed_at: string | null
  photo_count: number
  last_photo_at: string | null
  bot_asked_at: string | null
}

export interface PhotoData {
  id: string
  url: string
  received_at: string
  caption: string | null
  job_title?: string | null
}

export interface WorkerSummary {
  worker: WorkerDetail
  month: {
    from: string
    to: string
    days_worked: number
    days_expected: number
    days_late: number
    days_absent: number
    avg_checkin: string | null
    jobs_done: number
    jobs_done_with_photo: number
    jobs_overdue: number
  }
  calendar: { date: string; code: DayCode }[]
  today: {
    id: string
    type: string
    received_at: string
    text: string | null
    media_url: string | null
    job_title: string | null
  }[]
  jobs: JobCardData[]
  photos: PhotoData[]
  photo_total: number
}

export const fetchWorkerSummary = (id: string) =>
  apiFetch<WorkerSummary>(`/workers/${id}/summary`)

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

export type JobStatus = 'pendiente' | 'en_progreso' | 'por_revisar' | 'completado' | 'atrasado'

export interface JobData extends JobCardData {
  description: string | null
  worker_id: string | null
  worker_name: string | null
  worker_phone: string | null
  branch_id: string | null
  branch_name: string | null
  approved_at: string | null
  closed_at: string | null
  review_note: string | null
  photos: PhotoData[]
  created_at: string
  updated_at: string
}

export interface JobsResponse {
  jobs: JobData[]
  date: string
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
  status?: JobStatus
  worker_id?: string
  due_date?: string
}

export const fetchJobs = () => apiFetch<JobsResponse>('/jobs')

export const createJob = (data: JobCreate) =>
  apiFetch<{ id: string }>('/jobs', { method: 'POST', body: JSON.stringify(data) })

export const updateJob = (id: string, data: JobUpdate) =>
  apiFetch<{ ok: boolean }>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(data) })

export const deleteJob = (id: string) =>
  apiFetch<{ ok: boolean }>(`/jobs/${id}`, { method: 'DELETE' })

export const approveJob = (id: string) =>
  apiFetch<{ ok: boolean }>(`/jobs/${id}/approve`, { method: 'POST' })

export const rejectJob = (id: string, note: string) =>
  apiFetch<{ ok: boolean; notified: boolean }>(`/jobs/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })

/** El bot le pregunta al trabajador cómo va la tarea, con botones. */
export const remindJob = (id: string) =>
  apiFetch<{ ok: boolean }>(`/jobs/${id}/remind`, { method: 'POST' })
