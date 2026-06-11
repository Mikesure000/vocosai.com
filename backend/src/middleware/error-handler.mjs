// 全局错误处理中间件

/**
 * Express-style 错误处理中间件
 * 注意：当前 server.mjs 使用原生 Node.js HTTP，不使用 Express 中间件链。
 * 此模块为后续迁移到 Express/Fastify 预留。
 */
export function errorHandler(err, req, res, next) {
  const statusCode = err?.statusCode ?? 500;
  const body = {
    error: err?.code ?? "internal_error",
    message: err?.message ?? "Internal Server Error"
  };
  if (res && typeof res.writeHead === "function") {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}
