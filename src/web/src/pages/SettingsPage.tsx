import { useEffect, useState, type FormEvent } from 'react'
import { api, type SettingsStatus } from '../api'

export default function SettingsPage() {
  const [status, setStatus] = useState<SettingsStatus | null>(null)
  const [feed, setFeed] = useState('')
  const [key, setKey] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => { api.settings.get().then(setStatus).catch(() => {}) }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    const body: { canvasFeedUrl?: string; anthropicApiKey?: string } = {}
    if (feed.trim()) body.canvasFeedUrl = feed.trim()
    if (key.trim()) body.anthropicApiKey = key.trim()
    if (!Object.keys(body).length) return
    try {
      setStatus(await api.settings.save(body))
      setFeed('')
      setKey('')
      setMessage({ ok: true, text: 'Saved.' })
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message })
    }
  }

  async function clear(field: 'canvasFeedUrl' | 'anthropicApiKey') {
    setStatus(await api.settings.save({ [field]: '' }))
  }

  const state = (on?: boolean) => <span className={`pill ${on ? 'ok' : ''}`}>{on ? 'Connected' : 'Not set'}</span>

  return (
    <section className="view">
      <header className="view-head"><h1>Settings</h1></header>
      <form className="card stack" onSubmit={save}>
        <label>
          <span className="label-row">Canvas calendar feed {state(status?.hasCanvasFeed)}
            {status?.hasCanvasFeed && <button type="button" className="link" onClick={() => clear('canvasFeedUrl')}>Remove</button>}
          </span>
          <input type="password" autoComplete="off" value={feed} onChange={(e) => setFeed(e.target.value)}
            placeholder={status?.hasCanvasFeed ? 'Paste a new link to replace it' : 'https://k-state.instructure.com/feeds/calendars/user_….ics'} />
          <small className="muted">In Canvas, open Calendar and click <b>Calendar Feed</b> at the bottom right. Copy that link.</small>
        </label>
        <label>
          <span className="label-row">Claude API key {state(status?.hasApiKey)}
            {status?.hasApiKey && <button type="button" className="link" onClick={() => clear('anthropicApiKey')}>Remove</button>}
          </span>
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)}
            placeholder={status?.hasApiKey ? 'Paste a new key to replace it' : 'sk-ant-…'} />
          <small className="muted">Create one at console.anthropic.com → API Keys.</small>
        </label>
        <div className="row">
          <button className="primary" type="submit">Save</button>
          {message && <span className={message.ok ? 'muted' : 'bad-text'}>{message.text}</span>}
        </div>
        <small className="muted">Both are stored encrypted on this PC only and are never sent back to the browser.</small>
      </form>
    </section>
  )
}
