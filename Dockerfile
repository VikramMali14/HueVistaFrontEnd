# syntax=docker/dockerfile:1
# ---- Build ----
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The backend origin is needed at BUILD time (NEXT_PUBLIC_* is inlined into the bundles)
# AND at RUN time (next.config.ts is loaded by Node at server start, and builds the
# Content-Security-Policy from it). Supplying it to only one of the two is what let the
# app request images from the real API while the CSP it was served only allowed
# localhost — so the arg is declared here and re-exported into the runtime stage below.
ARG NEXT_PUBLIC_API_ORIGIN
ENV NEXT_PUBLIC_API_ORIGIN=${NEXT_PUBLIC_API_ORIGIN}
ARG NEXT_PUBLIC_SITE_ORIGIN
ENV NEXT_PUBLIC_SITE_ORIGIN=${NEXT_PUBLIC_SITE_ORIGIN}
# The other two inputs to the CSP. Same build-time reasoning: the img-src the image
# ships with is the one computed from these, so a deployment on another S3 region or
# with a CDN in front has to say so here, not at `docker run`.
ARG S3_REGION
ENV S3_REGION=${S3_REGION}
ARG IMAGE_REMOTE_HOSTS
ENV IMAGE_REMOTE_HOSTS=${IMAGE_REMOTE_HOSTS}
RUN npm run build

# ---- Runtime ----
FROM node:26-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Same values as the build stage — see the note there. Without these the server would
# start with no API origin and write a CSP that contradicts the bundles it is serving.
ARG NEXT_PUBLIC_API_ORIGIN
ENV NEXT_PUBLIC_API_ORIGIN=${NEXT_PUBLIC_API_ORIGIN}
ARG NEXT_PUBLIC_SITE_ORIGIN
ENV NEXT_PUBLIC_SITE_ORIGIN=${NEXT_PUBLIC_SITE_ORIGIN}
# S3_REGION is needed in BOTH stages for two different readers: the build stage bakes
# it into the CSP's img-src, and the runtime stage is where `/api/media` reads it to
# decide which host it may fetch an image from. Set in only the build stage, the proxy
# falls back to the default region and quietly refuses a bucket in any other one.
ARG S3_REGION
ENV S3_REGION=${S3_REGION}
# Required to ARM /api/media, the fallback that serves images same-origin when the S3
# bucket has no CORS rule of its own. It is the only host that route will ever fetch
# from, which is why it is configuration rather than something the caller supplies —
# unset, the route stays off rather than accepting a bucket named in the request. Set
# it to the same value as the backend's S3_BUCKET_NAME.
ARG S3_BUCKET_NAME
ENV S3_BUCKET_NAME=${S3_BUCKET_NAME}
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
