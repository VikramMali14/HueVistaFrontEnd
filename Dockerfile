# syntax=docker/dockerfile:1
# ---- Build ----
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# These three decide the Content-Security-Policy, and the CSP is baked into the
# build: `next build` writes headers() into the routes manifest, so passing them
# only to `docker run` is too late — the image already carries whatever policy the
# build saw. Get them wrong and the browser blocks every image the API serves.
#
# Defaults live in next.config.ts and are correct for the production deployment
# (api.huevista.org, ap-south-1); pass these only for a stack that differs:
#   docker build --build-arg NEXT_PUBLIC_API_ORIGIN=https://api.staging.example .
ARG NEXT_PUBLIC_API_ORIGIN
ARG S3_REGION
ARG IMAGE_REMOTE_HOSTS
ENV NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN \
    S3_REGION=$S3_REGION \
    IMAGE_REMOTE_HOSTS=$IMAGE_REMOTE_HOSTS

RUN npm run build

# ---- Runtime ----
FROM node:26-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
# chown so the runtime user can write .next/cache (image optimizer, ISR).
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=build --chown=node:node /app/cache-handler.js ./cache-handler.js
USER node
EXPOSE 3000
# Node ships fetch; no extra packages needed for the probe.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD node -e "fetch('http://localhost:3000').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["npm", "run", "start"]
