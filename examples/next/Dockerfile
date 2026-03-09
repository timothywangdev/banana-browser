FROM node:22-slim

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium

RUN npm install -g agent-browser tsx && agent-browser install --skip-download

WORKDIR /app
COPY server/package.json server/index.ts ./

EXPOSE 3001
ENV PORT=3001

CMD ["tsx", "index.ts"]
