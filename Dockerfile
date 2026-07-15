# ── Build stage ───────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps using the workspace manifests (better layer caching)
COPY package.json package-lock.json* ./
COPY services/config-validator/package.json ./services/config-validator/
RUN npm install

# Compile the service
COPY . .
RUN npm run build --workspace services/config-validator

# ── Runtime stage ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY services/config-validator/package.json ./services/config-validator/
RUN npm install --omit=dev

COPY --from=builder /app/services/config-validator/dist ./services/config-validator/dist
COPY --from=builder /app/services/config-validator/public ./services/config-validator/public

# ── Baked-in configuration (internal tool) ────────────────
# Supply the key at BUILD time from the builder's shell / CI secret — it is
# never read from the repo:
#     docker build --build-arg GEMINI_API_KEY=$GEMINI_API_KEY -t game-config-validator .
# Kept at the end so changing the key only rebuilds this tiny layer.
#
# ⚠️  The key becomes part of the image (recoverable via `docker inspect`).
#     Distribute this image via a PRIVATE registry only — never push it publicly.
ARG GEMINI_API_KEY=""
ARG GEMINI_MODEL="gemini-3.1-flash-lite"
ARG LLM_PROVIDER="gemini"
ENV GEMINI_API_KEY=$GEMINI_API_KEY \
    GEMINI_MODEL=$GEMINI_MODEL \
    LLM_PROVIDER=$LLM_PROVIDER

EXPOSE 3000
CMD ["node", "services/config-validator/dist/main.js"]
