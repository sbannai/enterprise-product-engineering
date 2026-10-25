# Build and package the minimal EPER API runtime.
# This image is for controlled UAT hosting only; it does not authorize release.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY contracts ./contracts
COPY requirements ./requirements
RUN npm run build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
WORKDIR /app
ARG EPER_BUILD_ID
ENV EPER_BUILD_ID=${EPER_BUILD_ID}
COPY package.json package-lock.json ./
# Runtime needs the production pg driver for the PostgreSQL payment store and migration runner.
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/packages/payments/migrations ./packages/payments/migrations
COPY scripts ./scripts
USER node
EXPOSE 8080
CMD ["node", "dist/apps/api/main.js"]
