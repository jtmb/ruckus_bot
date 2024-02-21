# Stage 1: Build React App
FROM node:16-alpine AS build
WORKDIR /app
COPY /bot ./bot
RUN cd bot && \
    npm install && \
    npm install -g nodemon  

# # Stage 2: Serve React App
# FROM nginx:alpine
# COPY --from=build /app/react-app/dist /usr/share/nginx/html
# COPY config/nginx.conf /etc/nginx/nginx.conf
# COPY config/conf.d /etc/nginx/conf.d/

# Install Supervisor
RUN apk add --no-cache supervisor

# Copy Supervisor configuration
COPY config/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose port 8080
EXPOSE 8080

# Start Supervisor to manage services
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
