// 临时脚本：为 seed.sql 中的三个用户生成密码哈希
// 用法：node backend/db/generate-hashes.mjs
import { hashPassword, verifyPassword } from "../src/auth.mjs";

const PASSWORD = "demo123456";

const users = [
  { id: "user_demo", name: "Demo Admin" },
  { id: "user_ai_admin", name: "Demo AI Engineer" },
  { id: "user_member", name: "Demo Member" },
];

console.log("-- ============================================");
console.log("-- 用户密码哈希更新（T-AUTH-26）");
console.log("-- 密码: " + PASSWORD);
console.log("-- ============================================");
console.log("");

for (const user of users) {
  const hash = hashPassword(PASSWORD);
  const verified = verifyPassword(PASSWORD, hash);
  console.log(
    `-- ${user.name} (${user.id}): verify=${verified ? "PASS" : "FAIL"}`
  );
  // SQLite UPDATE with UPSERT pattern
  console.log(
    `UPDATE users SET password_hash = '${hash}', updated_at = datetime('now') WHERE id = '${user.id}';`
  );
  console.log(
    `INSERT INTO users (id, password_hash) VALUES ('${user.id}', '${hash}') ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = datetime('now');`
  );
  console.log("");
}
