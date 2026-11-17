# SmartTriageHub 🚀

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)
**SmartTriageHub** is a next-generation, AI-powered issue aggregator designed to bridge the gap between beginner contributors and complex open-source ecosystems. 

While traditional platforms rely on static, often outdated human-generated tags (like `good-first-issue`), SmartTriageHub utilizes Large Language Models (LLMs) and Retrieval-Augmented Generation (RAG) to dynamically evaluate issue complexity, provide contextual codebase onboarding, and facilitate seamless micro-bounties via integrated payment systems.

## ✨ Key Features

*   **🧠 Dynamic Difficulty Scoring (LLM Integration):** Replaces static tags by feeding issue descriptions and relevant repository files into an LLM to generate a real-time "True Difficulty Score" (1-10).
*   **🤖 Context-Aware Onboarding (RAG):** Features a dedicated AI assistant on every issue page. Backed by a vector database containing repository documentation, it instantly answers contributor queries like *"Which files control this component?"* or *"What are the dependency requirements?"*
*   **🎯 Semantic Developer Matching:** Analyzes a contributor's GitHub profile or pasted resume using vector embeddings to recommend issues perfectly aligned with their technical proficiency and tech stack.
*   **💳 Micro-Bounty & Payment Integration:** Empowers maintainers to attach micro-bounties to verified issues. Integrated payment system APIs ensure smooth, transparent payouts for successful pull requests.
*   **📝 Automated Thread Summarization:** Condenses lengthy, complex GitHub issue threads into actionable, step-by-step resolution blueprints using Natural Language Processing (NLP).

## 🛠️ Tech Stack (Proposed)

*   **Frontend:** Next.js, React, TailwindCSS
*   **Backend:** Node.js / Express (or Python/FastAPI for ML integration)
*   **AI/ML:** OpenAI API, LangChain
*   **Database & Search:** PostgreSQL, Pinecone (Vector Database for Semantic Search)
*   **Payments:** Stripe / Razorpay API (for micro-bounty routing)
*   **Integrations:** GitHub REST API, GitHub Webhooks

## ⚙️ Getting Started

Follow these steps to set up the project locally.

### Prerequisites
*   Node.js (v18+)
*   Git
*   OpenAI API Key
*   GitHub Personal Access Token

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/SmartTriageHub.git
    cd SmartTriageHub
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env.local` file in the root directory and add your keys:
    ```env
    GITHUB_API_TOKEN=your_github_token
    OPENAI_API_KEY=your_openai_key
    PINECONE_API_KEY=your_vector_db_key
    PAYMENT_GATEWAY_KEY=your_payment_api_key
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) to view the application in your browser.

### GitHub OAuth in local development

GitHub sign-in uses the PKCE flow: GitHub returns to `<origin>/auth/callback?code=…`, and that
page exchanges the code for a session. Supabase only honors the redirect if the URL is on the
project's allowlist — otherwise it falls back to the **Site URL** (the production Vercel app).

1. Open your Supabase project → **Authentication → URL Configuration**.
2. Under **Redirect URLs**, add `http://localhost:3000/**` and
   `https://smart-triage-hub.vercel.app/auth/callback`.
3. Keep **Site URL** pointed at the production domain (`https://smart-triage-hub.vercel.app`).

### Database migrations

Run the files in `backend/migrations/` in the Supabase SQL editor. Each one is safe to re-run.

**Fresh project:** run `000_base_schema.sql`, `001_webhook_support.sql`,
`002_contributions_and_streak.sql`, `003_row_level_security.sql`, `004_ai_quota_and_cache.sql`,
in that order.

**Existing production project:**

1. Do not run `000` — it would be a no-op there, and is not needed.
2. Confirm `001` and `002` are applied (`profiles.github_username`, `profiles.last_contribution_date`
   and the `contributions` table exist). Run whichever is missing.
3. Run `003_row_level_security.sql`.
   Policies are additive, so first list any that already exist with
   `select tablename, policyname, cmd, roles from pg_policies where tablename in ('profiles', 'issues');`
   and drop any broader than 003's (for example a "profiles viewable by everyone" select policy).
4. Logged in, check that the board, an issue page and your profile still load.
5. From an authenticated client, confirm `update profiles set xp = 9999` is refused.
6. Run `004_ai_quota_and_cache.sql` before deploying the backend that uses it: the AI routes
   fail until `issues.updated_at` and the `consume_ai_call` function exist. After one AI
   request, `select calls from ai_usage;` should show `1`.

## 🔒 Security & Rate Limiting

The backend applies several defense-in-depth measures out of the box:

*   **CORS allowlist:** Cross-origin requests are restricted to the origins in
    `ALLOWED_ORIGINS` (comma-separated; defaults to `http://localhost:3000`).
*   **Security headers:** Every response carries `X-Content-Type-Options`,
    `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a `Permissions-Policy`,
    and HSTS; the `X-Powered-By` banner is removed.
*   **Rate limiting:** A global 100 req/min/IP ceiling covers the whole API, with
    stricter limits on auth (5 / 15 min) and AI/RAG (10 / min) routes, and one GitHub
    sync per user per minute.
*   **AI budget:** each user gets `AI_DAILY_LIMIT` (default 50) model calls per UTC day;
    results are cached per issue until its title or body changes, and cache hits are free.
    Gemini output is capped at 2048 tokens with a 30-second timeout.
*   **Authenticated mutations:** Profile and ingestion-trigger endpoints require a
    valid Supabase JWT; identity is always taken from the verified token.
    Manual ingestion is further limited to confirmed emails listed in `ADMIN_EMAILS`.
*   **AI routes:** `/api/rag/*` require login and take only an `issueId`; the issue
    text is loaded server-side and passed to the model as untrusted data.
*   **Row-level security:** enabled on every table. Clients can read issues and their
    own profile, and cannot write to any table directly.
*   **Webhook verification:** GitHub webhooks are verified with a timing-safe HMAC
    check against the raw body and fail closed if the secret is unset.
*   **Input hardening:** JSON bodies are capped at 100kb, request payloads are
    validated, and internal error details are never returned to clients.

See `backend/.env.example` for all configurable variables.

## 🏗️ Architecture & AI Pipeline

1.  **Data Ingestion:** A cron job pulls issues tagged with `good-first-issue` or `help-wanted` via the GitHub API.
2.  **Embedding Generation:** The issue description and linked codebase files are converted into vector embeddings.
3.  **Evaluation:** The LLM evaluates the embeddings against standard beginner metrics to assign a difficulty score.
4.  **Serving:** The frontend consumes this enriched data, rendering the AI summaries and initializing the RAG chat context for the user.
