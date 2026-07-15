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

# No secrets are baked into the image. Providers are configured at RUNTIME via
# env (see docker-compose.yml / .env.example). The service defaults to the
# local, keyless Ollama provider.
EXPOSE 3000
CMD ["node", "services/config-validator/dist/main.js"]
