# Dexter 🤖

Dexter is an autonomous financial research agent that thinks, plans, and learns as it works. It performs analysis using task planning, self-reflection, and real-time market data. Think Claude Code, but built specifically for financial research.


<img width="1098" height="659" alt="Screenshot 2026-01-21 at 5 25 10 PM" src="https://github.com/user-attachments/assets/3bcc3a7f-b68a-4f5e-8735-9d22196ff76e" />


## Overview

Dexter takes complex financial questions and turns them into clear, step-by-step research plans. It runs those tasks using live market data, checks its own work, and refines the results until it has a confident, data-backed answer.

**Key Capabilities:**

- **Intelligent Task Planning**: Automatically decomposes complex queries into structured research steps
- **Autonomous Execution**: Selects and executes the right tools to gather financial data
- **Self-Validation**: Checks its own work and iterates until tasks are complete
- **Real-Time Financial Data**: Access to income statements, balance sheets, and cash flow statements
- **Safety Features**: Built-in loop detection and step limits to prevent runaway execution

[![Twitter Follow](https://img.shields.io/twitter/follow/virattt?style=social)](https://twitter.com/virattt)

<img width="875" height="558" alt="Screenshot 2026-01-21 at 5 22 19 PM" src="https://github.com/user-attachments/assets/72d28363-69ea-4c74-a297-dfa60aa347f7" />

### Prerequisites

- [Bun](https://bun.com) runtime (v1.0 or higher)
- OpenAI API key (get [here](https://platform.openai.com/api-keys))
- Financial Datasets API key (get [here](https://financialdatasets.ai))
- Exa API key (get [here](https://exa.ai)) - optional, for web search (preferred)
- Tavily API key (get [here](https://tavily.com)) - optional, fallback web search

#### Installing Bun

If you don't have Bun installed, you can install it using curl:

**macOS/Linux:**

```bash
curl -fsSL https://bun.com/install | bash
```

**Windows:**

```bash
powershell -c "irm bun.sh/install.ps1|iex"
```

After installation, restart your terminal and verify Bun is installed:

```bash
bun --version
```

### Installing Dexter

1. Clone the repository:

```bash
git clone https://github.com/virattt/dexter.git
cd dexter
```

2. Install dependencies with Bun:

```bash
bun install
```

3. Set up your environment variables:

```bash
# Copy the example environment file (from parent directory)
cp env.example .env

# Edit .env and add your API keys (if using cloud providers)
# OPENAI_API_KEY=your-openai-api-key
# ANTHROPIC_API_KEY=your-anthropic-api-key
# GOOGLE_API_KEY=your-google-api-key
# XAI_API_KEY=your-xai-api-key

# (Optional) If using Ollama locally
# OLLAMA_BASE_URL=http://127.0.0.1:11434

# Other required keys
# FINANCIAL_DATASETS_API_KEY=your-financial-datasets-api-key

# Web Search (Exa preferred, Tavily fallback)
# EXA_API_KEY=your-exa-api-key
# TAVILY_API_KEY=your-tavily-api-key
```

### Usage

Run Dexter in interactive mode:

```bash
bun start
```

Or with watch mode for development:

```bash
bun dev
```

### Integration Tests

Some tests hit live Yahoo Finance endpoints and are skipped by default.

Run the Druckenmiller persona integration test:

```bash
RUN_INTEGRATION_TESTS=1 bun test src/tools/yfinance/agent/__tests__/stanley-druckenmiller.test.ts
```

Notes:

- These tests require network access and can be flaky (Yahoo throttling / transient data changes).
- Keep them opt-in for CI unless you control networking and rate limits.

### Example Queries

Try asking Dexter questions like:

- "What was Apple's revenue growth over the last 4 quarters?"
- "Compare Microsoft and Google's operating margins for 2023"
- "Analyze Tesla's cash flow trends over the past year"
- "What is Amazon's debt-to-equity ratio based on recent financials?"

Dexter will automatically:

1. Break down your question into research tasks
2. Fetch the necessary financial data
3. Perform calculations and analysis
4. Provide a comprehensive, data-rich answer

## Architecture

Dexter uses a multi-agent architecture with specialized components:

- **Planning Agent**: Analyzes queries and creates structured task lists
- **Action Agent**: Selects appropriate tools and executes research steps
- **Validation Agent**: Verifies task completion and data sufficiency
- **Answer Agent**: Synthesizes findings into comprehensive responses

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **UI Framework**: [React](https://react.dev) + [Ink](https://github.com/vadimdemedes/ink) (terminal UI)
- **LLM Integration**: [LangChain.js](https://js.langchain.com) with multi-provider support (OpenAI, Anthropic, Google)
- **Schema Validation**: [Zod](https://zod.dev)
- **Language**: TypeScript

### Changing Models

Type `/model` in the CLI to switch between:

- GPT 5.1-mini (OpenAI)
- GPT 4.1 (OpenAI)
- Claude Sonnet 4.5 (Anthropic)
- Gemini 3 (Google)

## How to Contribute

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

**Important**: Please keep your pull requests small and focused. This will make it easier to review and merge.

## License

This project is licensed under the MIT License.
