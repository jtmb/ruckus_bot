# Stage 1: build
FROM node:26.13.1-slim AS build-node

COPY bot/package.json bot/package-lock.json /app/bot/
COPY api/package.json api/package-lock.json /app/api/
COPY dashboard/package.json dashboard/package-lock.json /app/dashboard/

# Reproducible installs from the lockfiles
RUN cd /app/bot && npm ci --omit=dev \
    && cd /app/api && npm ci --omit=dev \
    && cd /app/dashboard && npm ci

COPY bot /app/bot
COPY api /app/api
COPY dashboard /app/dashboard

# The build never contacts the API: live routes are dynamic
RUN cd /app/dashboard && npm run build && npm prune --omit=dev

# Stage 2: production
FROM node:26.13.1-slim

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends supervisor \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g nodemon@3.1.14 \
    && npm cache clean --force \
    && rm -rf /root/.npm /tmp/* /var/tmp/*

COPY --from=build-node /app /app

COPY config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY config/supervisord.conf /etc/supervisor/supervisord.conf

WORKDIR /app/
EXPOSE 8080 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "Promise.all(['http://127.0.0.1:3003/health','http://127.0.0.1:8080/'].map(u=>fetch(u,{signal:AbortSignal.timeout(4000)}).then(r=>{if(!r.ok)throw 1}))).then(()=>process.exit(0),()=>process.exit(1))"

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
