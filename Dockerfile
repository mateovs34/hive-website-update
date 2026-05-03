FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY proxy.js ./
COPY widget.js ./
COPY app.html ./
COPY dashboard.html ./
COPY config.html ./
COPY admin.html ./
COPY demo.html ./
COPY tour.html ./
COPY landing.html ./
COPY delcar-demo.html ./
RUN mkdir -p /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1
ENV NODE_ENV=production
ENV DB_PATH=/data/chat.db
ENV PORT=8080
CMD ["node", "proxy.js"]
