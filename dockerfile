FROM docker.io/library/node:22.23.4-trixie-slim@sha256:8eb619e402eaede1748a3c8173bffab391592812e85136452f781741c7242ddf AS toolchain
ARG SOURCE_REVISION
ENV NPM_CONFIG_CACHE=/var/tmp/ruckus-build/npm-cache \
    NPM_CONFIG_LOGS_DIR=/var/tmp/ruckus-build/npm-logs \
    NPM_CONFIG_USERCONFIG=/var/tmp/ruckus-build/user.npmrc \
    NPM_CONFIG_GLOBALCONFIG=/var/tmp/ruckus-build/global.npmrc \
    APPDATA=/var/tmp/ruckus-build/appdata \
    LOCALAPPDATA=/var/tmp/ruckus-build/localappdata \
    TEMP=/var/tmp/ruckus-build/tmp TMP=/var/tmp/ruckus-build/tmp TMPDIR=/var/tmp/ruckus-build/tmp \
    NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=768
ADD --checksum=sha256:228bd64aaef23270dbdbd2cf3d5ef5c467602ef38c4066246cef1984adab9a67 https://registry.npmjs.org/npm/-/npm-12.2.1.tgz /var/tmp/npm.tgz
RUN mkdir -p /var/tmp/ruckus-build/npm-cache /var/tmp/ruckus-build/npm-logs \
      /var/tmp/ruckus-build/appdata /var/tmp/ruckus-build/localappdata /var/tmp/ruckus-build/tmp \
    && touch /var/tmp/ruckus-build/user.npmrc /var/tmp/ruckus-build/global.npmrc \
    && npm install --global --ignore-scripts --no-audit --no-fund /var/tmp/npm.tgz \
    && test "$(npm --version)" = 12.2.1 \
    && test "$(node --version)" = v22.23.4 \
    && rm /var/tmp/npm.tgz

FROM toolchain AS build
WORKDIR /app
COPY api/package.json api/package-lock.json /app/api/
COPY bot/package.json bot/package-lock.json /app/bot/
COPY dashboard/package.json dashboard/package-lock.json /app/dashboard/
RUN npm ci --prefix /app/api --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm ci --prefix /app/bot --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm ci --prefix /app/dashboard --omit=dev --ignore-scripts --no-audit --no-fund
COPY api/src/ /app/api/src/
COPY bot/src/ /app/bot/src/
COPY bot/nodemon.json /app/bot/nodemon.json
COPY dashboard/app/ /app/dashboard/app/
COPY dashboard/public/ /app/dashboard/public/
COPY dashboard/jsconfig.json dashboard/next.config.mjs /app/dashboard/
RUN node -e 'const b=require("/app/api/node_modules/bcrypt"); const h=b.hashSync("isolated-build-compatibility",10); if(!b.compareSync("isolated-build-compatibility",h)||b.compareSync("different",h))process.exit(1);' \
    && npm run --prefix /app/dashboard build \
    && rm -rf /app/dashboard/.next/cache

FROM docker.io/library/node:22.23.4-trixie-slim@sha256:8eb619e402eaede1748a3c8173bffab391592812e85136452f781741c7242ddf AS runtime
ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/jtmb/ruckus_bot" \
      org.opencontainers.image.revision="$SOURCE_REVISION"
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends supervisor \
    && dpkg-query -W > /usr/local/share/ruckus-runtime-packages.txt \
    && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 \
      /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
      /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /app/ /app/
RUN node -e 'require("/app/api/node_modules/bcrypt");require("/app/api/node_modules/mysql2");require("/app/bot/node_modules/discord.js");' \
    && test "$(node --version)" = v22.23.4 \
    && test ! -e /usr/local/lib/node_modules/npm \
    && test ! -e /usr/local/bin/npm \
    && supervisord --version
COPY config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY config/supervisord.conf /etc/supervisor/supervisord.conf
ENV NEXT_TELEMETRY_DISABLED=1 NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
EXPOSE 3003 8080
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
