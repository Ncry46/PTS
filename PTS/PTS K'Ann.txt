# PTS Learning — Node.js + Express (เชื่อม SQL Server ภายนอก)
FROM node:20-alpine

WORKDIR /app

# ติดตั้ง dependencies ก่อน เพื่อใช้ Docker layer cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# คัดลอกโค้ดแอป (ไม่รวมไฟล์ใน .dockerignore)
COPY backend ./backend
COPY frontend ./frontend
COPY components ./components
COPY sql ./sql

# โฟลเดอร์อัปโหลดรูปโปรไฟล์ (mount volume ได้ตอนรัน)
RUN mkdir -p uploads

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

<<<<<<< HEAD
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/users/me',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
=======
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
>>>>>>> cursor/premium-banner-fx-eb8c

CMD ["node", "backend/server.js"]
