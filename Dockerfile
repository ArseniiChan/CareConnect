# CareConnect backend — Node + Express API, Socket.IO, served on PORT (default 3000).
#
# Production image is single-stage because the backend ships as plain JS
# (no build step). We install only production deps with `npm ci --omit=dev`
# so the final image stays small.
#
# This Dockerfile is consumed by:
#   - Railway (root service, Dockerfile build)
#   - docker-compose.yml (local testing)
#
# Secrets must NOT be baked in. The container reads everything from
# environment variables at runtime (DB_*, JWT_SECRET, FRONTEND_URL, etc.).

FROM node:22-alpine

WORKDIR /app

# Install production dependencies first so this layer caches when only
# application source changes.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the backend source. .dockerignore excludes node_modules, .env,
# frontend, tests, dist, etc.
COPY . .

# Match the documented backend port. Railway will set PORT itself; the app
# already does `process.env.PORT || 3000` so this is just for local runs.
EXPOSE 3000

CMD ["npm", "start"]
