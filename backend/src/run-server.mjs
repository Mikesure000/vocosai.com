import "dotenv/config";
import { createApiServer } from "./server.mjs";

const port = Number(process.env.PORT || 3000);
const dbPath = process.env.VOCOS_DB_PATH || "./data/vocos.sqlite";

const server = await createApiServer({ dbPath });

server.listen(port, () => {
  console.log(`Vocos backend running on http://localhost:${port}`);
  console.log(`  GET  http://localhost:${port}/health`);
  console.log(`  GET  http://localhost:${port}/api/schema`);
  console.log(`  GET  http://localhost:${port}/api/tasks`);
});
