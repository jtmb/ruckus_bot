FROM node:18-alpine AS build-node

# Copy static content 
WORKDIR /app
COPY bot /app/bot
COPY api /app/api
COPY dashboard /app/dashboard

# Install dependencies and run builds
WORKDIR /app/dashboard
RUN npm install
RUN npm run build
WORKDIR /app/bot
RUN npm install
WORKDIR /app/api
RUN npm install

# Manage global packages
RUN npm install -g nodemon
RUN apk add --no-cache supervisor
RUN apk del --no-cache nginx

# Copy Supervisor configuration
COPY config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY config/supervisord.conf /etc/supervisor/supervisord.conf

# Expose port 8080 for Supervisor and Nginx
EXPOSE 8080

# Start Supervisor to manage Node.js and Nginx services
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
