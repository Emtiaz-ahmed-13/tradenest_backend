FROM node:22-alpine AS base
WORKDIR /usr/src/app

FROM base AS deps
COPY package.json package-lock.json ./
# Schema isn't copied yet — skip postinstall (prisma generate)
RUN npm ci --ignore-scripts

FROM base AS development
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

FROM base AS build
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/generated ./generated
COPY --from=build /usr/src/app/prisma ./prisma
COPY --from=build /usr/src/app/prisma.config.ts ./prisma.config.ts
COPY package.json package-lock.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
