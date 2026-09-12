# syntax=docker/dockerfile:1.6
FROM oven/bun:1-alpine
WORKDIR /app

# Install runtime deps with a cached layer.
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

# Copy library source + container entrypoint.
COPY tsconfig.json ./
COPY src ./src
COPY docker ./docker

# Default mount point: users put their Endpoints/ tree (and any user data
# files) here. /data is also where the SQLite database file lives by default.
RUN mkdir -p /data
VOLUME ["/data"]

# Defaults — override any of these via `docker run -e KEY=VALUE` or compose.
ENV PORT=3000 \
    DATA_PATH=/data \
    DB_BACKEND=filesystem \
    LOGGING=true \
    OPENAPI_ENABLED=false

EXPOSE 3000

CMD ["bun", "run", "docker/entrypoint.ts"]
