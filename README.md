# Draftly: Gmail AI Reply Agent

Draftly is a Gmail reply assistant built for the Airtribe assignment brief. It connects to Gmail with OAuth2, syncs recent mailbox data, drafts grounded replies for incoming emails, lets the user review/edit/approve those drafts, sends approved replies back through Gmail, and learns a lightweight writing style profile from sent mail.

The app is intentionally inbox-first:
- `Inbox` and `Spam` can surface reply drafts.
- `Sent` is visible for context, but reply drafting is blocked there because the assignment is about replying to received mail.

## What The App Does

- Connects a Gmail account with OAuth2.
- Syncs recent `inbox`, `spam`, and `sent` messages from Gmail.
- Generates AI-assisted reply drafts for incoming emails using thread context, user preferences, and tone selection.
- Supports `Concise`, `Friendly`, `Formal`, and `Custom` tone modes.
- Lets the user edit, reject, or approve a draft before sending.
- Sends only approved drafts through Gmail with reply-thread headers.
- Retries transient send failures with exponential backoff.
- Marks fatal auth failures, disconnects the session, and surfaces logs.
- Learns a style profile from sent mail to influence future drafts.
- Encrypts stored OAuth tokens and user preferences at rest.

## Current Architecture

The codebase is split into backend lifecycle modules, provider-backed writing intelligence, and a browser-native frontend session layer.

### Backend modules

- `src/modules/replyDraftLifecycle.js`
  Owns reply draft creation, regeneration, editing, approval, rejection, queue processing, retry/backoff, sent-mail persistence, and send-state transitions.
- `src/modules/writingIntelligence/`
  Owns reply generation and style-profile learning. Provider selection and fallback logic are private to this module.
- `src/modules/inboxMailbox.js`
  Owns mailbox listing and sync orchestration.
- `src/modules/channelConnectivity.js`
  Owns Gmail/OAuth-facing configuration and status.
- `src/modules/profilePreferences.js`
  Owns decrypted user preference reads/writes.

### Adapters and storage

- `src/services/gmail.js`
  Gmail OAuth, sync, parse, and send adapter.
- `src/database/db.js`
  JSON persistence layer with encrypted credentials/preferences helpers.
- `src/database/repositories.js`
  Repository layer for inbox emails, reply drafts, and persisted sent emails.

### Frontend

- `public/js/session/dashboardSession.js`
  Session state, polling, draft actions, and orchestration.
- `public/js/session/apiClient.js`
  Fetch wrappers for the REST API.
- `public/js/views/`
  Render-only view modules for email list, email detail, draft editor, settings, logs, and style profile.

## Security Notes

- OAuth access and refresh tokens are encrypted at rest.
- User preferences are encrypted at rest.
- New encrypted values use authenticated `AES-256-GCM`.
- Legacy `AES-256-CBC` token values remain readable through a compatibility decrypt path so existing local data does not break.
- If `ENCRYPTION_KEY` is not set, Draftly generates a machine-local key file at `data/.draftly.key` for local development.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a local `.env` file if you want to override defaults:

```env
PORT=5000
ENCRYPTION_KEY=replace-with-a-long-random-secret
GMAIL_REDIRECT_URI=http://localhost:5000/api/auth/callback
```

Notes:
- `PORT` defaults to `5000`.
- `GMAIL_REDIRECT_URI` defaults to `http://localhost:${PORT}/api/auth/callback`.
- `ENCRYPTION_KEY` is recommended for stable encrypted storage across machines/environments.

### 3. Configure Google OAuth

You need a Google Cloud OAuth client with Gmail scopes enabled. Draftly expects:

- Gmail read access
- Gmail send access
- user email identity access

You can either:
- save Google client credentials through the dashboard settings, or
- keep a downloaded Google client secret JSON file in the project root for local reconciliation during development.

### 4. Start the app

```bash
npm start
```

Then open:

```text
http://localhost:5000
```

## Live Deployment

The project is also deployed on Render for the assignment demo:

```text
https://airtribe-assignment.onrender.com
```

## REST API

All endpoints are mounted under `/api`.

### Connectivity and configuration

- `GET /api/config`
  Returns safe config/status fields for the dashboard.
- `POST /api/config`
  Saves client credentials and AI provider configuration.
- `GET /api/auth/url`
  Returns the Google OAuth consent URL.
- `GET /api/auth/callback`
  Exchanges the OAuth code for Gmail tokens and redirects to `/`.
- `POST /api/auth/logout`
  Revokes/clears Gmail session tokens.

### Mailbox and drafts

- `GET /api/emails?folder=inbox|sent|spam|all`
  Returns synced mailbox items for the selected folder.
- `POST /api/emails/sync`
  Pulls recent Gmail mailbox data into local storage.
- `GET /api/drafts`
  Returns all reply drafts.
- `GET /api/drafts/:emailId`
  Gets or creates a draft for an incoming email.
- `POST /api/drafts/:emailId/regenerate`
  Regenerates a draft using a different tone.
- `PUT /api/drafts/:id`
  Saves manual draft edits.
- `POST /api/drafts/:id/approve`
  Marks a draft approved and enqueues it for sending.
- `POST /api/drafts/:id/reject`
  Rejects a draft.

### Style profile and preferences

- `GET /api/style/profile`
  Returns the current learned writing style profile.
- `POST /api/style/learn`
  Analyzes recent sent mail and stores an updated style profile.
- `GET /api/preferences`
  Returns decrypted user writing preferences.
- `POST /api/preferences`
  Saves user writing preferences.

### Observability

- `GET /api/logs`
  Returns recent audit/system logs.

## Draft Lifecycle

Reply drafts move through these states:

- `Suggested`
- `Edited`
- `Approved`
- `Sending`
- `Retrying`
- `Sent`
- `Failed`
- `Rejected`

Behavior:
- Drafts are created only for incoming emails.
- `no-reply` senders are blocked.
- `sent` messages are blocked.
- Approved drafts are picked up by the send scheduler.
- Transient send failures retry with exponential backoff.
- Persistent auth failures mark the Gmail channel disconnected.

## Assignment Alignment

Implemented:
- Gmail OAuth2 connect/disconnect
- fetch recent Gmail messages with sender, recipient, subject, body, timestamp, and thread ID
- AI reply generation for incoming mail
- tone switching
- thread-aware replies
- style learning from sent mail
- review/edit/approve/reject flow
- approved-only sending
- audit logging
- retry and auth-failure handling
- encrypted token storage
- encrypted user preference storage
- REST API coverage

Intentionally out of scope in the product behavior:
- auto-sending without approval
- reply drafting for `Sent` mail

## Tests

Run the automated test suite:

```bash
npm test
```

The current tests cover:
- encrypted preference persistence
- sent-mail drafting guard
- draft route guard for sent mail
- runtime-safe Gmail redirect URI behavior
- final sent-email record persistence
- duplicate approval idempotency
- draft regeneration clearing old send-request identity
- queue-wide quota cool-off after repeated rate-limit failures
- conservative heuristic fallback behavior

## Known Limitations

- Storage is JSON-backed for simplicity instead of a production database.
- The app syncs a recent mailbox slice rather than the full Gmail history.
- Style learning currently routes through the Gemini provider path when an API key is available; fallback is heuristic.
- There is no background job persistence beyond local JSON state.

## Quota And Idempotency

- Gmail API calls pass through a local quota guard that spaces out sync, analysis, send, and auth requests.
- Send requests carry a stable request key derived from the draft content and thread metadata.
- Drafts keep internal dispatch metadata such as `dispatchState`, `sendRequestKey`, `approvedAt`, and `claimedAt` while preserving the same public draft lifecycle statuses.
- Approved drafts are claimed before dispatch so repeated approvals or queue restarts do not create duplicate Gmail sends for the same request key.
- Editing or regenerating a draft clears the prior send request identity so a newly approved version becomes a new logical send request.
- If Gmail returns quota-related errors repeatedly, the send queue enters a temporary cool-off window and defers more dispatch attempts instead of hammering the API.
- The idempotency guarantee is best-effort at the application layer: if Gmail accepts a send and the process crashes before the sent record is persisted, exact once-only delivery cannot be guaranteed.

## Project Structure

```text
public/
  index.html
  js/
    session/
    shared/
    views/
src/
  database/
  modules/
    shared/
    writingIntelligence/
  routes/
  services/
  utils/
server.js
tests/
```
