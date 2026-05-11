# CareConnect frontend — Vite + React SPA, served by nginx.
#
# Multi-stage build:
#   1. node:22-alpine builds the Vite app to /app/dist
#   2. nginx:alpine serves the static bundle on port 80
#
# Vite inlines environment variables at BUILD TIME, not runtime. That means
# VITE_API_BASE_URL has to be passed as a build arg — once the bundle is
# produced, changing the env var on the running container has no effect.
# Railway lets you set build-time variables per-service; for local testing,
# docker-compose passes it via `args:`.
#
# Only public values (the public backend URL) should ever be passed in.
# Don't put secrets behind a VITE_ prefix; they end up in the JS bundle.

# ─── 1. Build stage ────────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Build-time API URL. Will be inlined into the Vite bundle. Default keeps
# local builds pointing at the dockerized backend; production passes the
# Railway-hosted backend URL.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Install all deps (we need devDependencies like vite + plugins to build).
COPY package*.json ./
RUN npm ci

# Build the SPA. Output lands in /app/dist.
COPY . .
RUN npm run build

# ─── 2. Serve stage ────────────────────────────────────────────────
FROM nginx:alpine

# SPA fallback config — React Router needs every non-asset path to fall
# back to index.html so /login, /admin/revenue, /appointments/:id all
# resolve after a direct refresh.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static bundle.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
