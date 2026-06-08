import "dotenv/config";
import { createApiServer } from "./server.mjs";

const port = Number(process.env.PORT || 3000);
const dbPath = process.env.VOCOS_DB_PATH || "./data/vocos.sqlite";

const server = await createApiServer({ dbPath });

server.listen(port, () => {
  console.log(`\n  VOCOS 已启动 → http://localhost:${port}`);
  console.log(`  账号: admin@vocos.local / admin123\n`);
});
