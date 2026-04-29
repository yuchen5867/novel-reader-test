FROM node:18-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:18-alpine

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/src ./src

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create data and upload directories
RUN mkdir -p /app/data /app/uploads

EXPOSE 3000

ENV HOST=0.0.0.0
ENV PORT=3000
ENV DB_PATH=/app/data/novel-reader.db
ENV UPLOAD_PATH=/app/uploads

CMD ["node", "src/main.js"]
