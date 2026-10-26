# Stage 1: Build TypeScript source code
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependency manifests
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source and compile
COPY src ./src
RUN npm run build

# Stage 2: Lean Production Runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy compiled artifacts from builder
COPY --from=builder /app/dist ./dist

# Run as non-root user for Cloud Run security
USER node

EXPOSE 8080
CMD ["node", "dist/server.js"]
