# Use Node.js 18 slim image
FROM node:18-slim

# 1. Install System Dependencies (ffmpeg, python, curl)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 2. Install latest yt-dlp using the bypass flag
# --break-system-packages flag naye Debian versions mein mandatory hai
RUN pip3 install --no-cache-dir -U yt-dlp --break-system-packages

# 3. Create app directory
WORKDIR /usr/src/app

# 4. Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# 5. Copy the rest of the code
COPY . .

# 6. Create temp folder and set permissions
RUN mkdir -p temp && chmod 777 temp

# 7. Default Port (Render sets this automatically)
EXPOSE 3000

# 8. Start script
CMD ["node", "worker.js"]
