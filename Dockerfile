FROM node:22-alpine AS base

# 1. Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
# Avoid ETXTBSY from native postinstall binaries (notably esbuild) when the
# build context is mounted from a Windows/WSL drive. Prisma is generated in
# the builder stage below, after dependencies are fully copied into the image.
RUN npm ci --ignore-scripts

# Generate Prisma once without building the Next.js application. The worker
# target can reuse this stage and no longer pays the cost of a full web build.
FROM deps AS generated-deps
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN npx prisma generate

# 2. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=generated-deps /app/node_modules ./node_modules
COPY . .
ENV NODE_OPTIONS=--max-old-space-size=3072
RUN npx prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=1
RUN npm run build

# 3. Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy Prisma schema and migrations for runtime deployment
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Copy public folder
COPY --from=builder /app/public ./public
# Copy next.js standalone output and static files
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]

# Dedicated queue worker: generated Prisma client + TypeScript sources only.
# This target intentionally skips `next build` and the standalone web bundle.
FROM base AS worker
WORKDIR /app
RUN apk add --no-cache openssl \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=generated-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs package.json tsconfig.json ./
COPY --chown=nextjs:nodejs prisma ./prisma
COPY --chown=nextjs:nodejs prisma.config.ts ./prisma.config.ts
COPY --chown=nextjs:nodejs scripts ./scripts
COPY --chown=nextjs:nodejs src ./src
USER nextjs
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ps | grep -q '[a]i-worker.ts' || exit 1
CMD ["npm", "run", "worker"]
