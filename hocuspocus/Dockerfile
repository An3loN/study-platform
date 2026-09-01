FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

EXPOSE 1234

CMD ["node", "dist/server.js"]
