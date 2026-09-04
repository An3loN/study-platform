FROM node:20-alpine

WORKDIR /app

# Ставим и dev-зависимости: без typescript нечем выполнить npm run build.
# После сборки они выкидываются, в образ попадает только рантайм.
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

RUN npm prune --omit=dev

EXPOSE 1234

CMD ["node", "dist/server.js"]
