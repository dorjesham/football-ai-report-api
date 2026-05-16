#!/bin/sh
# NestJS 入口（Alpine busybox ash）
# - 与 package.json 的 `start` / `start:prod` 一致：-r scripts/load-sealos-admin-env.js 再 dist/main.js
# - 先解析 ROOT：优先 /app（Docker），否则为脚本所在目录（本地 / Devbox）
# - 无参数且存在 $ROOT/dist/main.js 时默认 prod，避免 K8s 清空 args 时误跑 start:dev（生产镜像无 nest CLI）

set -eu

log() {
  # 必须写 stdout：部分集群日志只采集 fd1，仅 stderr 会导致「日志完全空白」
  printf '%s\n' "$*"
}

log "[entrypoint] argc=$# argv=[$*] cwd=$(pwd) NODE_ENV=${NODE_ENV:-<unset>} PORT=${PORT:-<unset>}"

if ! cd /app 2>/dev/null; then
  ROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
  if ! cd "$ROOT" 2>/dev/null; then
    log "[entrypoint] ERROR: cannot cd /app nor directory of $0"
    exit 1
  fi
  log "[entrypoint] ROOT=$ROOT (no /app — local or custom layout)"
else
  ROOT=/app
fi

# 运行模式：显式参数优先；否则有构建产物则生产
if [ "$#" -ge 1 ] && [ -n "${1:-}" ]; then
  app_env=$(printf '%s' "$1" | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
elif [ -f "$ROOT/dist/main.js" ]; then
  app_env=prod
  log "[entrypoint] no argv, found $ROOT/dist/main.js → prod"
else
  app_env=development
  log "[entrypoint] no argv, no dist/main.js → development"
fi

case "$app_env" in
  production|prod)
    log "Starting NestJS (production)..."
    export NODE_ENV=production
    # 与 K8s Service/Ingress 常见 targetPort=8080 对齐：空或 0 时强制 8080，避免 upstream 111
    case "${PORT:-}" in
      ''|0) export PORT=8080 && log "[entrypoint] PORT was empty or 0 → 8080" ;;
    esac
    if [ ! -f "$ROOT/dist/main.js" ]; then
      log "[entrypoint] ERROR: missing $ROOT/dist/main.js — run npm run build in CI/image"
      exit 1
    fi
    if [ ! -f "$ROOT/scripts/load-sealos-admin-env.js" ]; then
      log "[entrypoint] ERROR: missing $ROOT/scripts/load-sealos-admin-env.js"
      exit 1
    fi
    exec node -r "$ROOT/scripts/load-sealos-admin-env.js" "$ROOT/dist/main.js"
    ;;
  *)
    log "Starting NestJS (development) — npm run start:dev (needs @nestjs/cli in devDependencies)"
    export NODE_ENV=development
    if [ ! -f "$ROOT/package.json" ]; then
      log "[entrypoint] ERROR: missing $ROOT/package.json"
      exit 1
    fi
    exec npm run start:dev
    ;;
esac
