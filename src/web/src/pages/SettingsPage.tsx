import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type ClaudeCodeStatus, type CourseChoice, type PlannerMode, type SettingsInput, type SettingsStatus } from '../api'

export default function SettingsPage({ active }: { active: boolean }) {
  const [status, setStatus] = useState<SettingsStatus | null>(null)
  const [cc, setCc] = useState<ClaudeCodeStatus | null>(null)
  const [checkingCc, setCheckingCc] = useState(false)
  const [feed, setFeed] = useState('')
  const [key, setKey] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [courses, setCourses] = useState<CourseChoice[]>([])
  const [courseError, setCourseError] = useState<string | null>(null)

  const checkClaudeCode = useCallback(async () => {
    setCheckingCc(true)
    try {
      setCc(await api.settings.claudeCode())
    } catch {
      setCc(null)
    } finally {
      setCheckingCc(false)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    api.settings.get().then(setStatus).catch(() => {})
    api.canvas.courses().then(setCourses).catch(() => {})
    checkClaudeCode()
  }, [active, checkClaudeCode])

  // Saves right away, like the planner choice above.
  async function toggleCourse(name: string, show: boolean) {
    const next = courses.map((c) => (c.name === name ? { ...c, hidden: !show } : c))
    setCourses(next)
    setCourseError(null)
    try {
      setCourses(await api.canvas.setHiddenCourses(next.filter((c) => c.hidden).map((c) => c.name)))
    } catch (err) {
      setCourses(courses)
      setCourseError((err as Error).message)
    }
  }

  async function update(body: SettingsInput) {
    try {
      setStatus(await api.settings.save(body))
      setMessage({ ok: true, text: 'Saved.' })
      return true
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
      return false
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const body: SettingsInput = {}
    if (feed.trim()) body.canvasFeedUrl = feed.trim()
    if (key.trim()) body.anthropicApiKey = key.trim()
    if (!Object.keys(body).length) return
    if (await update(body)) {
      setFeed('')
      setKey('')
    }
  }

  const setMode = (plannerMode: PlannerMode) => update({ plannerMode })
  const pill = (on: boolean | undefined, onText: string, offText: string) =>
    <span className={`pill ${on ? 'ok' : ''}`}>{on ? onText : offText}</span>

  const mode = status?.plannerMode ?? 'claude-code'

  return (
    <section className="view">
      <header className="view-head"><h1>Settings</h1></header>

      <div className="card stack">
        <h2 className="card-title">How to reach Claude</h2>

        <label className="choice">
          <input type="radio" name="mode" checked={mode === 'claude-code'} onChange={() => setMode('claude-code')} />
          <div>
            <div className="label-row"><b>My Claude subscription</b> (through Claude Code)
              {checkingCc ? <span className="pill">Checking…</span>
                : cc && pill(cc.loggedIn, 'Signed in', cc.installed ? 'Not signed in' : 'Not installed')}
            </div>
            <small className="muted">Uses your Pro/Max plan's usage. It runs Claude Code on this PC, so plans take a bit longer.</small>
            {mode === 'claude-code' && cc && !cc.loggedIn && !checkingCc && (
              <div className="banner warn inset">
                {cc.installed ? (
                  <>Claude Code isn't signed in. Open a terminal and run <code>claude</code>, then type <code>/login</code> and sign in with your Claude account.</>
                ) : (
                  <>Claude Code isn't installed. Install it from <a href="https://claude.com/code" target="_blank" rel="noreferrer">claude.com/code</a>.</>
                )}
                {' '}<button type="button" className="link" onClick={checkClaudeCode}>Check again</button>
              </div>
            )}
          </div>
        </label>

        <label className="choice">
          <input type="radio" name="mode" checked={mode === 'api'} onChange={() => setMode('api')} />
          <div>
            <div className="label-row"><b>API key</b> {pill(status?.hasApiKey, 'Key saved', 'No key')}</div>
            <small className="muted">Pay per use from console.anthropic.com (about $0.10 per plan). Faster, and separate from your subscription.</small>
          </div>
        </label>
      </div>

      <form className="card stack" onSubmit={save}>
        <label>
          <span className="label-row">Canvas calendar feed {pill(status?.hasCanvasFeed, 'Connected', 'Not set')}
            {status?.hasCanvasFeed && <button type="button" className="link" onClick={() => update({ canvasFeedUrl: '' })}>Remove</button>}
          </span>
          <input type="password" autoComplete="off" value={feed} onChange={(e) => setFeed(e.target.value)}
            placeholder={status?.hasCanvasFeed ? 'Paste a new link to replace it' : 'https://k-state.instructure.com/feeds/calendars/user_….ics'} />
          <small className="muted">In Canvas, open Calendar and click <b>Calendar Feed</b> at the bottom right. Copy that link.</small>
        </label>
        <div>
          <div className="label-row"><b>Submitted assignments</b> {pill(!!status?.lastSubmissionSyncUtc, 'Extension working', 'Not set up')}</div>
          <small className="muted">
            {status?.lastSubmissionSyncUtc
              ? `Last checked ${new Date(status.lastSubmissionSyncUtc).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}. Submitted work is checked off whenever you have Canvas open in your browser.`
              : <>The feed can't tell what you've turned in. Install the browser extension in the repo's <code>extension</code> folder (steps in the README) and submitted work gets checked off whenever you have Canvas open.</>}
          </small>
        </div>
        {mode === 'api' && (
          <label>
            <span className="label-row">Claude API key
              {status?.hasApiKey && <button type="button" className="link" onClick={() => update({ anthropicApiKey: '' })}>Remove</button>}
            </span>
            <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)}
              placeholder={status?.hasApiKey ? 'Paste a new key to replace it' : 'sk-ant-…'} />
            <small className="muted">Create one at console.anthropic.com → API Keys.</small>
          </label>
        )}
        <div className="row">
          <button className="primary" type="submit">Save</button>
          {message && <span className={message.ok ? 'muted' : 'bad-text'}>{message.text}</span>}
        </div>
        <small className="muted">Links and keys are stored encrypted on this PC only and are never sent back to the browser.</small>
      </form>

      <div className="card stack">
        <h2 className="card-title">Classes</h2>
        <small className="muted">Unchecked classes are left out of the Canvas list and the daily plan.</small>
        {courses.length === 0 && (
          <span className="muted">
            {status?.hasCanvasFeed ? 'No classes yet. They show up here after Canvas syncs on the Today tab.' : 'Add your Canvas calendar feed above to pick classes.'}
          </span>
        )}
        {courses.map((c) => (
          <label key={c.name} className="choice">
            <input type="checkbox" checked={!c.hidden} onChange={(e) => toggleCourse(c.name, e.target.checked)} />
            <span>{c.name || 'Other (no class)'}</span>
          </label>
        ))}
        {courseError && <span className="bad-text">{courseError}</span>}
      </div>
    </section>
  )
}
