FROM node:22-alpine
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile=false
EXPOSE 3000
CMD ["pnpm", "dev:api"]
