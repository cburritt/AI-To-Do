# AI-To-Do

A personal planner that runs on your own PC as a local website:

- **Today:** Claude reads your Canvas coursework, to-do list, and internship applications and builds a prioritized plan for the day.
- **To-Do:** a simple task list with due dates and priorities.
- **Internships:** track applications from Wishlist → Applied → OA → Interviewing → Offer.

**Stack:** ASP.NET Core (.NET 10) API + SQLite (EF Core) · React + TypeScript (Vite) · Claude via Claude Code or the Claude API (`Anthropic` NuGet package) · Canvas calendar feed (`Ical.Net`).

## Run it

Requires the [.NET 10 SDK](https://dotnet.microsoft.com/download) and [Node.js](https://nodejs.org/).

```bash
dotnet run --project src/Api
```

Then open http://localhost:5080. The first run installs the npm packages and builds the website automatically.

## First-time setup (in the app's Settings page)

1. **Canvas calendar feed.** In Canvas, open **Calendar** and click **Calendar Feed** at the bottom right, then copy that link.
   (K-State blocks personal Canvas API tokens, so the app reads the feed instead. The feed has due dates but no submission status, so check items off in the app when you finish them, or install the extension below.)
2. **Submitted assignments (optional).** The `extension` folder is a small Chrome/Edge extension that checks off work you've turned in. In the browser you use for Canvas, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the `extension` folder. Whenever you have a Canvas page open (and AI-To-Do is running), it reads your submissions with your existing Canvas login and sends them to the app on this PC only. It never unchecks anything.
3. **How to reach Claude**, one of:
   - **Your Claude subscription (default).** The app runs the [Claude Code](https://claude.com/code) CLI (`claude -p`) on this PC with tools turned off, so plans count against your Pro/Max usage. Sign in once: open a terminal, run `claude`, and type `/login`. This is for personal use on your own machine.
   - **API key.** Create one at [console.anthropic.com](https://console.anthropic.com) → API Keys (about $0.10 per plan on Claude Opus 5). You can also set the `ANTHROPIC_API_KEY` environment variable instead.

The feed link and API key are encrypted with Windows DPAPI and stored locally. They're never sent back to the browser.

## Where data lives

Everything is in `%LOCALAPPDATA%\AiTodo\` (the SQLite database and encryption keys), outside this repo.

## Developing the frontend

For hot reload while editing the React code:

```bash
dotnet run --project src/Api -p:SkipWeb=true   # API on :5080
cd src/web && npm run dev                      # site on :5173, proxies /api to :5080
```

## Project layout

```
src/Api/                 ASP.NET Core backend
  Program.cs             startup, DI, static site hosting
  Endpoints/             REST API (/api/todos, /api/internships, /api/canvas, /api/plan, /api/settings)
  Data/                  EF Core models + DbContext
  Services/              CanvasFeedService, PlannerService, ClaudeCodeRunner (subscription), SettingsService
src/web/                 React + TypeScript frontend (builds into src/Api/wwwroot)
extension/               browser extension that reports Canvas submissions to the app
```
