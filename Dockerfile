FROM node:18-slim

# تثبيت تبعيات Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && apt-get clean

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ✅ إزالة متغيرات Chrome المؤقتة
# لا نضبط PUPPETEER_SKIP_CHROMIUM_DOWNLOAD لأننا نريد تنزيل Chrome

EXPOSE 10000
CMD ["node", "src/server.js"]
