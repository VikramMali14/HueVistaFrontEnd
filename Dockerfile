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
# Firebase Phone Auth — "sign in with your mobile number". Needed at BUILD time twice
# over: NEXT_PUBLIC_* is inlined into the bundle (so the SDK knows which project to
# talk to), and NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN also feeds the CSP that `next build`
# bakes into the routes manifest. Miss it here and the sign-in page renders, the
# button works, and the browser silently blocks the call to Google.
#
# None of these is a secret — a Firebase web API key identifies a project, it does not
# authorise anything. What guards the project is the authorised-domains list in the
# Firebase console and the backend's own project-id check. Leave them ALL unset and the
# feature is simply off: the mobile option is not offered at all.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY}
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}
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
# OPTIONAL override for /api/media, the fallback that serves images same-origin when
# the S3 bucket has no CORS rule of its own. It pins the only host that route will ever
# fetch from, which is why it is configuration rather than something the caller
# supplies. Left unset, the server asks the API instead (GET /api/images/storage) and
# arms itself from the bucket the API actually presigns from — which is what this
# should normally do, because this variable being a second copy of the backend's is
# exactly why it went unset in production and every image got a 503.
ARG S3_BUCKET_NAME
ENV S3_BUCKET_NAME=${S3_BUCKET_NAME}
# next.config.ts is loaded again by Node at server start and rebuilds the CSP from the
# auth domain, so it must be set in BOTH stages — the same trap the API origin above
# documents. Set only in the build stage, the served policy would omit the Firebase
# hosts the bundles were built to call.
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
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
