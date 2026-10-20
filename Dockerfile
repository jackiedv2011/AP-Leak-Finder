# Reclaim production image: the Node API serving the built React app and the
# landing site from dist/, with SQLite on a mounted volume at /data.
# See docs/deploy.md. Secrets come from the host's environment at run time;
# nothing secret is ever copied into or built into this image.

# ---- build: compile the app and the landing site into dist/ ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The Stripe publishable key is public by design and is compiled into the
# browser bundle, so it is a build argument. Never pass a secret this way.
ARG VITE_STRIPE_PUBLISHABLE_KEY=
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY
RUN npm run build
# The server imports a few modules from src/ (recovery eligibility). Stage src/
# without its images, which only the browser bundle needs.
RUN mkdir -p /runtime && cp -R src /runtime/src && rm -rf /runtime/src/assets

# ---- runtime dependencies only ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---- runtime ----
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=8787 \
    DATABASE_PATH=/data/reclaim.sqlite
WORKDIR /app
COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --chown=root:root package.json ./
# Node runs the TypeScript server directly (type stripping). dist/ is what the browser gets.
COPY --chown=root:root server ./server
COPY --from=build --chown=root:root /runtime/src ./src
COPY --from=build --chown=root:root /app/dist ./dist
# The app files stay root-owned and read-only to the server; only /data is writable.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server/index.ts"]
