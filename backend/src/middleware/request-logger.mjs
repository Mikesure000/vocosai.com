// 请求日志中间件

/**
 * Express-style 请求日志中间件
 * 注意：当前 server.mjs 使用原生 Node.js HTTP，不使用 Express 中间件链。
 * 此模块为后续迁移到 Express/Fastify 预留。
 */
export function requestLogger(req, res, next) {
  const start = Date.now();
  // 监听 response 完成事件，记录请求耗时
  if (res && typeof res.on === "function") {
    res.on("finish", () => {
      const duration = Date.now() - start;
      console.log(`[http] ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
    });
  }
  if (typeof next === "function") {
    next();
  }
}
