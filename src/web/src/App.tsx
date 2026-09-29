import { useEffect, useState } from 'react'
import TodayPage from './pages/TodayPage'
import TodosPage from './pages/TodosPage'
import InternshipsPage from './pages/InternshipsPage'
import SettingsPage from './pages/SettingsPage'

const PAGES = [
  { id: 'today', label: 'Today' },
  { id: 'todos', label: 'To-Do' },
  { id: 'internships', label: 'Internships' },
  { id: 'settings', label: 'Settings' },
] as const

type PageId = (typeof PAGES)[number]['id']

function currentPage(): PageId {
  const h = location.hash.slice(1)
  return PAGES.some((p) => p.id === h) ? (h as PageId) : 'today'
}

export default function App() {
  const [page, setPage] = useState<PageId>(currentPage)

  useEffect(() => {
    const onHash = () => setPage(currentPage())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">AI-To-Do</div>
        {PAGES.map((p) => (
          <a key={p.id} href={`#${p.id}`} className={`nav ${page === p.id ? 'active' : ''}`}>
            {p.label}
          </a>
        ))}
      </nav>
      <main>
        {page === 'today' && <TodayPage />}
        {page === 'todos' && <TodosPage />}
        {page === 'internships' && <InternshipsPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
