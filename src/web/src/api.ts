export type Priority = 'low' | 'normal' | 'high'

export interface Todo {
  id: number
  title: string
  due: string | null
  priority: Priority
  notes: string | null
  done: boolean
  createdAt: string
  completedAt: string | null
}

export interface Internship {
  id: number
  company: string
  role: string
  status: string
  deadline: string | null
  appliedOn: string | null
  link: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CanvasItem {
  uid: string
  title: string
  course: string
  dueUtc: string | null
  allDay: boolean
  url: string | null
  done: boolean
}

export interface CanvasResponse {
  connected: boolean
  error: string | null
  lastSyncUtc: string | null
  items: CanvasItem[]
}

export type Source = 'canvas' | 'todo' | 'internship'

export interface Plan {
  headline: string
  focus: { title: string; source: Source; ref_id: string; reason: string; estimate_minutes: number }[]
  later_this_week: { title: string; source: Source; due_label: string }[]
  heads_up: string[]
}

export interface PlanResponse {
  plan: Plan
  note: string | null
  generatedAt: string
}

export type PlannerMode = 'claude-code' | 'api'

export interface SettingsStatus {
  plannerMode: PlannerMode
  hasCanvasFeed: boolean
  hasApiKey: boolean
}

export interface ClaudeCodeStatus {
  installed: boolean
  loggedIn: boolean
  detail: string | null
}

export interface SettingsInput {
  canvasFeedUrl?: string
  anthropicApiKey?: string
  plannerMode?: PlannerMode
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const body = await res.json()
      msg = typeof body === 'string' ? body : body.detail ?? body.title ?? msg
    } catch { /* keep default */ }
    throw new Error(msg)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export type TodoInput = Pick<Todo, 'title' | 'due' | 'priority' | 'notes'> & { done?: boolean }
export type InternshipInput = Omit<Internship, 'id' | 'createdAt' | 'updatedAt'>

export const api = {
  todos: {
    list: () => request<Todo[]>('/todos'),
    create: (t: TodoInput) => request<Todo>('/todos', json('POST', t)),
    update: (id: number, t: TodoInput) => request<Todo>(`/todos/${id}`, json('PUT', t)),
    remove: (id: number) => request<void>(`/todos/${id}`, { method: 'DELETE' }),
  },
  internships: {
    statuses: () => request<string[]>('/internships/statuses'),
    list: () => request<Internship[]>('/internships'),
    create: (i: InternshipInput) => request<Internship>('/internships', json('POST', i)),
    update: (id: number, i: InternshipInput) => request<Internship>(`/internships/${id}`, json('PUT', i)),
    remove: (id: number) => request<void>(`/internships/${id}`, { method: 'DELETE' }),
  },
  canvas: {
    items: () => request<CanvasResponse>('/canvas/items'),
    sync: () => request<CanvasResponse>('/canvas/sync', { method: 'POST' }),
    setDone: (uid: string, done: boolean) =>
      request<CanvasItem>(`/canvas/items/${encodeURIComponent(uid)}/done`, json('PUT', { done })),
  },
  plan: {
    today: () => request<PlanResponse | undefined>('/plan/today'),
    generate: () => request<PlanResponse>('/plan/generate', { method: 'POST' }),
  },
  settings: {
    get: () => request<SettingsStatus>('/settings'),
    save: (s: SettingsInput) => request<SettingsStatus>('/settings', json('PUT', s)),
    claudeCode: () => request<ClaudeCodeStatus>('/settings/claude-code'),
  },
}
