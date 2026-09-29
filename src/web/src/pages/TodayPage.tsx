import { useCallback, useEffect, useState } from 'react'
import { api, type CanvasResponse, type PlanResponse, type Todo } from '../api'
import { formatDue, isPast, minutes } from '../format'

const SOURCE_LABEL = { canvas: 'Canvas', todo: 'To-Do', internship: 'Internship' } as const

// Internship tasks in the plan (e.g. "follow up with X") have nothing to mark done
// on the server, so plan checkmarks are also remembered per day in the browser.
function checkedKey() {
  return `plan-checked-${new Date().toDateString()}`
}
function loadChecked(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(checkedKey()) ?? '[]'))
  } catch {
    return new Set()
  }
}
function saveChecked(s: Set<string>) {
  try {
    localStorage.setItem(checkedKey(), JSON.stringify([...s]))
  } catch { /* storage unavailable */ }
}

export default function TodayPage() {
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [canvas, setCanvas] = useState<CanvasResponse | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [checked, setChecked] = useState<Set<string>>(loadChecked)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadCanvas = useCallback(() => api.canvas.items().then(setCanvas).catch((e) => setError(e.message)), [])

  useEffect(() => {
    api.plan.today().then((p) => setPlan(p ?? null)).catch((e) => setError(e.message))
    api.todos.list().then(setTodos).catch(() => {})
    loadCanvas()
  }, [loadCanvas])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      setPlan(await api.plan.generate())
      loadCanvas()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function toggleFocus(refId: string) {
    const next = new Set(checked)
    const done = !next.has(refId)
    if (done) next.add(refId)
    else next.delete(refId)
    setChecked(next)
    saveChecked(next)

    const [source, ...rest] = refId.split(':')
    const id = rest.join(':')
    try {
      if (source === 'canvas') {
        await api.canvas.setDone(id, done)
        loadCanvas()
      } else if (source === 'todo') {
        const t = todos.find((x) => x.id === Number(id))
        if (t) {
          const updated = await api.todos.update(t.id, { ...t, done })
          setTodos((ts) => ts.map((x) => (x.id === t.id ? updated : x)))
        }
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function toggleCanvas(uid: string, done: boolean) {
    try {
      await api.canvas.setDone(uid, done)
      setCanvas((c) => c && { ...c, items: c.items.map((i) => (i.uid === uid ? { ...i, done } : i)) })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  const totalMin = plan?.plan.focus.reduce((n, f) => n + f.estimate_minutes, 0) ?? 0

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h1>{today}</h1>
          <p className="muted">
            {plan
              ? `Plan made ${new Date(plan.generatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · about ${minutes(totalMin)} of work`
              : 'No plan yet today.'}
          </p>
        </div>
        <button className="primary" onClick={generate} disabled={generating}>
          {generating ? 'Planning…' : plan ? 'Regenerate plan' : 'Generate plan'}
        </button>
      </header>

      {error && <div className="banner error">{error}</div>}
      {plan?.note && <div className="banner warn">{plan.note}</div>}

      {plan ? (
        <>
          <p className="headline">{plan.plan.headline}</p>
          <ol className="focus">
            {plan.plan.focus.map((f) => (
              <li key={f.ref_id + f.title} className={`src-${f.source} ${checked.has(f.ref_id) ? 'checked' : ''}`}>
                <input type="checkbox" checked={checked.has(f.ref_id)} onChange={() => toggleFocus(f.ref_id)} />
                <div className="f-main">
                  <div className="tag">{SOURCE_LABEL[f.source]}</div>
                  <div className="f-title">{f.title}</div>
                  <div className="f-reason">{f.reason}</div>
                </div>
                <div className="f-est">{minutes(f.estimate_minutes)}</div>
              </li>
            ))}
          </ol>

          {(plan.plan.later_this_week.length > 0 || plan.plan.heads_up.length > 0) && (
            <div className="two-col">
              {plan.plan.later_this_week.length > 0 && (
                <div>
                  <h2>Later this week</h2>
                  <ul className="list">
                    {plan.plan.later_this_week.map((l, i) => (
                      <li key={i} className={`src-${l.source}`}>
                        <span className="dot" />
                        <span className="grow">{l.title}</span>
                        <span className="pill">{l.due_label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {plan.plan.heads_up.length > 0 && (
                <div>
                  <h2>Heads up</h2>
                  <ul className="heads-up">
                    {plan.plan.heads_up.map((h, i) => <li key={i}>{h}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="card empty-plan">
          <p>Click <b>Generate plan</b> and Claude will build today's list from your Canvas coursework, to-dos, and internship deadlines.</p>
        </div>
      )}

      <h2>Canvas: next 2 weeks</h2>
      {canvas && !canvas.connected && (
        <p className="muted">Canvas isn't connected. Add your calendar feed link in <a href="#settings">Settings</a>.</p>
      )}
      {canvas?.connected && canvas.error && <div className="banner warn">{canvas.error}</div>}
      {canvas?.connected && canvas.items.length === 0 && <p className="muted">Nothing due in the next two weeks.</p>}
      <ul className="list">
        {canvas?.items.map((i) => (
          <li key={i.uid} className={i.done ? 'is-done' : ''}>
            <input type="checkbox" checked={i.done} onChange={() => toggleCanvas(i.uid, !i.done)} title="Mark done" />
            <div className="grow">
              {i.url ? <a href={i.url} target="_blank" rel="noreferrer">{i.title}</a> : i.title}
              <div className="sub">{i.course}</div>
            </div>
            {i.dueUtc && (
              <span className={`pill ${!i.done && isPast(i.dueUtc) ? 'bad' : ''}`}>{formatDue(i.dueUtc, i.allDay)}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
