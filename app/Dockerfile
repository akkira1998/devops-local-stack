# ============ BUILD STAGE ============
# На этом этапе устанавливаем зависимости
FROM node:18-alpine AS builder

WORKDIR /app

# Копируем только package files (для кеширования слоя)
COPY package*.json ./

# Установка зависимостей
RUN npm ci --only=production

# ============ RUNTIME STAGE ============
# На этом этапе берём только необходимое
FROM node:18-alpine

WORKDIR /app

# Копируем node_modules из builder
COPY --from=builder /app/node_modules ./node_modules

# Копируем исходный код
COPY src ./src
COPY package*.json ./

# Создаём пользователя (безопасность - не запускаем как root)
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

# Expose порт
EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Запуск приложения
CMD ["node", "src/app.js"]
