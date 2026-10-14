FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 5000

ENV PORT=5000 \
    NODE_ENV=production

CMD ["node", "src/app.js"]
