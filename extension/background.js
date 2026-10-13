// Passes submission status from the Canvas tab to the AI-To-Do app. This has to happen here
// rather than in content.js because only the extension itself is allowed to call localhost.

const APP_URL = 'http://localhost:5080/api/canvas/submissions'

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'submissions') return
  fetch(APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message.items),
  })
    .then((res) => sendResponse({ ok: res.ok }))
    .catch(() => sendResponse({ ok: false })) // the app isn't running
  return true // keep the channel open for the async reply
})
