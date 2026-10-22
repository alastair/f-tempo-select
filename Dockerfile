FROM node:24-bookworm-slim AS builder
# Set working directory
WORKDIR /app

COPY package-lock.json .
COPY package.json .
RUN npm ci

COPY . .
RUN npm run build


FROM nginx
# Set working directory to nginx asset directory
WORKDIR /usr/share/nginx/html
# Remove default nginx static assets
RUN rm -rf ./*
RUN sed -i 's%index  index.html index.htm;%try_files $uri /index.html;%' /etc/nginx/conf.d/default.conf
# Copy static assets from builder stage
COPY --from=builder /app/build .
