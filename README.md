# MemoFlow

MemoFlow is a full-stack note-taking and workspace collaboration application. It combines a personal timeline, calendar-based capture, searchable tags, persistent checklist tasks, and invitation-based shared workspaces in a responsive dark interface.

The repository is an npm workspaces project containing a React client and an Express API. Application data is stored locally in SQLite; no external database service is required.

## Contents

- [Features](#features)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Running MemoFlow](#running-memoflow)
- [Database and file storage](#database-and-file-storage)
- [API overview](#api-overview)
- [Authentication and authorization](#authentication-and-authorization)
- [Project structure](#project-structure)
- [Testing and validation](#testing-and-validation)
- [Troubleshooting](#troubleshooting)

## Features

### Notes and timeline

- Create, view, edit, and delete notes from a quick-capture editor.
- View notes newest first in the personal timeline.
- Add comma-separated tags or write inline `#tags` in note content.
- Attach a web link, a reference to another accessible note, or one image.
- Choose between a private personal note and a note shared to an accessible workspace.
- Receive loading, validation, success, and error feedback for note operations.
- Confirm destructive actions before deleting notes or workspaces.

### Calendar

- Browse previous and next months.
- See the number of notes recorded for each day.
- Select a day to filter the timeline and create a note on that date.
- Return from a selected date to the complete timeline.
- Preserve the selected calendar day by sending both a `YYYY-MM-DD` calendar value and the browser's IANA time zone to the API.

### Checklists and unfinished tasks

- Add checklist items while creating or editing a note.
- Mark individual tasks complete or incomplete without editing the entire note.
- Review accessible incomplete tasks in the **Unfinished Tasks** view.
- Open the note associated with a task.
- Persist task text, order, and completion state in SQLite.

### Search and organization

- Search dynamically across note content, link titles, checklist text, and tags.
- Filter notes by tag, personal/workspace scope, month, or selected day.
- Clear active search and filter states.
- Use dedicated empty states when filters, searches, notes, tasks, or workspaces have no results.

### Authentication

- Register with a name, email address, and password.
- Log in and log out with a server-managed session.
- Hash passwords with bcrypt before storage.
- Authenticate using an HTTP-only, `SameSite=Strict` cookie.
- Protect notes, workspaces, invitations, checklist updates, and uploaded files at the API layer.

### Shared workspaces

- Create workspaces and see every workspace in which the current user is an accepted member.
- Invite an existing registered user by email.
- Accept or decline invitations; a pending invitation does not grant workspace access.
- Display pending invitations separately from active members.
- Use two roles: **Owner** and **Member**.
- Allow members to create, edit, and delete their own shared notes.
- Allow owners to moderate shared notes and manage workspace membership.
- Remove members, cancel pending invitations, transfer ownership, leave a workspace, or delete a workspace subject to authorization rules.

### Interface

- Consistent dark theme across authentication and application views.
- Collapsible desktop sidebar and mobile navigation drawer.
- Responsive layouts for timeline, calendar, tasks, and shared spaces.
- Toast notifications, inline errors, loading indicators, timestamps, and note metadata.

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React DOM, Vite 7 |
| Styling | Tailwind CSS 4 and application CSS |
| Backend | Node.js, Express 4 |
| Database | SQLite through `better-sqlite3` |
| Authentication | `bcryptjs`, server-side session records, HTTP-only cookies |
| Uploads | `multer`, local filesystem storage |
| Development | npm workspaces, `concurrently`, Node's watch mode |
| Tests | Node's built-in test runner and integration tests against a temporary SQLite database |

## Architecture

```text
┌──────────────────────────────┐
│ React client                 │
│ Timeline · Calendar · Tasks  │
│ Authentication · Workspaces │
└──────────────┬───────────────┘
               │ same-origin /api requests
               │ Vite proxy in development
               ▼
┌──────────────────────────────┐
│ Express server               │
│ Routes · validation · auth   │
│ authorization · uploads      │
└───────────┬───────────┬──────┘
            │           │
            ▼           ▼
┌──────────────────┐  ┌──────────────────┐
│ SQLite database  │  │ Protected uploads│
│ users and notes  │  │ server/uploads   │
│ tasks/workspaces │  │                  │
└──────────────────┘  └──────────────────┘
```

During development, Vite serves the client on port `5173` and proxies `/api` to the Express server on `127.0.0.1:4000`. After a frontend build, Express detects `client/dist`, serves the compiled application, and provides the SPA fallback from the API server's origin.

The client never reads or writes SQLite directly. Note, task, user, invitation, and workspace operations all go through the Express API.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) `20.19.0` or newer in the Node 20 line, or `22.12.0` or newer. This requirement comes from the installed Vite version.
- npm, included with Node.js.
- A supported modern browser.

SQLite is embedded through `better-sqlite3`; a separate SQLite server or CLI is not required. On platforms for which a prebuilt `better-sqlite3` binary is unavailable, npm may also require the platform's native C/C++ build tools and Python.

### Install dependencies

From the repository root:

```bash
npm ci
```

`npm ci` installs the root, client, and server workspaces using `package-lock.json`. Use `npm install` instead when intentionally updating dependencies or the lockfile.

## Configuration

MemoFlow reads configuration directly from `process.env`. The project does **not** currently load `.env` files, so export variables in the shell or configure them in the process manager that launches the server.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | Express listening port. The server binds to `127.0.0.1`. |
| `NODE_ENV` | unset | When set to `production`, marks the session cookie as `Secure`. Deploy behind HTTPS when using this value. |
| `MEMOFLOW_DB_PATH` | `server/data/memoflow.db` | SQLite file path. Relative values are resolved from the process working directory. Parent directories are created automatically. |
| `MEMOFLOW_UPLOAD_DIR` | `server/uploads` | Directory for uploaded note images. The directory is created automatically. |
| `MEMOFLOW_DISABLE_SEED` | unset | Set to `1` to prevent development demo data from being inserted into an empty database. |

### PowerShell example

```powershell
$env:PORT = "4000"
$env:MEMOFLOW_DB_PATH = "D:\MemoFlow-data\memoflow.db"
$env:MEMOFLOW_UPLOAD_DIR = "D:\MemoFlow-data\uploads"
$env:MEMOFLOW_DISABLE_SEED = "1"
npm run dev
```

### macOS/Linux example

```bash
PORT=4000 \
MEMOFLOW_DB_PATH="$PWD/.local/memoflow.db" \
MEMOFLOW_UPLOAD_DIR="$PWD/.local/uploads" \
MEMOFLOW_DISABLE_SEED=1 \
npm run dev
```

### Development seed data

Unless `MEMOFLOW_DISABLE_SEED=1`, the server seeds data only when the `users` table is empty. The checked-in implementation creates a sample Product workspace, sample notes, and these development accounts:

| Name | Email | Password |
| --- | --- | --- |
| Gauri | `gauri@memoflow.app` | `memoflow` |
| Alex | `alex@memoflow.app` | `memoflow` |

These accounts are intended for local evaluation only. Disable seeding and create real accounts for any non-demo deployment.

## Running MemoFlow

### Start frontend and backend together

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The command starts:

- the Express API with Node watch mode at `http://127.0.0.1:4000`;
- the Vite development server at `http://localhost:5173`.

### Start each workspace separately

Run the API in one terminal:

```bash
npm run dev -w memoflow-server
```

Run the frontend in another:

```bash
npm run dev -w memoflow-client
```

### Build and serve the application

```bash
npm run build
npm start
```

Open [http://127.0.0.1:4000](http://127.0.0.1:4000). `npm run build` creates `client/dist`; `npm start` launches Express, which serves both the API and that compiled frontend.

For a production deployment, set `NODE_ENV=production` and terminate HTTPS at the application or a reverse proxy. Because production cookies are `Secure`, authentication will not work over plain HTTP when `NODE_ENV=production`.

### Available root commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start API and Vite client concurrently. |
| `npm run build` | Build the client for production. |
| `npm start` | Start the Express server without watch mode. |
| `npm test` | Run the server integration test suite. |

## Database and file storage

MemoFlow initializes its schema at server startup using `CREATE TABLE IF NOT EXISTS`, indexes, and integrity triggers. SQLite runs with foreign-key enforcement and write-ahead logging (WAL).

### Tables

| Table | Purpose |
| --- | --- |
| `users` | User profile, unique normalized email, and bcrypt password hash. |
| `sessions` | Opaque session token, user relationship, and creation time. |
| `workspaces` | Workspace name, description, owner, and creation time. |
| `workspace_members` | Accepted users and their `owner` or `member` role. |
| `workspace_invitations` | Pending, accepted, and declined invitations between registered users. |
| `notes` | Note content, author, visibility, workspace, link/image/reference metadata, timestamps, and calendar day. |
| `checklist_items` | Checklist text, completion state, and display position for a note. |
| `tags` | Case-insensitive unique tag names. |
| `note_tags` | Many-to-many relationship between notes and tags. |

Database triggers reject inconsistent visibility records: a private note cannot have a workspace, and a shared note must have one.

### Dates and time zones

Timestamps are stored as ISO strings. Notes also store a `day` value in `YYYY-MM-DD` form for calendar queries. When creating a note from a selected calendar date, the client sends `calendarDay` and an IANA `timeZone`; the server validates both and stores a timestamp whose local calendar day matches the selection. Timeline and calendar API requests include the same time zone so dates are formatted and grouped consistently without an unintended UTC date shift.

### Uploaded images

Uploaded images are stored in `MEMOFLOW_UPLOAD_DIR` and their generated filenames are recorded in SQLite. Supported extensions are PNG, JPG/JPEG, GIF, and WebP; the maximum file size is 2 MB. Files are served through an authenticated API route that applies the same note-visibility rules as the note itself.

Back up the database and upload directory together. Stop the server before copying a WAL-mode database to avoid an inconsistent file-level backup.

## API overview

All endpoints return JSON except the protected file endpoint. Errors use this shape:

```json
{
  "error": "Human-readable message"
}
```

Common error statuses are `400` for invalid input, `401` for missing authentication, `403` for insufficient permission, `404` for an inaccessible or missing resource, and `409` for a conflicting operation.

### Health

| Method | Endpoint | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | No | Return `{ "ok": true }`. |

### Authentication

| Method | Endpoint | Authentication | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | No | Register with `name`, `email`, and `password`; create a session. |
| `POST` | `/api/auth/login` | No | Authenticate with `email` and `password`; create a session. |
| `POST` | `/api/auth/logout` | Optional | Delete the current session and clear its cookie. |
| `GET` | `/api/auth/me` | Optional | Return the current user or `{ "user": null }`. |

Registration requires a 2–40 character name, a syntactically valid email address, and a 6–128 character password.

### Notes and tasks

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/notes` | Get the authorized note feed and related calendar/filter data. |
| `GET` | `/api/notes/tasks/unfinished` | Get accessible incomplete checklist items. |
| `GET` | `/api/notes/:id` | Get one accessible note. |
| `POST` | `/api/notes` | Create a note from `multipart/form-data`. |
| `PUT` | `/api/notes/:id` | Replace editable note fields from `multipart/form-data`. |
| `DELETE` | `/api/notes/:id` | Delete an authorized note. |
| `PATCH` | `/api/notes/:id/items/:itemId` | Set task status with JSON `{ "done": true | false }`. |
| `GET` | `/api/notes/files/:name` | Stream an authorized note image. |

Supported `GET /api/notes` query parameters include:

| Parameter | Format | Purpose |
| --- | --- | --- |
| `month` | `YYYY-MM` | Select the calendar month; defaults to the current month. |
| `day` | `YYYY-MM-DD` | Restrict the feed to one local calendar day. |
| `q` | Up to 100 characters | Search content, link titles, checklist text, and tags. |
| `tag` | 1–24 letters, numbers, or hyphens | Restrict notes by tag. |
| `scope` | `personal` or `workspace` | Restrict visibility scope; omitted means both authorized scopes. |
| `workspaceId` | Positive workspace ID | Restrict results to an accessible workspace. |
| `view` | `tasks` | Request task-oriented feed filtering. |
| `timeZone` | IANA time zone | Control local date grouping and formatting; defaults to `UTC` for direct API calls. |

Note create/update requests use `multipart/form-data` because an image may be included. Fields used by the implementation are `body`, `visibility`, `workspaceId`, `calendarDay`, `timeZone`, `tags`, `items`, `linkUrl`, `linkTitle`, `referenceNoteId`, `removeImage`, and the `image` file. `tags` and `items` are JSON arrays when submitted as form fields.

Example private note request using a cookie jar:

```bash
curl -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"gauri@memoflow.app","password":"memoflow"}' \
  http://127.0.0.1:4000/api/auth/login

curl -b cookies.txt \
  -F 'body=Document the release checklist' \
  -F 'visibility=private' \
  -F 'calendarDay=2026-11-12' \
  -F 'timeZone=Asia/Calcutta' \
  -F 'tags=["project","release"]' \
  -F 'items=[{"text":"Run tests","done":false}]' \
  http://127.0.0.1:4000/api/notes
```

Use an account you registered instead of the seeded account when demo seeding is disabled. In Windows PowerShell, invoke `curl.exe` if `curl` resolves to a PowerShell alias rather than the curl executable.

### Workspaces and invitations

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/workspaces` | List accepted workspaces and the current user's pending invitations. |
| `POST` | `/api/workspaces` | Create a workspace; the creator becomes owner. |
| `GET` | `/api/workspaces/:id` | Get a workspace visible to an accepted member. |
| `POST` | `/api/workspaces/:id/invitations` | Owner: invite an existing user with `{ "email": "..." }`. |
| `DELETE` | `/api/workspaces/:id/invitations/:invitationId` | Owner: cancel a pending invitation. |
| `POST` | `/api/workspaces/invitations/:invitationId/accept` | Invitee: accept and become a member. |
| `POST` | `/api/workspaces/invitations/:invitationId/decline` | Invitee: decline an invitation. |
| `DELETE` | `/api/workspaces/:id/members/:userId` | Owner: remove a member. |
| `PATCH` | `/api/workspaces/:id/owner` | Owner: transfer ownership with `{ "userId": 123 }`. |
| `POST` | `/api/workspaces/:id/leave` | Member: leave the workspace. |
| `DELETE` | `/api/workspaces/:id` | Owner: delete the workspace and its shared content. |

Except for `/api/health` and the authentication endpoints described above, API routes require a valid session cookie.

## Authentication and authorization

### Sessions

- Passwords are hashed with bcrypt at cost factor 10 and plaintext passwords are never stored.
- Successful registration or login creates an opaque session token in the `sessions` table.
- The token is sent in the `memoflow_session` cookie.
- The cookie is HTTP-only, `SameSite=Strict`, valid for 30 days, scoped to `/`, and marked `Secure` when `NODE_ENV=production`.
- Logout deletes the server-side session and clears the cookie.

### Access rules

- A personal note is visible only to its author. It is never returned through another user's feed or a workspace scope.
- A shared note is accessible only to accepted members of its workspace. An invitation by itself grants no access.
- A member may create shared notes in an accepted workspace and modify or delete their own shared notes.
- A workspace owner may manage all shared notes in that workspace. When moderating another author's note, the API keeps the note shared in the same workspace.
- Owners alone may invite users, cancel invitations, remove members, transfer ownership, or delete the workspace.
- Only the named invitee may accept or decline an invitation.
- A member may leave a workspace. An owner must transfer ownership or delete the workspace instead.
- Note references and uploaded images are checked against the requesting user's current note access.
- Checklist status updates use the same note-modification authorization as other note edits.

These checks are implemented by the backend and do not rely on hidden or disabled frontend controls.

## Project structure

```text
MemoFlow-main/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthScreen.jsx
│   │   │   ├── Calendar.jsx
│   │   │   ├── Feedback.jsx
│   │   │   ├── Icons.jsx
│   │   │   ├── NoteCard.jsx
│   │   │   ├── NoteForm.jsx
│   │   │   ├── Shell.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   └── WorkspacePanel.jsx
│   │   ├── api.js
│   │   ├── App.jsx
│   │   ├── format.js
│   │   ├── hooks.js
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── assets/
│   │   └── sketch.svg
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── notes.js
│   │   │   └── workspaces.js
│   │   ├── auth.js
│   │   ├── db.js
│   │   ├── errors.js
│   │   └── index.js
│   ├── test/
│   │   └── notes.integration.test.js
│   ├── uploads/
│   └── package.json
├── .gitignore
├── package-lock.json
├── package.json
└── README.md
```

Key responsibilities:

- `client/src/App.jsx` coordinates authentication, navigation, note feeds, filters, calendar state, and workspace data.
- `client/src/api.js` provides the browser API wrapper and sends session cookies with requests.
- `server/src/index.js` configures Express, mounts route groups, serves the production client, and handles errors.
- `server/src/auth.js` reads and validates session cookies and provides protected-route middleware.
- `server/src/db.js` owns the SQLite connection, schema, parameterized queries, transactions, authorization-aware data access, and optional seed data.
- `server/src/routes/` validates HTTP input and translates requests into database operations.

## Testing and validation

Run the integration suite from the repository root:

```bash
npm test
```

The suite launches a real Express process against temporary database and upload paths with seeding disabled. It covers registration and login, password hashing, session persistence, personal-note isolation, invitations, workspace membership and owner permissions, note CRUD, search, tags, calendar dates, checklist updates, and persistence across a server restart.

Build the frontend separately:

```bash
npm run build
```

For an end-to-end browser check, run `npm run dev`, register two distinct users, and verify the invitation lifecycle and personal/shared note boundaries in separate browser sessions.

## Troubleshooting

### `npm ci` fails while installing `better-sqlite3`

Confirm that the Node version meets the prerequisite. If no prebuilt binary exists for the operating system and Node combination, install the platform's native build toolchain and Python, then retry `npm ci`.

### The frontend loads but API calls fail

- Ensure the Express process is running on `127.0.0.1:4000`.
- In development, access the app through `http://localhost:5173` so Vite can proxy `/api`.
- If `PORT` is changed, also update `client/vite.config.js` or use a same-origin production build; the checked-in development proxy targets port `4000`.
- Check `http://127.0.0.1:4000/api/health` for `{ "ok": true }`.

### Login succeeds in the response but the browser appears logged out

Do not use plain HTTP with `NODE_ENV=production`. That mode sets a `Secure` session cookie, which browsers send only over HTTPS. For local HTTP testing, leave `NODE_ENV` unset; for deployment, configure HTTPS.

### A clean database unexpectedly contains demo notes

Set `MEMOFLOW_DISABLE_SEED=1` before the first server start. Seeding runs only when the database contains no users. To start clean without deleting an existing database, point `MEMOFLOW_DB_PATH` and `MEMOFLOW_UPLOAD_DIR` at new locations.

### Calendar notes appear on the wrong day in a direct API client

Send a valid IANA `timeZone` on list, get, create, and update requests. For calendar capture, also send `calendarDay` as `YYYY-MM-DD`. The browser client supplies both automatically.

### Uploaded images are missing after moving the database

Image binaries are not stored inside SQLite. Move or back up `MEMOFLOW_UPLOAD_DIR` together with the database, and configure both variables to the restored locations.

### The server cannot open the database or upload directory

Verify that the process has read/write permission for the configured database parent directory and upload directory. MemoFlow creates missing directories, but it cannot bypass operating-system permissions or use a path already occupied by an incompatible file.
