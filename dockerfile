# Stage 1: Build node
FROM node:18-alpine AS build-node

# Copy static content 
COPY bot /app/bot
COPY api /app/api
COPY dashboard /app/dashboard

# Install dependencies and run builds
RUN cd /app/dashboard && npm install && npm run build \
    && cd /app/bot && npm install \
    && cd /app/api && npm install

# Stage 2: Final Stage - production
FROM node:18-alpine

# Copy build files from Stage 1 into Final Stage image
COPY --from=build-node /app /app

# Install global package dependencies
RUN npm install -g nodemon && \
    apk add --no-cache supervisor

# Remove image bloat
RUN apk del --no-cache \
    nginx \
    py3-packaging \
    apk-tools \
    bzip2 \
    py3-packaging \
    py3-setuptools \
    py3-parsing \
    python3 \
    busybox

# Copy Supervisor configuration
COPY config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY config/supervisord.conf /etc/supervisor/supervisord.conf

# Finish | Set WORKDIR and expose dashboard port
WORKDIR /app/
EXPOSE 8080

# Start Supervisor to manage Node.js and Nginx services
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
