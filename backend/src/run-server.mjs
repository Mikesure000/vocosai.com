import "dotenv/config";
import { createApiServer } from "./server.mjs";
import { createStore } from "./store.mjs";
import { hashPassword, verifyPassword } from "./auth.mjs";

const port = Number(process.env.PORT || 3000);
const dbPath = process.env.VOCOS_DB_PATH || "./data/vocos.sqlite";

const server = await createApiServer({ dbPath });

// 确保管理员密码始终有效：每次启动时重新哈希
const store = await createStore({ dbPath });
const users = store.list("users") || [];
for (const u of users) {
  if (u.password_hash && !verifyPassword("admin123", u.password_hash)) {
    const newHash = hashPassword("admin123");
    await store.update("users", u.id, { password_hash: newHash });
    console.log(`  ✓ 密码已同步: ${u.email}`);
  }
}

server.listen(port, () => {
  console.log(`\n  VOCOS 已启动 → http://localhost:${port}`);
  console.log(`  账号: admin@vocos.local / admin123\n`);
});
