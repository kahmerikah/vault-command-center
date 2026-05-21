FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package*.json ./
# Prefer deterministic installs when lockfile exists, but allow first-run builds
# in environments where package-lock.json has not been generated yet.
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi
COPY frontend .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/frontend.nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
