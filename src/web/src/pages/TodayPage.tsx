import { useCallback, useEffect, useState } from 'react'
import { api, type CanvasItem, type CanvasResponse, type InboxResponse, type PlanResponse, type Todo } from '../api'
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

// Canvas is re-downloaded in the background when the saved copy is older than this.
const CANVAS_STALE_MS = 15 * 60_000

export default function TodayPage({ active }: { active: boolean }) {
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [canvas, setCanvas] = useState<CanvasResponse | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [inbox, setInbox] = useState<InboxResponse | null>(null)
  const [loadingInbox, setLoadingInbox] = useState(false)
  const [todos, setTodos] = useState<Todo[]>([])
  const [checked, setChecked] = useState<Set<string>>(loadChecked)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadCanvas = useCallback(() => api.canvas.items().then(setCanvas).catch((e) => setError(e.message)), [])

  const syncCanvas = useCallback(async () => {
    setSyncing(true)
    try {
      setCanvas(await api.canvas.sync())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }, [])

  // Gmail is fetched live and takes a second or two, so it loads on its own.
  const loadInbox = useCallback(async (refresh = false) => {
    setLoadingInbox(true)
    try {
      setInbox(await api.email.inbox(refresh))
    } catch (e) {
      setInbox({ connected: true, error: (e as Error).message, items: [] })
    } finally {
      setLoadingInbox(false)
    }
  }, [])

  useEffect(() => {
    api.plan.today().then((p) => setPlan(p ?? null)).catch((e) => setError(e.message))
  }, [])

  // Each time the tab is shown: show saved Canvas items right away, then refresh from Canvas if stale.
  useEffect(() => {
    if (!active) return
    api.todos.list().then(setTodos).catch(() => {})
    loadInbox()
    api.canvas.items()
      .then((c) => {
        setCanvas(c)
        const age = c.lastSyncUtc ? Date.now() - new Date(c.lastSyncUtc).getTime() : Infinity
        if (c.connected && age > CANVAS_STALE_MS) syncCanvas()
      })
      .catch((e) => setError(e.message))
  }, [active, syncCanvas, loadInbox])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      setPlan(await api.plan.generate()) // the server syncs Canvas as part of planning
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

  // Finished items move out of the main list into a collapsed section, like the To-Do tab.
  const canvasOpen = canvas?.items.filter((i) => !i.done) ?? []
  const canvasDone = canvas?.items.filter((i) => i.done) ?? []
  const canvasRow = (i: CanvasItem) => (
    <li key={i.uid} className={i.done ? 'is-done' : ''}>
      <input type="checkbox" checked={i.done} onChange={() => toggleCanvas(i.uid, !i.done)} title={i.done ? 'Mark not done' : 'Mark done'} />
      <div className="grow">
        {i.url ? <a href={i.url} target="_blank" rel="noreferrer">{i.title}</a> : i.title}
        <div className="sub">{i.course}</div>
      </div>
      {i.dueUtc && (
        <span className={`pill ${!i.done && isPast(i.dueUtc) ? 'bad' : ''}`}>{formatDue(i.dueUtc, i.allDay)}</span>
      )}
    </li>
  )

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

      <div className="side-by-side">
        <div>
          <div className="section-head">
            <h2>Canvas: next 2 weeks</h2>
            {canvas?.connected && (
              <span className="muted small">
                {syncing ? 'Syncing with Canvas…'
                  : canvas.lastSyncUtc && `Updated ${new Date(canvas.lastSyncUtc).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
                {!syncing && <button className="link" onClick={syncCanvas}>Refresh</button>}
              </span>
            )}
          </div>
          {canvas && !canvas.connected && (
            <p className="muted">Canvas isn't connected. Add your calendar feed link in <a href="#settings">Settings</a>.</p>
          )}
          {canvas?.connected && canvas.error && <div className="banner warn">{canvas.error}</div>}
          {canvas?.connected && canvasOpen.length === 0 && (
            <p className="muted">
              {canvasDone.length > 0 ? 'All caught up for the next two weeks.'
                : syncing || !canvas.lastSyncUtc ? 'Loading your Canvas assignments…' : 'Nothing due in the next two weeks.'}
            </p>
          )}
          <ul className="list">{canvasOpen.map(canvasRow)}</ul>

          {canvasDone.length > 0 && (
            <details className="done-wrap">
              <summary>Completed ({canvasDone.length})</summary>
              <ul className="list">{canvasDone.map(canvasRow)}</ul>
            </details>
          )}
        </div>

        <div>
          <div className="section-head">
            <h2>Inbox: unread this week</h2>
            {inbox?.connected && (
              <span className="muted small">
                {loadingInbox ? 'Checking Gmail…' : <button className="link" onClick={() => loadInbox(true)}>Refresh</button>}
              </span>
            )}
          </div>
          {inbox && !inbox.connected && (
            <p className="muted">Gmail isn't connected. Add your address and an app password in <a href="#settings">Settings</a>.</p>
          )}
          {inbox?.connected && inbox.error && <div className="banner warn">{inbox.error}</div>}
          {inbox?.connected && !inbox.error && inbox.items.length === 0 && !loadingInbox && (
            <p className="muted">No unread mail in your Primary tab from the last week.</p>
          )}
          {!inbox && loadingInbox && <p className="muted">Checking Gmail…</p>}
          <ul className="list">
            {inbox?.items.map((m, i) => (
              <li key={i}>
                <div className="grow">
                  {m.url ? <a href={m.url} target="_blank" rel="noreferrer">{m.subject}</a> : m.subject}
                  <div className="sub clip">{m.from}{m.preview && ` · ${m.preview}`}</div>
                </div>
                <span className="pill">{formatDue(m.date)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
