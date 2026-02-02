# Cloud Run compatible Dockerfile for Node.js + Prisma backend
# Use Debian-based image for better native module compatibility (e.g., sharp)
FROM node:18-slim

# Create app directory
WORKDIR /app

# Install system deps needed by Prisma and native modules
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy application source
COPY src ./src
COPY uploads ./uploads

# Copy entrypoint
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Set environment
ENV NODE_ENV=production

# Cloud Run will set PORT environment variable
ENV PORT=8080

# Expose port (optional for Cloud Run)
EXPOSE 8080

# Start via entrypoint (runs migrations, then starts server)
CMD ["bash", "./entrypoint.sh"]
