import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type Internship, type InternshipInput } from '../api'
import { formatDateOnly, isPastDateOnly } from '../format'

const EMPTY: InternshipInput = {
  company: '', role: '', status: 'Wishlist', deadline: null, appliedOn: null, link: null, notes: null,
}

export default function InternshipsPage() {
  const [items, setItems] = useState<Internship[]>([])
  const [statuses, setStatuses] = useState<string[]>([])
  const [filter, setFilter] = useState<string>('Active')
  const [editing, setEditing] = useState<{ id: number | null; form: InternshipInput } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  const reload = () => api.internships.list().then(setItems).catch((e) => setError(e.message))
  useEffect(() => {
    reload()
    api.internships.statuses().then(setStatuses).catch(() => {})
  }, [])

  useEffect(() => {
    if (editing) dialog.current?.showModal()
    else dialog.current?.close()
  }, [editing])

  const closed = ['Rejected', 'Withdrawn']
  const shown = items.filter((i) =>
    filter === 'All' ? true : filter === 'Active' ? !closed.includes(i.status) : i.status === filter)

  function openNew() {
    setEditing({ id: null, form: { ...EMPTY } })
  }
  function openEdit(i: Internship) {
    const { id, createdAt: _c, updatedAt: _u, ...form } = i
    setEditing({ id, form })
  }
  function setField<K extends keyof InternshipInput>(k: K, v: InternshipInput[K]) {
    setEditing((e) => e && { ...e, form: { ...e.form, [k]: v } })
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    try {
      if (editing.id === null) await api.internships.create(editing.form)
      else await api.internships.update(editing.id, editing.form)
      setEditing(null)
      reload()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function remove() {
    if (!editing?.id || !confirm(`Delete ${editing.form.company}?`)) return
    await api.internships.remove(editing.id).catch((e) => setError(e.message))
    setEditing(null)
    reload()
  }

  const counts = (s: string) =>
    s === 'All' ? items.length : s === 'Active' ? items.filter((i) => !closed.includes(i.status)).length
      : items.filter((i) => i.status === s).length

  return (
    <section className="view">
      <header className="view-head">
        <h1>Internships</h1>
        <button className="primary" onClick={openNew}>Add application</button>
      </header>
      {error && <div className="banner error">{error}</div>}

      <div className="filters">
        {['Active', 'All', ...statuses].map((s) => (
          <button key={s} className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>
            {s} <span className="muted">{counts(s)}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="muted empty">{items.length === 0 ? 'No applications yet. Add the first one.' : 'Nothing in this filter.'}</p>
      ) : (
        <div className="table-wrap"><table className="table">
          <thead>
            <tr><th>Company</th><th>Role</th><th>Status</th><th>Deadline</th><th>Applied</th><th /></tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id} onClick={() => openEdit(i)}>
                <td><b>{i.company}</b></td>
                <td>{i.role}</td>
                <td><span className={`status s-${i.status}`}>{i.status}</span></td>
                <td className={i.deadline && isPastDateOnly(i.deadline) && i.status === 'Wishlist' ? 'bad-text' : ''}>
                  {formatDateOnly(i.deadline)}
                </td>
                <td className="muted">{formatDateOnly(i.appliedOn)}</td>
                <td>
                  {i.link && (
                    <a href={i.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Posting ↗</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      <dialog ref={dialog} onClose={() => setEditing(null)}>
        {editing && (
          <form className="stack" onSubmit={save}>
            <h2>{editing.id === null ? 'New application' : editing.form.company}</h2>
            <div className="grid2">
              <label>Company
                <input required value={editing.form.company} onChange={(e) => setField('company', e.target.value)} />
              </label>
              <label>Role
                <input required value={editing.form.role} onChange={(e) => setField('role', e.target.value)} />
              </label>
              <label>Status
                <select value={editing.form.status} onChange={(e) => setField('status', e.target.value)}>
                  {statuses.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>Deadline
                <input type="date" value={editing.form.deadline ?? ''} onChange={(e) => setField('deadline', e.target.value || null)} />
              </label>
              <label>Applied on
                <input type="date" value={editing.form.appliedOn ?? ''} onChange={(e) => setField('appliedOn', e.target.value || null)} />
              </label>
              <label>Posting link
                <input type="url" placeholder="https://…" value={editing.form.link ?? ''} onChange={(e) => setField('link', e.target.value || null)} />
              </label>
            </div>
            <label>Notes
              <textarea rows={3} value={editing.form.notes ?? ''} onChange={(e) => setField('notes', e.target.value || null)} />
            </label>
            <div className="dialog-actions">
              {editing.id !== null && <button type="button" className="danger" onClick={remove}>Delete</button>}
              <span className="spacer" />
              <button type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button className="primary" type="submit">Save</button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  )
}
