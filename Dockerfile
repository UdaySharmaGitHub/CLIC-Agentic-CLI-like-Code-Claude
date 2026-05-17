# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ── Stage 2: Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

RUN npm install -g pnpm

# Install production dependencies only
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Copy role/persona markdown files
COPY ["roles based Workflow", "roles based Workflow"]

# Environment variables
# API_KEY   — required: your OpenAI-compatible API key
# BASE_URL  — optional: defaults to https://api.openai.com/v1
ENV NODE_ENV=production

# Persist chat history across container restarts by mounting a volume:
#   docker run -v clic_history:/app/data -e AGENT_HISTORY_FILE=/app/data/chat_history.json ...
VOLUME ["/app/data"]

# CLIC is an interactive REPL — always run with:  docker run -it ...
ENTRYPOINT ["node", "dist/index.js"]
