# syntax=docker/dockerfile:1
# Production image of the web app: static files served by nginx, which also forwards /api and /photos to the API,
# so the browser sees a single origin (no CORS, no API URL baked into the build). Build context: frontend/.
#   docker build -t gei-web ./frontend
#   docker run -p 8080:8080 -e API_UPSTREAM=http://api:8080 gei-web

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Leave empty to use the same origin (nginx proxy). Set it only when the API lives on another host.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build


FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
# Files in /etc/nginx/templates are run through envsubst at start; only API_* variables are substituted.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

ENV API_UPSTREAM=http://api:8080 \
    NGINX_ENVSUBST_FILTER=API_

EXPOSE 8080
