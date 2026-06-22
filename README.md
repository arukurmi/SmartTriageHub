# OptiIssue 🚀

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**OptiIssue** is a next-generation, AI-powered issue aggregator designed to bridge the gap between beginner contributors and complex open-source ecosystems. 

While traditional platforms rely on static, often outdated human-generated tags (like `good-first-issue`), OptiIssue utilizes Large Language Models (LLMs) and Retrieval-Augmented Generation (RAG) to dynamically evaluate issue complexity, provide contextual codebase onboarding, and facilitate seamless micro-bounties via integrated payment systems.

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
    git clone [https://github.com/yourusername/OptiIssue.git](https://github.com/yourusername/OptiIssue.git)
    cd OptiIssue
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

## 🏗️ Architecture & AI Pipeline

1.  **Data Ingestion:** A cron job pulls issues tagged with `good-first-issue` or `help-wanted` via the GitHub API.
2.  **Embedding Generation:** The issue description and linked codebase files are converted into vector embeddings.
3.  **Evaluation:** The LLM evaluates the embeddings against standard beginner metrics to assign a difficulty score.
4.  **Serving:** The frontend consumes this enriched data, rendering the AI summaries and initializing the RAG chat context for the user.

## 🤝 Contributing
Contributions are always welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) to learn how to get started.

## 👨‍💻 Author

**Aryansh Kurmi** 
*   **Role:** Software Developer
*   **Focus:** Building AI-driven developer tools, seamless payment system architectures, and optimized web applications.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.