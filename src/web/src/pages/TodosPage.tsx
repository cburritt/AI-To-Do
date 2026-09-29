import { useEffect, useState, type FormEvent } from 'react'
import { api, type Priority, type Todo } from '../api'
import { formatDateOnly, isPastDateOnly } from '../format'

export default function TodosPage({ active }: { active: boolean }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [error, setError] = useState<string | null>(null)

  const reload = () => api.todos.list().then(setTodos).catch((e) => setError(e.message))
  // Refresh when shown: the Today page can check off to-dos too.
  useEffect(() => { if (active) reload() }, [active])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await api.todos.create({ title, due: due || null, priority, notes: null })
      setTitle('')
      setDue('')
      setPriority('normal')
      reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function toggle(t: Todo) {
    await api.todos.update(t.id, { ...t, done: !t.done }).catch((e) => setError(e.message))
    reload()
  }

  async function remove(t: Todo) {
    await api.todos.remove(t.id).catch((e) => setError(e.message))
    reload()
  }

  const open = todos.filter((t) => !t.done)
  const done = todos.filter((t) => t.done)

  return (
    <section className="view">
      <header className="view-head"><h1>To-Do</h1></header>
      {error && <div className="banner error">{error}</div>}

      <form className="row-form" onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" aria-label="Task" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} aria-label="Priority">
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
        <button className="primary" type="submit">Add</button>
      </form>

      {open.length === 0 && <p className="muted">Nothing on your list.</p>}
      <ul className="list">
        {open.map((t) => (
          <li key={t.id}>
            <input type="checkbox" checked={false} onChange={() => toggle(t)} aria-label="Mark done" />
            <span className="grow">{t.title}</span>
            {t.priority === 'high' && <span className="pill high">High</span>}
            {t.due && <span className={`pill ${isPastDateOnly(t.due) ? 'bad' : ''}`}>{formatDateOnly(t.due)}</span>}
            <button className="icon-btn" onClick={() => remove(t)} aria-label="Delete">✕</button>
          </li>
        ))}
      </ul>

      {done.length > 0 && (
        <details className="done-wrap">
          <summary>Completed ({done.length})</summary>
          <ul className="list">
            {done.map((t) => (
              <li key={t.id} className="is-done">
                <input type="checkbox" checked onChange={() => toggle(t)} aria-label="Mark not done" />
                <span className="grow">{t.title}</span>
                <button className="icon-btn" onClick={() => remove(t)} aria-label="Delete">✕</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
