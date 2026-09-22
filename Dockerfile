# GEMINI_API_KEY is a runtime secret.
# Do not add ARG GEMINI_API_KEY. Render forwards env vars as build args,
# and this image must not read that secret while it is building.
# .env is excluded by .dockerignore.
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY backend ./backend
COPY web ./web
# Render sets PORT at runtime, usually 10000. The app reads that value
# and listens on 0.0.0.0. Do not bake a fixed port into the image.
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/src/index.js"]
