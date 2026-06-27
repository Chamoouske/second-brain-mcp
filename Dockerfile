FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV HOST=0.0.0.0
ENV PORT=3000
ENV MCP_HTTP_PATH=/mcp
ENV SECOND_BRAIN_ROOT=/data/second-brain
ENV SECOND_BRAIN_REJECTED_RETENTION_DAYS=30
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
RUN mkdir -p /data/second-brain
EXPOSE 3000
CMD ["node", "dist/server.js"]
