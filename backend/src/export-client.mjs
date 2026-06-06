// Python 微服务 HTTP 客户端（PDF/Word 导出）

const EXPORT_SERVICE_URL = process.env.EXPORT_SERVICE_URL || "http://localhost:5001";

export async function exportPdf(markdown, options = {}) {
  throw new Error("Not implemented");
}

export async function exportWord(markdown, options = {}) {
  throw new Error("Not implemented");
}

export async function checkExportServiceHealth() {
  throw new Error("Not implemented");
}
