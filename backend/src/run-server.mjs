import "dotenv/config";
import { createApiServer } from "./server.mjs";
import { existsSync, rmSync } from "fs";

const port = Number(process.env.PORT || 3000);
const dbPath = process.env.VOCOS_DB_PATH || "./data/vocos.sqlite";

// 自动清理: 如果 JWT_SECRET 变更导致旧数据库密码失效，自动重建
if (process.env.VOCOS_AUTO_RESET_DB === "true" && existsSync(dbPath)) {
  console.log("[vocos] VOCOS_AUTO_RESET_DB=true, removing old database...");
  rmSync(dbPath);
  rmSync(dbPath + "-wal", { force: true });
  rmSync(dbPath + "-shm", { force: true });
}

const server = await createApiServer({ dbPath });

server.listen(port, () => {
  console.log(`Vocos backend running on http://localhost:${port}`);
  console.log(`  GET  http://localhost:${port}/health`);
  console.log(`  GET  http://localhost:${port}/api/schema`);
  console.log(`  GET  http://localhost:${port}/api/tasks`);
});
