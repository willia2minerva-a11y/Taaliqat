FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 10000

CMD [ "node", "src/server.js" ]
