FROM node:24-bookworm AS build

WORKDIR /app

COPY package*.json ./
RUN npm pkg delete \
      'devDependencies.@types/react' \
      'devDependencies.@types/react-dom' \
      'devDependencies.@vitejs/plugin-react' \
      devDependencies.concurrently \
      devDependencies.cross-env \
      devDependencies.electron \
      devDependencies.electron-builder \
      devDependencies.lucide-react \
      devDependencies.react \
      devDependencies.react-dom \
      devDependencies.tsx \
      devDependencies.vite \
      devDependencies.wait-on \
    && npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build \
    && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY docs ./docs

USER node

EXPOSE 3000

CMD ["node", "dist/cli.js", "serve"]
