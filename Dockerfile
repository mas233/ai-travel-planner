## Multi-stage Dockerfile: build React/Vite app and serve with Nginx

# ---------- Build stage ----------
FROM node:18-alpine AS builder

WORKDIR /app

# Install deps first for better caching
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build-time envs (default to empty). These map to Vite's import.meta.env.*
ARG VITE_AMAP_KEY=""
ARG VITE_AMAP_SECURE_KEY=""
ARG VITE_AMAP_SERVICE_HOST=""
ARG VITE_AMAP_SERVER_KEY=""
ARG VITE_AMAP_USE_REST=""
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ARG VITE_QIANWEN_API_KEY=""
ARG VITE_XUNFEI_SECRET_KEY=""
ARG VITE_XUNFEI_APP_ID=""
ARG VITE_XUNFEI_HTTP_API_KEY=""
ARG VITE_XUNFEI_MODEL=""

# Expose ARGs as ENV so Vite can read them at build-time
ENV VITE_AMAP_KEY=${VITE_AMAP_KEY} \
    VITE_AMAP_SECURE_KEY=${VITE_AMAP_SECURE_KEY} \
    VITE_AMAP_SERVICE_HOST=${VITE_AMAP_SERVICE_HOST} \
    VITE_AMAP_SERVER_KEY=${VITE_AMAP_SERVER_KEY} \
    VITE_AMAP_USE_REST=${VITE_AMAP_USE_REST} \
    VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY} \
    VITE_QIANWEN_API_KEY=${VITE_QIANWEN_API_KEY} \
    VITE_XUNFEI_SECRET_KEY=${VITE_XUNFEI_SECRET_KEY} \
    VITE_XUNFEI_APP_ID=${VITE_XUNFEI_APP_ID} \
    VITE_XUNFEI_HTTP_API_KEY=${VITE_XUNFEI_HTTP_API_KEY} \
    VITE_XUNFEI_MODEL=${VITE_XUNFEI_MODEL}

# Build production assets
RUN npm run build

# ---------- Runtime stage ----------
FROM nginx:alpine AS runner

# Copy built static files to Nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Optional: expose port 80 (default for Nginx)
EXPOSE 80

# Default command starts Nginx
CMD ["nginx", "-g", "daemon off;"]
