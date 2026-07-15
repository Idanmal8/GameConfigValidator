# GameConfigValidator

A NestJS microservice that validates **game level configurations** in two layers:

1. **Schema validation** with [ajv](https://ajv.js.org/) (JSON Schema) — structural correctness.
2. **LLM game-design analysis** — logical/balancing risks a schema can't catch, e.g. _"reward too high for an easy level"_ or _"time limit too short."_

It returns a single structured JSON response combining both.

> The LLM layer is built on **[LangChain](https://js.langchain.com/)** with **multiple selectable providers** — **Ollama** (local, no key, the default), **Google Gemini**, and **OpenAI** — plus a deterministic `mock`. Feedback is produced via LangChain **structured output** (Zod-validated). No API keys are baked into anything: the local Ollama default means `docker compose up` works with **zero secrets**, and cloud providers activate only when you supply your own key.

The repo is laid out as a **monorepo** (`services/*`) so it reads as one service in a larger platform — adding a sibling service later needs no restructuring.

---

## Table of contents

- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Building the image](#building-the-image)
- [Local development](#local-development)
- [API](#api)
- [Example requests & responses](#example-requests--responses)
- [Web UI](#web-ui)
- [Swagger / OpenAPI](#swagger--openapi)
- [Model selection](#model-selection)
- [Testing](#testing)
- [Design notes](#design-notes)

---

## Quick start

**No API key, no `.env`, no Node.js needed.** From the repo directory:

```bash
docker compose up
```

On a fresh clone this **builds the image automatically** (the service has a `build:` step), then starts two services: a local **Ollama** container (the keyless default LLM) and the validator. Open <http://localhost:3000> — the UI, Swagger (`/api`), and `POST /validate` all work.

> Use `docker compose up --build` only when you've **changed the source** and want the image rebuilt — a plain `up` reuses the existing image.

> **First run** pulls the Ollama model (`llama3.2`, ~2 GB) into a Docker volume — that takes a few minutes and needs a few GB of RAM. Requests may return _"model still starting"_ until the pull finishes; after that it's cached. Subsequent `docker compose up` runs are instant.

Want a real cloud model instead of local? Provide **your own** key (nothing is shipped) and select the provider:

```bash
GEMINI_API_KEY=your-key docker compose up      # enables the gemini provider
# then: POST /validate?provider=gemini
```

No LLM at all (instant, deterministic) for a smoke test:

```bash
docker run -p 3000:3000 -e LLM_PROVIDER=mock game-config-validator
```

---

## Architecture

```
GameConfigValidator/
├── services/
│   └── config-validator/                 # the NestJS app
│       ├── src/
│       │   ├── main.ts                   # bootstrap: Swagger, static UI, raw-body parser
│       │   ├── app.module.ts
│       │   ├── config/
│       │   │   ├── configuration.ts      # env-derived config (providers, models)
│       │   │   └── env.validation.ts     # fail-fast env validation
│       │   ├── validation/
│       │   │   ├── validation.controller.ts   # POST /validate · GET /providers
│       │   │   ├── validation.service.ts       # JSON parse + schema + LLM orchestration
│       │   │   ├── schema/                      # ajv schema + service
│       │   │   └── dto/                         # Swagger DTOs
│       │   └── llm/
│       │       ├── llm.service.ts               # LangChain facade + provider catalog
│       │       ├── model.factory.ts             # builds a ChatModel per provider
│       │       ├── feedback.schema.ts           # Zod schema for structured output
│       │       ├── prompt.ts                     # ChatPromptTemplate + JSON fallback parse
│       │       ├── llm.types.ts
│       │       └── providers/mock.provider.ts   # deterministic offline provider
│       ├── public/                       # demo UI (no build step)
│       │   ├── index.html                # view (structure)
│       │   ├── styles.css
│       │   └── js/                        # api · view · editor · highlighter · controller · app
│       └── test/e2e/                     # Playwright API + UI tests
├── Dockerfile                            # multi-stage, Node 20 (keyless)
├── docker-compose.yml                    # config-validator + Ollama (local LLM)
└── package.json                          # npm workspace root
```

**Request flow:** `POST /validate` → the body is parsed (tolerant of trailing commas) → **ajv** validates the schema → if valid, the config goes to the selected **LangChain** provider for structured feedback → a combined `{ schema_validation, llm_feedback, provider, model }` response is returned. If the schema is invalid, the LLM call is skipped (analysing a malformed config is meaningless) and `llm_feedback` is `null`.

---

## Building the image

The image is **keyless** — no secret is baked in (providers are configured at runtime).

**For normal use, prefer `docker compose up`** (see [Quick start](#quick-start)). It builds this image **and** starts the Ollama sibling with the right env and networking, so the service works end-to-end — that's what "just runs." (Add `--build` only to rebuild after code changes.)

`docker build` only produces the image; it does **not** start anything or launch Ollama:

```bash
docker build -t game-config-validator .
```

A container from that image runs on its own, but with no Ollama reachable it needs a cloud key (or a reachable `OLLAMA_BASE_URL`) to do LLM analysis:

```bash
# offline smoke test (schema validation + deterministic mock feedback)
docker run -p 3000:3000 -e LLM_PROVIDER=mock game-config-validator

# or point it at a cloud provider with your own key
docker run -p 3000:3000 -e LLM_PROVIDER=gemini -e GEMINI_API_KEY=your-key game-config-validator
```

> **Secret posture.** Nothing sensitive is in the repo or the image. Each user supplies their **own** cloud key at runtime (via `.env` / shell), or uses the keyless Ollama default. Passing a key as a runtime env var is the 12-factor standard; it isn't cryptographic protection (env is readable via `docker inspect`), but combined with "never in git, never in the image" it's the honest, professional baseline. For central rotation/audit, the drop-in upgrade is a secret manager (e.g. Google Secret Manager) fetched at boot.

---

## Local development

*(Only for working on the code.)*

```bash
npm install

cp .env.example services/config-validator/.env
#  default LLM_PROVIDER=ollama needs a local Ollama running (`ollama serve`)
#  or set LLM_PROVIDER=mock to develop with zero dependencies,
#  or fill GEMINI_API_KEY / OPENAI_API_KEY to use a cloud provider

npm run start:dev   # http://localhost:3000  (UI: /, Swagger: /api)
```

Configuration is via environment variables (loaded from `services/config-validator/.env` in dev). Keys are **optional** — a provider activates only when its key is present; selecting an unconfigured provider returns a clear error.

| Variable          | Default                    | Description                                             |
| ----------------- | -------------------------- | ------------------------------------------------------- |
| `LLM_PROVIDER`    | `ollama`                   | Default provider: `ollama` / `gemini` / `openai` / `mock` |
| `OLLAMA_BASE_URL` | `http://localhost:11434`   | Ollama endpoint (local, no key)                         |
| `OLLAMA_MODEL`    | `llama3.2`                 | Default Ollama model                                    |
| `GEMINI_API_KEY`  | —                          | Enables the `gemini` provider                           |
| `GEMINI_MODEL`    | `gemini-3.1-flash-lite`    | Default Gemini model                                    |
| `OPENAI_API_KEY`  | —                          | Enables the `openai` provider                           |
| `OPENAI_MODEL`    | `gpt-4o-mini`              | Default OpenAI model                                    |
| `PORT`            | `3000`                     | HTTP port                                               |

Requires **Node.js ≥ 20**.

---

## API

### `POST /validate`

**Body:** the raw level configuration JSON.

**Query params:** `model` _(optional)_ — override the LLM model for this request.

**Response:**

```jsonc
{
  "schema_validation": { "valid": true, "errors": [] },
  "llm_feedback": {
    "analysis": "…",
    "suggested_actions": ["…"],
    "confidence": 0.87           // bonus: model-reported confidence 0..1
  },
  "provider": "gemini"            // which provider produced the feedback
}
```

Config schema: `level` (integer ≥ 1), `difficulty` (`easy`|`medium`|`hard`), `reward` (integer ≥ 0), `time_limit` (integer ≥ 1). Unknown properties are rejected.

---

## Example requests & responses

### 1. Reward too high for an easy level

```bash
curl -s -X POST http://localhost:3000/validate \
  -H 'Content-Type: application/json' \
  -d '{"level":12,"time_limit":60,"reward":5000,"difficulty":"easy"}' | jq
```

```json
{
  "schema_validation": { "valid": true, "errors": [] },
  "llm_feedback": {
    "analysis": "The reward value of 5000 seems disproportionately high for an easy level with a generous 60-second time limit.",
    "suggested_actions": [
      "Reduce reward to 100-500 for easy difficulty",
      "Increase difficulty if you wish to keep a high reward"
    ],
    "confidence": 0.9
  },
  "provider": "gemini"
}
```

### 2. Time too short for a hard level

```bash
curl -s -X POST http://localhost:3000/validate \
  -H 'Content-Type: application/json' \
  -d '{"level":5,"time_limit":10,"reward":500,"difficulty":"hard"}' | jq
```

```json
{
  "schema_validation": { "valid": true, "errors": [] },
  "llm_feedback": {
    "analysis": "A 10-second time limit on a hard level may be too strict and frustrate players for a 500 reward amount.",
    "suggested_actions": [
      "Increase time_limit to 20-30 seconds",
      "Balance reward if keeping a very short time limit"
    ],
    "confidence": 0.85
  },
  "provider": "gemini"
}
```

### 3. Balanced config

```bash
curl -s -X POST http://localhost:3000/validate \
  -H 'Content-Type: application/json' \
  -d '{"level":1,"time_limit":120,"reward":100,"difficulty":"easy"}' | jq
```

```json
{
  "schema_validation": { "valid": true, "errors": [] },
  "llm_feedback": {
    "analysis": "This configuration seems reasonable for a starting level with plenty of time and a modest reward.",
    "suggested_actions": ["No action needed"],
    "confidence": 0.8
  },
  "provider": "gemini"
}
```

### 4. Schema-invalid config (LLM skipped)

```bash
curl -s -X POST http://localhost:3000/validate \
  -H 'Content-Type: application/json' \
  -d '{"level":1,"difficulty":"impossible"}' | jq
```

```json
{
  "schema_validation": {
    "valid": false,
    "errors": [
      "difficulty: must be equal to one of the allowed values",
      "reward: must have required property 'reward'",
      "time_limit: must have required property 'time_limit'"
    ]
  },
  "llm_feedback": null,
  "provider": "gemini"
}
```

> LLM `analysis` wording varies per model/run; the `mock` provider returns the deterministic phrasing above.

---

## Web UI

A demo UI is served at the site root (<http://localhost:3000/>): paste a config, optionally pick a provider/model, click **Validate**, and see schema results + LLM feedback. Includes one-click examples and a live JSON-issue highlighter.

**Editor shortcuts:** `Tab` / `Shift+Tab` indent/dedent · `Alt`/`Ctrl` + `↑`/`↓` move the current line · `⌘`/`Ctrl` + `S` (or the **Format** button) prettifies the JSON (tolerating a trailing comma).

The client is organised as small ES modules under `public/js/` — `api.js` (server access), `view.js` (rendering), `editor.js` + `highlighter.js` (editor behaviors), and `controller.js` (wiring) — a lightweight view / data / controller split with no build step.

---

## Swagger / OpenAPI

Interactive API docs are generated at <http://localhost:3000/api>, with the request/response DTOs and examples wired in.

---

## Providers & model selection

Pick the provider and model per request with `?provider=` and `?model=` (both optional; defaults come from config). The UI has a dropdown grouped by provider, and the response echoes the `provider` + `model` that produced the feedback.

| Provider | Key needed | Example models |
| -------- | ---------- | -------------- |
| `ollama` (default) | none (local) | `llama3.2`, `mistral` |
| `gemini` | `GEMINI_API_KEY` | `gemini-3.1-flash-lite`, `gemini-3.5-flash` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o-mini`, `gpt-4o` |
| `mock` | none | deterministic (tests/offline) |

```bash
# use OpenAI's gpt-4o-mini (requires OPENAI_API_KEY on the server)
curl -s -X POST 'http://localhost:3000/validate?provider=openai&model=gpt-4o-mini' \
  -H 'Content-Type: application/json' \
  -d '{"level":8,"time_limit":25,"reward":1800,"difficulty":"medium"}' | jq
```

Built on **LangChain**: each provider is a `ChatModel` from the model factory, so adding another (Anthropic, Mistral, …) is a single `case` in `model.factory.ts`.

---

## Testing

```bash
# unit tests (Jest) — schema rules, prompt/JSON parsing, orchestration
npm test

# e2e tests (Playwright) — real server (mock provider) + UI, on port 3100
cd services/config-validator
npx playwright install chromium   # first time only
npm run test:e2e
```

- **Unit** (Jest): ajv schema, `parseFeedback` (handles fenced/embedded JSON, clamps confidence), and the validation orchestration (incl. skipping the LLM on invalid schema).
- **E2E** (Playwright): boots the app with `LLM_PROVIDER=mock` on a dedicated port and tests both the `/validate` API and the browser UI — no API key or network needed.

---

## Design notes

- **Why ajv?** The config is a portable contract (other tools/languages may author it), JSON Schema is the natural format for it, and ajv's `{ valid, errors }` output maps directly onto the response — no fighting Nest's throw-on-invalid pipe. For a schema that lived only inside this service, `zod` (with `zod-to-json-schema`) would be the more idiomatic TypeScript choice; ajv was chosen deliberately for the contract/portability angle.
- **Reference ranges as guidance, not rules.** The balancing ranges live in the prompt as guidance so the LLM reasons about patterns rather than us hard-coding thresholds.
- **LangChain provider layer.** `LlmService` builds a LangChain `ChatModel` via `model.factory.ts` (one `case` per provider) and asks for **structured output** (`withStructuredOutput` + a Zod schema), so `llm_feedback` is typed and schema-validated. A defensive text-parse fallback covers local models that don't support structured output, and the deterministic `mock` provider keeps tests/offline runs LLM-free.
- **Keyless by default.** Ollama (local) is the default provider, so the stack runs with zero secrets; cloud providers activate only when their key is supplied at runtime. No key is committed or baked into the image.
- **Defensive LLM parsing.** Model output is coerced into the response shape (extracts JSON from prose/code fences, clamps confidence to `[0,1]`) so a chatty model never breaks the contract.
- **Forgiving JSON input, readable errors.** The body is read as raw text and parsed by the service (not Nest's throwing parser). Common hand-editing slips like a trailing comma left after deleting a field are tolerated (via `JSON5`) so the request reaches schema validation and returns a meaningful `"difficulty: is required"` — instead of a cryptic `Expected double-quoted property name at position 55`. Genuinely broken JSON returns a plain-language, line-located message with likely causes. The UI sends the raw text so a config author sees the same readable errors.
