# Stage 1: Build React App
FROM node:16-alpine AS build-react
WORKDIR /app
COPY bot-landing-page /app/dashboard
WORKDIR /app/dashboard
RUN npm install
RUN npm run build

# Stage 2: Build Node.js bot
FROM node:16-alpine AS build-node
WORKDIR /app
COPY bot /app/bot
COPY api /app/api
WORKDIR /app/bot
RUN npm install
RUN npm install -g nodemon
WORKDIR /app/api
RUN npm install

# Stage 3: Serve React App with Nginx
FROM nginx:alpine AS serve-react
COPY --from=build-react /app/dashboard/build /usr/share/nginx/html

# Stage 4: Final Stage with Supervisor to Manage Node.js and Nginx
FROM node:16-alpine
WORKDIR /app

# Copy Node.js bot from build stage
COPY --from=build-node /app/bot /app/bot
COPY --from=build-node /app/api /app/api

# Install Supervisor and Nginx
RUN apk add --no-cache supervisor nginx

# Copy React build from serve-react stage
COPY --from=serve-react /usr/share/nginx/html /usr/share/nginx/html

# Copy NGINX configs
COPY config/nginx.conf /etc/nginx/nginx.conf
COPY config/conf.d /etc/nginx/conf.d/

# Copy Supervisor configuration
COPY config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Install global packages
RUN npm install -g nodemon

# Expose port 8080 for Supervisor and Nginx
EXPOSE 8080

# Start Supervisor to manage Node.js and Nginx services
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
