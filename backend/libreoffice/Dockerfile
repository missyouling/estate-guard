FROM node:20-alpine
RUN apk add --no-cache libreoffice wget font-wqy-zenhei font-noto-cjk fontconfig
COPY local.conf /etc/fonts/local.conf
RUN fc-cache -f
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server.js ./
EXPOSE 3001
ENV MAX_CONCURRENT=2
ENV CONVERSION_TIMEOUT=120000
USER node
CMD ["node", "server.js"]
