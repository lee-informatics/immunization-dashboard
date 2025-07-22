FROM node:24-alpine AS builder
LABEL maintainer="preston.lee@prestonlee.com"

# Install dependencies first so they layer can be cached across builds.
RUN mkdir /app
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm i

# Build
COPY . .
RUN npm run ng build --omit=dev

FROM nginx:stable-alpine

# We need to make a few changes to the default configuration file.
COPY nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html

# Remove any default nginx content
RUN rm -rf *

# Copy build from "builder" stage, as well as runtime configuration script public folder
COPY --from=builder /app/dist/immunization-dashboard .
# Copy runtime template
COPY public/configuration.template.js ./configuration.template.js
COPY public/configuration.js ./configuration.js
COPY public/favicon.ico ./favicon.ico

ENV IMMUNIZATION_DEFAULT_FHIR_URL=http://localhost:8080/fhir

CMD envsubst < configuration.template.js > configuration.js && cp configuration.js browser/configuration.js && exec nginx -g 'daemon off;'

