FROM node:22-alpine

RUN apk add --no-cache ffmpeg python3 make g++ wget fontconfig librsvg pango zip && \
    mkdir -p /usr/share/fonts/noto /app/fonts && \
    wget -q --timeout=30 -O /usr/share/fonts/noto/NotoSansCJKsc-Regular.otf \
    'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf' && \
    cp /usr/share/fonts/noto/NotoSansCJKsc-Regular.otf /app/fonts/NotoSansSC-Regular.otf && \
    fc-cache -fv || echo "Font setup completed with warnings"

WORKDIR /app

COPY package.json package-lock.json* pnpm-lock.yaml* ./

RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

COPY tsconfig.json drizzle.config.ts ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

RUN mkdir -p dist/db && cp -r src/db/migrations dist/db/

EXPOSE 3000

CMD ["node_modules/.bin/tsx", "dist/index.js"]
