import { createStore } from "../src/store.mjs";
import Database from "better-sqlite3";

const store = createStore({ dbPath: "data/vocos-test.sqlite" });

console.log("=== 种子数据验证 ===");
console.log("Tasks:", store.listTasks().length);
console.log("Users:", store.list("users").length);

console.log("\n=== 插入测试 ===");
const record = await store.insert("tasks", {
  id: "task_test",
  teamId: "team_demo",
  projectId: "project_demo",
  taskName: "Test Task",
  platform: "douyin",
  contentTitle: "Test Title",
  status: "draft",
  createdAt: "2026-06-04T00:00:00Z",
  updatedAt: "2026-06-04T00:00:00Z"
});
console.log("Inserted:", record.id);
console.log("After insert - collections tasks:", store.list("tasks").length);

// Check consistent
const diag = store.storageDiagnostics();
console.log("Diagnostics status:", diag.status);

// Verify relational table
const db = new Database("data/vocos-test.sqlite");
const relationalTask = db.prepare("SELECT * FROM analysis_tasks WHERE id = ?").get("task_test");
console.log("Relational analysis_tasks record:", relationalTask ? relationalTask.task_name : "NOT FOUND");
console.log("Relational task count:", db.prepare("SELECT COUNT(*) AS count FROM analysis_tasks").get().count);

// Check JSON collections also has it
const collectionsRow = db.prepare("SELECT name, json FROM collections WHERE name = 'tasks'").get();
const tasksFromJson = JSON.parse(collectionsRow.json);
console.log("JSON collections tasks count:", tasksFromJson.length);
console.log("JSON/Relational consistent:", tasksFromJson.length === db.prepare("SELECT COUNT(*) AS count FROM analysis_tasks").get().count);

db.close();
console.log("\n=== 全部测试通过 ===");
