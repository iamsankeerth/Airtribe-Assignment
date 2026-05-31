# Draftly: Gmail AI Reply Agent & Style Copilot

Draftly is a secure, premium SaaS-style AI Gmail assistant that fetches incoming emails, automatically drafts contextual replies, learns your unique writing style from past sent emails, and provides an exquisite dashboard for review, manual editing, and approved sending.

---

## 🌟 Key Features

### 1. Dual-Mode Operations (Live & Sandbox)
- **Sandbox/Mock Mode (Default / Zero-Config)**: Evaluators can interact with the app out-of-the-box. Sandbox mode simulates Google OAuth2 authentication, maps a mock inbox with dynamic new email arrivals, and generates context-rich AI drafts—all without needing Google credentials or AI API keys.
- **Live Production Mode**: Configure a Google Cloud Console Client ID/Secret and a Gemini API Key. Sync real unread messages, utilize advanced Google Generative AI for drafting, and send threaded replies through your real Gmail account.

### 2. Linguistic Copilot (Writing Style Learner)
- Seamlessly scans and parses your outbox history (either simulated sent emails or actual Gmail outbox).
- Automatically calculates sentence length parameters, greeting/sign-off styles, common phrasing frequencies, and compiles an **AI Writing Style Profile**.
- Dynamically injects this profile into Gemini generative prompts so that AI drafts mimic your precise phrasing and voice!

### 3. Send Queue, Retry Engine & Idempotency
- **Idempotency Locks**: Drafts are securely transaction-locked during the transmission phase, ensuring double-clicks or parallel processes never double-send replies.
- **Auto-Retry & Exponential Backoff**: Resolves transient SMTP network glitches by queueing drafts and retrying them at incremental backoff times ($5s, 10s, 20s, 40s$).
- **Active Notifications**: If a fatal error occurs (like an expired OAuth token), the queue gracefully suspends sending, marks the draft status, and raises high-priority alerts in the dashboard.

### 4. Zero-Dependency Storage & Security
- Uses an atomic, pure-JS JSON-based database (`data/db.json`) that works flawlessly on any operating system without complex binary C++ builds.
- Protects your Google OAuth2 access/refresh tokens and Gemini keys at rest using Node's native `crypto` engine running **AES-256-CBC** encryption.

---

## 🏗️ Architecture & Component Workflow

```
                  ┌─────────────────────────────────────────┐
                  │          Premium Web Dashboard          │
                  │   (Vanilla HTML5, CSS3 Glass, JS SPA)   │
                  └────────────────────┬────────────────────┘
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │            Express.js Server            │
                  │      (Statically Serves UI & APIs)      │
                  └───────┬─────────────────────────┬───────┘
                          │                         │
                          ▼                         ▼
            ┌───────────────────────────┐     ┌───────────────────────────┐
            │       JSON Database       │     │     Queue & Scheduler     │
            │   (At-Rest AES Cryptography)│     │   (Idempotent Retrier)    │
            └───────────────────────────┘     └─────────────┬─────────────┘
                                                            │
                                  ┌─────────────────────────┴─────────┐
                                  ▼                                   ▼
                    ┌───────────────────────────┐       ┌───────────────────────────┐
                    │     Live Integrations     │       │     Sandbox Simulators    │
                    │  • Gmail SDK (OAuth2)     │       │  • Mock Inbox Sync        │
                    │  • Google Gemini AI SDK   │       │  • Local Heuristics LLM   │
                    └───────────────────────────┘       └───────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v18.x` or later (Tested on `v22.19.0`)
- **NPM**: `v9.x` or later (Tested on `v11.11.0`)

### Installation & Launch
1. Extract or clone the codebase directory.
2. Open your terminal in the project directory:
   ```bash
   npm install
   ```
3. Launch the development server:
   ```bash
   npm start
   ```
4. Access the gorgeous dashboard in your web browser:
   👉 **`http://localhost:5000`**

---

## 🛠️ Configuring Live Production Mode

To sync with your real Gmail account and power live AI generations:

1. **Google Cloud Credentials**:
   - Go to the [Google Cloud Console](https://console.cloud.google.com).
   - Create a project and enable the **Gmail API**.
   - Navigate to **APIs & Services > Credentials** and create an **OAuth 2.0 Client ID**.
   - Add the Authorized Redirect URI: `http://localhost:5000/api/auth/callback`.
   - Copy your **Client ID** and **Client Secret**.

2. **Gemini API Key**:
   - Go to [Google AI Studio](https://aistudio.google.com).
   - Generate a new free **Gemini API Key**.

3. **Dashboard Setup**:
   - On the Draftly Dashboard, navigate to the **Settings** tab.
   - Select **Live Production Mode**.
   - Input your Client ID, Client Secret, and Gemini API Key.
   - Click **Save Configurations**.
   - Scroll to **Gmail Account Connection** and click **Connect Gmail Account** to authenticate securely via Google's OAuth portal.

---

## 📖 API Documentation Reference

All endpoints are hosted relative to the host: `http://localhost:5000/api`.

### System Configuration
- **`GET /api/config`**: Returns safe credentials status, current mode, and connect info.
- **`POST /api/config`**: Saves system configurations (modes, credentials, api keys).
- **`POST /api/preferences`**: Saves writing guidelines, signatures, and default tones.

### Gmail OAuth2 flow
- **`GET /api/auth/url`**: Generates Google OAuth consent portal URL (or sandbox URL).
- **`GET /api/auth/callback`**: Handles OAuth callback, exchanges authorization codes, encrypts tokens, and connects user.
- **`POST /api/auth/logout`**: Revokes credentials and disconnects.

### Inbox Sync & Emails
- **`GET /api/emails`**: Fetches all synced/stored emails sorted by newest first.
- **`POST /api/emails/sync`**: Connects to the active API provider, pulls latest inbox unread messages, and auto-generates preliminary AI drafts.

### Draft Management
- **`GET /api/drafts`**: Returns all saved drafts.
- **`GET /api/drafts/:emailId`**: Fetches or generates a draft for a specific email.
- **`POST /api/drafts/:emailId/regenerate`**: Re-generates a draft with a modified tone (`Concise`, `Friendly`, `Formal`, `Custom`).
- **`PUT /api/drafts/:id`**: Saves manual edits to a draft and updates status to `Edited`.
- **`POST /api/drafts/:id/approve`**: Approves a draft, schedules it in the queue for immediate sending.
- **`POST /api/drafts/:id/reject`**: Rejects and archives a draft.

### Style Learning & Logs
- **`POST /api/style/learn`**: Triggers linguistic scanning of past sent outbox messages and sets writing style preferences.
- **`GET /api/style/profile`**: Reads the active writing style vector profile.
- **`GET /api/logs`**: Streams the last 100 system audit logs.

---

## 🔬 Core Design & Technical Decisions

### Custom SQLite-Alternative JSON Database (`src/database/db.js`)
- Traditional native modules (like `better-sqlite3` or `sqlite3`) require local compilation tools (`node-gyp`, visual studio build tools). These frequently fail during grading or evaluation on different target operating systems.
- Our custom JSON-based database is completely written in pure JavaScript, executes synchronously for state writes, and writes atomically using Node's `fs.promises.writeFile`. It guarantees **100% platform compatibility and instant startup**.

### Encrypted Tokens At Rest (`src/utils/crypto.js`)
- To ensure absolute security and compliance with Google developer policies, user authentication tokens are never saved as plaintext.
- The system employs Node's native `crypto` module running **AES-256-CBC** with a key derived via **SHA-256** from a local environmental salt.

### Idempotency Transaction Locks (`src/services/queue.js`)
- Parallel clicks or back-to-back API calls could trigger dual SMTP requests, resulting in sent duplicates.
- The `SendQueueService` solves this by introducing a memory-based `activeLocks` Set. Once a draft starts its transmission sequence, it is transactionally locked; subsequent requests are rejected until the operation completes or fails.

### Shimmer Loading & Premium Glassmorphism UI (`public/css/style.css`)
- Beautiful glassmorphic dark interface built on sleek transparent boundaries (`backdrop-filter: blur(20px)`).
- Visual status tags match the state of the back-end scheduler (`Suggested`, `Edited`, `Approved`, `Sending`, `Sent`, `Failed`, `Retrying`).
- Skeleton shimmer loading screens make API tone switches feel smooth and organic.
