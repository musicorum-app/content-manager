FROM node:18 AS builder
WORKDIR /src
COPY package*.json ./
COPY . .
RUN npm ci
RUN npx prisma generate
RUN npm run build
RUN npm prune --production

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /src .
EXPOSE 80
CMD [ "npm", "start" ]