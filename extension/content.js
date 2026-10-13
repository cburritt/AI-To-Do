// Runs on Canvas pages. Reads your submission status with the login you already have in this tab
// and hands it to background.js, which passes it to the AI-To-Do app on this PC.

const MIN_GAP_MS = 10 * 60_000 // don't re-check on every page load

async function getJson(url) {
  const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  const text = await res.text()
  const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('Link') ?? '')?.[1]
  return { data: JSON.parse(text.replace(/^while\(1\);/, '')), next } // Canvas prefixes JSON for logged-in sessions
}

async function getAllPages(url) {
  const all = []
  for (let next = url; next; ) {
    const page = await getJson(next)
    all.push(...page.data)
    next = page.next
  }
  return all
}

async function sync() {
  const { lastSync = 0 } = await chrome.storage.local.get('lastSync')
  if (Date.now() - lastSync < MIN_GAP_MS) return

  const courses = await getAllPages('/api/v1/courses?enrollment_state=active&per_page=100')
  const items = []
  for (const course of courses) {
    let subs
    try {
      subs = await getAllPages(`/api/v1/courses/${course.id}/students/submissions?student_ids[]=self&per_page=100`)
    } catch {
      continue // e.g. a course you can't see submissions for
    }
    for (const s of subs) {
      items.push({
        assignmentId: s.assignment_id,
        workflowState: s.workflow_state,
        submittedAt: s.submitted_at,
        excused: s.excused ?? false,
        missing: s.missing ?? false,
      })
    }
  }

  const result = await chrome.runtime.sendMessage({ type: 'submissions', items })
  // Only remember a successful hand-off, so it retries on the next page if the app wasn't running.
  if (result?.ok) await chrome.storage.local.set({ lastSync: Date.now() })
}

if (window.top === window) sync().catch((e) => console.debug('AI-To-Do sync skipped:', e.message))
