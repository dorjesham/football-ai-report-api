/**
 * Sealos / Devbox 旧模板可能仍把本文件当作启动入口。
 * 此处改为：在存在构建产物时加载 Nest 应用；否则返回 503 提示先 build。
 *
 * 端口：未设置 PORT/HTTP_PORT/APP_PORT 时，与 dist/main 一致——NODE_ENV=production 用 8080，否则 3000。
 */
'use strict';

const fs = require('fs');
const path = require('path');

if (!process.env.PORT && !process.env.HTTP_PORT && !process.env.APP_PORT) {
  process.env.PORT =
    process.env.NODE_ENV === 'production' ? '8080' : '3000';
}

const mainJs = path.join(__dirname, 'dist', 'main.js');

if (!fs.existsSync(mainJs)) {
  const http = require('http');
  const port = parseInt(process.env.PORT || '3000', 10);
  http
    .createServer(function (req, res) {
      res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>需要构建</title></head><body>' +
          '<h1>尚未构建 Nest 应用</h1>' +
          '<p>请在项目根目录执行：</p><pre>npm ci\nnpm run build</pre>' +
          '<p>然后重启应用。构建完成后将加载 <code>dist/main.js</code>（football-ai-report-api）。</p>' +
          '</body></html>',
      );
    })
    .listen(port, '0.0.0.0', function () {
      console.log('[hello_world.js] Build missing. Stub HTTP on 0.0.0.0:' + port);
    });
  return;
}

try {
  require(path.join(__dirname, 'scripts', 'load-sealos-admin-env.js'));
} catch (_) {
  /* 可选：无 scripts 目录时跳过 */
}

require('reflect-metadata');
require(mainJs);
