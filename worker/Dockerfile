FROM node:20-slim AS deps
WORKDIR /app
# bcrypt is not a worker dependency, but keeping the toolchain here too for
# consistency with api/'s image and any future native deps.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 4001
CMD ["node", "index.js"]
