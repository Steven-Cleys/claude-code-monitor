FROM oven/bun:1.2-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY . .

EXPOSE 3001
CMD ["bun", "run", "src/index.ts"]
