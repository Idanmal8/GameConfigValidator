# GameConfigValidator

A NestJS microservice that validates **game level configurations** in two layers:

1. **Schema validation** with [ajv](https://ajv.js.org/) (JSON Schema) — structural correctness.
2. **LLM game-design analysis** (Google Gemini) — logical/balancing risks that a schema can't catch, e.g. _"reward too high for an easy level"_ or _"time limit too short."_

It returns a single structured JSON response combining both.

The repo is laid out as a **monorepo** (`services/*`) so it reads as one service in a larger platform — adding a sibling service later needs no restructuring.

---

## Table of contents

- [Architecture](#architecture)
- [Requirements](#requirements)
- [Install & run (local)](#install--run-local)
- [Configure the LLM API key](#configure-the-llm-api-key)
- [Run with Docker](#run-with-docker)
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

## Requirements

- **Node.js ≥ 20**
- npm ≥ 9
- (optional) Docker, for containerised runs
- A **Google AI Studio API key** for the default Gemini provider (free tier) — or use the offline `mock` provider, which needs no key.

---

## Install & run (local)

```bash
# from the repo root
npm install

# copy the env template and fill in your key
cp .env.example services/config-validator/.env
#   -> set GEMINI_API_KEY, or set LLM_PROVIDER=mock to run offline

# start in watch mode
npm run start:dev
```

The service starts on **http://localhost:3000**:

- UI: <http://localhost:3000/>
- Swagger: <http://localhost:3000/api>
- API: `POST http://localhost:3000/validate`

> **No key handy?** Set `LLM_PROVIDER=mock` in the `.env` and everything works offline with deterministic, rule-based feedback (also what the e2e tests use).

---

## Configure the LLM API key

1. Create a key at **[Google AI Studio → API keys](https://aistudio.google.com/app/apikey)** (free tier).
2. Put it in `services/config-validator/.env`:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-google-ai-studio-key-here
GEMINI_MODEL=gemini-3.1-flash-lite
```

Environment variables:

| Variable          | Default                                             | Description                                  |
| ----------------- | --------------------------------------------------- | -------------------------------------------- |
| `LLM_PROVIDER`    | `gemini`                                             | `gemini` or `mock` (offline, deterministic)  |
| `GEMINI_API_KEY`  | —                                                   | Required when `LLM_PROVIDER=gemini`          |
| `GEMINI_MODEL`    | `gemini-3.1-flash-lite`                                  | Default model                                |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta`  | API base URL                                 |
| `PORT`            | `3000`                                              | HTTP port                                    |

The app **fails fast at boot** if `LLM_PROVIDER=gemini` and no key is set, so misconfiguration surfaces immediately rather than on the first request.

---

## Run with Docker

This is an **internal tool**, so the Gemini key is **baked into the image at build time** and the image is shared via a **private** registry. Consumers then run it with **zero configuration** — no `.env` to hand off.

The key is supplied at build time from the **builder's shell / CI secret** (a `--build-arg`). It is never read from the repo and never committed.

### Build (the person/CI who holds the key)

```bash
# key comes from your shell/CI secret, not the repo
export GEMINI_API_KEY=your-google-ai-studio-key

docker build --build-arg GEMINI_API_KEY="$GEMINI_API_KEY" -t game-config-validator .
# or, equivalently, via compose:
GEMINI_API_KEY="$GEMINI_API_KEY" docker compose build
```

Optionally override the baked model: `--build-arg GEMINI_MODEL=gemini-3.5-flash`.

### Distribute (private registry only)

```bash
docker tag game-config-validator <your-private-registry>/game-config-validator:latest
docker push <your-private-registry>/game-config-validator:latest
```

### Run (any team member — no key needed)

```bash
docker run -p 3000:3000 game-config-validator          # local image
# or after pulling from your registry:
docker run -p 3000:3000 <your-private-registry>/game-config-validator:latest
```

The service is then on <http://localhost:3000>, ready to use — the key is already inside.

Run offline (no key at all) with the mock provider:

```bash
docker run -p 3000:3000 -e LLM_PROVIDER=mock game-config-validator
```

> **⚠️ Security policy.** Because the key is embedded in the image, it is recoverable from the image layers (`docker inspect`). **This image must live only in a private, access-controlled registry — never push it to a public one.** The repo itself contains no secret: only `.env.example` (a placeholder) is committed, and `.env` files are gitignored. If you'd prefer the key *not* be in the image, see [Alternative: no secret in the image](#alternative-no-secret-in-the-image).

### Alternative: no secret in the image

If keeping the key out of the image becomes a requirement (e.g. before wider distribution), the drop-in upgrade is **Google Secret Manager**: store the key once, have the container fetch it at boot via GCP credentials, and commit only the non-secret secret *resource name*. The provider abstraction means this is an additive change — no consumer-facing differences.

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
