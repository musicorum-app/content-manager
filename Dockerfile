FROM node:18
WORKDIR /src
COPY package*.json ./
COPY . .

RUN npm ci
RUN npx prisma generate
RUN npm run build
RUN npm prune --production

EXPOSE 80
CMD [ "npm", "start" ]