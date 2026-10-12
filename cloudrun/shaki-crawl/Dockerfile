FROM node:20-alpine

WORKDIR /app

# Depend on a lockfile-only copy first so dependency installation stays cached across code changes.
COPY package.json package-lock.json ./
RUN npm config set registry https://mirrors.tencent.com/npm/ \
  && npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Single CMD (multiple CMD lines: only the last one survives).
CMD ["node", "server.js"]
