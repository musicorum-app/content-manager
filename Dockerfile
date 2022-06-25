FROM node:16 AS builder
RUN curl -sfL https://install.goreleaser.com/github.com/tj/node-prune.sh | bash -s -- -b /usr/local/bin
WORKDIR /src
COPY package*.json ./
COPY . .
RUN npm i
RUN npm run build
RUN npm prune --production
RUN /usr/local/bin/node-prune

FROM node:16-alpine
WORKDIR /app
COPY --from=builder /src .
EXPOSE 80
CMD [ "npm", "start" ]