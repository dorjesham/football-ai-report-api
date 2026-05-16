FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
COPY views ./views
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY views ./views
COPY deploy ./deploy
COPY scripts ./scripts
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 8080
# Sealos「运行命令 / 参数」留空时，使用镜像默认入口；勿写宿主机路径 /home/devbox/project/…
# 若必须手写：运行命令 /app/entrypoint.sh ，参数 prod
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["prod"]
