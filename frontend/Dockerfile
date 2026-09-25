# syntax=docker/dockerfile:1

###############################################################################
# deps - install dependencies only (cached separately from source changes)
###############################################################################
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

###############################################################################
# builder - build the standalone Next.js output
###############################################################################
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# No NEXT_PUBLIC_* build args: the browser talks to same-origin relative URLs, so the
# image contains no domain and is identical for every environment.
RUN npm run build

###############################################################################
# runner - minimal production image, non-root user
###############################################################################
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# `output: 'standalone'` traces only the files needed to run the server.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# 127.0.0.1, not localhost - Alpine resolves "localhost" to ::1 first and the Next.js
# server doesn't listen on IPv6 loopback.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server.js"]
