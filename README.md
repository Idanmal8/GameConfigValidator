# GameConfigValidator

A NestJS microservice that validates **game level configurations** in two layers:

1. **Schema validation** with [ajv](https://ajv.js.org/) (JSON Schema) — structural correctness.
2. **LLM game-design analysis** (Google Gemini) — logical/balancing risks that a schema can't catch, e.g. _"reward too high for an easy level"_ or _"time limit too short."_

It returns a single structured JSON response combining both.

The repo is laid out as a **monorepo** (`services/*`) so it reads as one service in a larger platform — adding a sibling service later needs no restructuring.

---

## Table of contents

- [Architecture](#architecture)
- [Quick start — Docker (zero config)](#quick-start--docker-zero-config)
- [Building & publishing the image](#building--publishing-the-image)
- [Local development](#local-development)
- [API](#api)
- [Example requests & responses](#example-requests--responses)
- [Web UI](#web-ui)
- [Swagger / OpenAPI](#swagger--openapi)
- [Model selection](#model-selection)
- [Testing](#testing)
- [Design notes](#design-notes)

---

## Architecture

```
GameConfigValidator/
├── services/
│   └── config-validator/            # the NestJS app
│       ├── src/
│       │   ├── main.ts              # bootstrap: Swagger + static UI
│       │   ├── config/             # env loading + fail-fast validation
│       │   ├── validation/
│       │   │   ├── validation.controller.ts   # POST /validate
│       │   │   ├── validation.service.ts       # orchestrates schema + LLM
│       │   │   ├── schema/                      # ajv schema + service
│       │   │   └── dto/                         # Swagger DTOs
│       │   └── llm/
│       │       ├── llm.service.ts               # provider-agnostic facade
│       │       ├── providers/                   # gemini + mock
│       │       └── prompt.ts                    # system prompt + JSON parsing
│       ├── public/index.html        # minimal demo UI
│       └── test/e2e/                # Playwright API + UI tests
├── Dockerfile                       # multi-stage, Node 20
├── docker-compose.yml
└── package.json                     # npm workspace root
```

**Request flow:** `POST /validate` → ajv validates the body → if valid, the config is sent to the LLM provider → a combined `{ schema_validation, llm_feedback, provider }` response is returned. If the schema is invalid, the LLM call is skipped (analysing a malformed config is meaningless) and `llm_feedback` is `null`.

---

## Quick start — Docker (zero config)

**If you just want to use the service, you don't need an API key, Node.js, or any configuration.** The Gemini key is already baked into the image published to GitHub Container Registry (GHCR). Because the image is private (it contains the key), authenticate once, then run:

```bash
# 1. one-time login on this machine (any GitHub token with read:packages scope)
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <your-github-username> --password-stdin

# 2. from the repo directory, pull + run
docker compose up
```

That's it — open <http://localhost:3000>. The UI, Swagger (`/api`), and `POST /validate` work immediately; `docker compose up` **pulls** the pre-built image (it never builds from your clone), so the key stays server-side and out of your hands.

No repo checkout? A single `docker run` works too:

```bash
docker run -p 3000:3000 ghcr.io/idanmal8/game-config-validator:latest
```

> **Requirements to run:** just Docker + a one-time `docker login ghcr.io`. No Node.js, no key, no `.env`.

Run fully offline (no LLM calls) for a quick smoke test with the deterministic mock provider:

```bash
docker run -p 3000:3000 -e LLM_PROVIDER=mock ghcr.io/idanmal8/game-config-validator:latest
```

---

## Building & publishing the image

*(For the maintainer only — end users never do this.)*

Publishing is automated by the **[`Publish image to GHCR`](.github/workflows/publish.yml)** GitHub Actions workflow. It builds the image with the key baked in and pushes it to `ghcr.io/idanmal8/game-config-validator`.

**One-time setup:**

1. Add the key as a repo secret: **Settings → Secrets and variables → Actions → New repository secret**, name `GEMINI_API_KEY`, value = your Google AI Studio key. GitHub masks it in all logs.
2. (Optional) Override the baked model via the `GEMINI_MODEL` build-arg in the workflow.

**Publishing:** the workflow runs automatically on every push to `main` that touches the service/Dockerfile, or on demand via **Actions → Publish image to GHCR → Run workflow**. It authenticates to GHCR with the built-in `GITHUB_TOKEN` (no PAT needed for pushing from CI).

Prefer to publish by hand instead? The equivalent local commands:

```bash
export GEMINI_API_KEY=your-google-ai-studio-key
docker build --build-arg GEMINI_API_KEY="$GEMINI_API_KEY" -t ghcr.io/idanmal8/game-config-validator:latest .
docker push ghcr.io/idanmal8/game-config-validator:latest
```

> **⚠️ Security policy.** Because the key is embedded in the image, it is recoverable from the image layers (`docker inspect`). **Keep this package private in GHCR — never make it public.** The repo itself contains no secret: only `.env.example` (a placeholder) is committed, and `.env` files are gitignored.
>
> If keeping the key out of the image ever becomes a requirement, the drop-in upgrade is **Google Secret Manager** (store the key once, fetch it at boot via GCP credentials, commit only the non-secret resource name). The provider abstraction makes this an additive change with no consumer-facing difference.

---

## Local development

*(Only for working on the code — running the published image needs none of this.)*

```bash
npm install

# developers use their own key for live Gemini calls…
cp .env.example services/config-validator/.env   # then set GEMINI_API_KEY
# …or skip the key entirely and develop against the offline mock:
#   set LLM_PROVIDER=mock in that .env

npm run start:dev   # http://localhost:3000  (UI: /, Swagger: /api)
```

Configuration is via environment variables (loaded from `services/config-validator/.env` in dev):

| Variable          | Default                                             | Description                                  |
| ----------------- | --------------------------------------------------- | -------------------------------------------- |
| `LLM_PROVIDER`    | `gemini`                                             | `gemini` or `mock` (offline, deterministic)  |
| `GEMINI_API_KEY`  | —                                                   | Required when `LLM_PROVIDER=gemini`          |
| `GEMINI_MODEL`    | `gemini-3.1-flash-lite`                             | Default model                                |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta`  | API base URL                                 |
| `PORT`            | `3000`                                              | HTTP port                                    |

The app **fails fast at boot** if `LLM_PROVIDER=gemini` and no key is set, so misconfiguration surfaces immediately rather than on the first request. Requires **Node.js ≥ 20**.

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

A minimal demo UI is served at the site root (<http://localhost:3000/>): paste a config, optionally pick a model, click **Validate**, and see schema results + LLM feedback. Includes one-click example buttons.

---

## Swagger / OpenAPI

Interactive API docs are generated at <http://localhost:3000/api>, with the request/response DTOs and examples wired in.

---

## Model selection

Override the model per request:

```bash
curl -s -X POST 'http://localhost:3000/validate?model=gemini-3.1-flash-lite' \
  -H 'Content-Type: application/json' \
  -d '{"level":8,"time_limit":25,"reward":1800,"difficulty":"medium"}' | jq
```

Swapping in another backend (Ollama, Anthropic, …) is a one-file addition: implement the `LlmProvider` interface and register it in `llm.module.ts`.

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
- **Provider abstraction.** `LlmService` depends on an `LlmProvider` interface; the concrete provider is chosen at DI time from config, making new backends and per-request model selection trivial.
- **Defensive LLM parsing.** Model output is coerced into the response shape (extracts JSON from prose/code fences, clamps confidence to `[0,1]`) so a chatty model never breaks the contract.
- **Forgiving JSON input, readable errors.** The body is read as raw text and parsed by the service (not Nest's throwing parser). Common hand-editing slips like a trailing comma left after deleting a field are tolerated (via `JSON5`) so the request reaches schema validation and returns a meaningful `"difficulty: is required"` — instead of a cryptic `Expected double-quoted property name at position 55`. Genuinely broken JSON returns a plain-language, line-located message with likely causes. The UI sends the raw text so a config author sees the same readable errors.
