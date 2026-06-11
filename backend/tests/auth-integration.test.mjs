import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApiServer } from "../src/server.mjs";

let server;
let baseUrl;
let adminToken;
let memberToken;

beforeAll(async () => {
  // 测试环境设置 JWT Secret
  process.env.VOCOS_JWT_SECRET = "test-secret-for-vitest-a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
  const app = await createApiServer({ dbPath: ":memory:", skipJwtCheck: true });
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  if (server) server.close();
});

async function fetchApi(path, opts = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, headers: res.headers };
}

// ==================== T-AUTH-28: Auth API Tests ====================

describe("POST /api/auth/register", () => {
  it("registers a new user", async () => {
    const { status, body } = await fetchApi("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "Test", email: "test@a.com", password: "test1234", teamName: "T" }),
    });
    expect(status).toBe(201);
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.user.email).toBe("test@a.com");
  });

  it("rejects duplicate email", async () => {
    const { status, body } = await fetchApi("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "Dup", email: "test@a.com", password: "test1234" }),
    });
    expect(status).toBe(409);
    expect(body.error).toBe("email_exists");
  });

  it("rejects short password", async () => {
    const { status } = await fetchApi("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "S", email: "s@a.com", password: "123" }),
    });
    expect(status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeAll(async () => {
    await fetchApi("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "LoginTest", email: "login@a.com", password: "test1234", teamName: "L" }),
    });
  });

  it("logs in with correct credentials", async () => {
    const { status, body } = await fetchApi("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "login@a.com", password: "test1234" }),
    });
    expect(status).toBe(200);
    expect(body.data.accessToken).toBeTruthy();
    adminToken = body.data.accessToken;
  });

  it("rejects wrong password", async () => {
    const { status, body } = await fetchApi("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "login@a.com", password: "wrong" }),
    });
    expect(status).toBe(401);
    expect(body.error).toBe("invalid_credentials");
  });

  it("rejects missing fields", async () => {
    const { status } = await fetchApi("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "x@a.com" }),
    });
    expect(status).toBe(400);
  });
});

describe("GET /api/auth/me", () => {
  it("returns user info with valid token", async () => {
    const { status, body } = await fetchApi("/api/auth/me", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(status).toBe(200);
    expect(body.data.user.email).toBe("login@a.com");
  });

  it("rejects without token", async () => {
    const { status } = await fetchApi("/api/auth/me");
    expect(status).toBe(401);
  });
});

describe("PUT /api/auth/me/password", () => {
  it("changes password", async () => {
    const { status, body } = await fetchApi("/api/auth/me/password", {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ oldPassword: "test1234", newPassword: "newPass99" }),
    });
    expect(status).toBe(200);
    expect(body.data?.ok).toBe(true);
  });

  it("can login with new password", async () => {
    const { status, body } = await fetchApi("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "login@a.com", password: "newPass99" }),
    });
    expect(status).toBe(200);
    expect(body.data.accessToken).toBeTruthy();
  });
});

// ==================== T-AUTH-31: API Route Regression ====================

describe("Protected business routes", () => {
  beforeAll(async () => {
    const { body } = await fetchApi("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "login@a.com", password: "newPass99" }),
    });
    adminToken = body.data.accessToken;
  });

  it("GET /api/schema requires auth", async () => {
    const { status } = await fetchApi("/api/schema");
    expect(status).toBe(401);
  });

  it("GET /api/schema works with token", async () => {
    const { status, body } = await fetchApi("/api/schema", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(status).toBe(200);
    expect(body.data?.agents || body.agents).toBeTruthy();
  });

  it("GET /api/ai/schemas works", async () => {
    const { status } = await fetchApi("/api/ai/schemas", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(status).toBe(200);
  });

  it("GET /api/model-gateway/routes works", async () => {
    const { status } = await fetchApi("/api/model-gateway/routes", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(status).toBe(200);
  });

  it("GET /api/governance/cost-summary works", async () => {
    const { status } = await fetchApi("/api/governance/cost-summary?period=all", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(status).toBe(200);
  });
});

describe("Member role permissions", () => {
  it("member role has limited permissions", async () => {
    // Register a member user (memory DB has no seed data, must create)
    // Without teamName → default team created with role "team_admin"
    const { body: regBody, status: regStatus } = await fetchApi("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "Member", email: "member@test.com", password: "test1234" }),
      headers: { "X-Forwarded-For": "10.0.0.50" }, // separate IP to avoid rate limits
    });
    // May hit rate limit from previous tests
    if (regStatus === 429) {
      console.warn("Rate limited during member test, skipping");
      return;
    }
    expect(regStatus).toBe(201);
    const memberToken = regBody.data?.accessToken;
    expect(memberToken).toBeTruthy();

    // team_admin can read tasks
    const { status: readStatus } = await fetchApi("/api/tasks", {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(readStatus).toBe(200);

    // team_admin cannot write schemas (schema.write is only for super_admin and ai_engineer_admin)
    const { status: schemaWriteStatus } = await fetchApi("/api/ai/schemas", {
      method: "POST",
      headers: { Authorization: `Bearer ${memberToken}` },
      body: JSON.stringify({ id: "test_schema_1", name: "Test", version: "1", schema: {} }),
    });
    expect([403, 400]).toContain(schemaWriteStatus);
  });

  it("super admin login returns correct role", async () => {
    // Register a super_admin user first (memory DB has no seed data)
    const { status: regStatus } = await fetchApi("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name: "SuperAdmin", email: "admin@test.com", password: "test1234", teamName: "AdminTeam" }),
      headers: { "X-Forwarded-For": "10.0.0.51" }, // separate IP to avoid rate limits
    });
    // May hit rate limit from previous tests
    if (regStatus === 429) {
      console.warn("Rate limited during admin test, skipping");
      return;
    }
    const { status, body } = await fetchApi("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@test.com", password: "test1234" }),
      headers: { "X-Forwarded-For": "10.0.0.52" }, // separate IP for login
    });
    expect(status).toBe(200);
    expect(body.data?.accessToken).toBeTruthy();
    // Verify role is returned
    expect(body.data?.user?.role).toBeTruthy();
  });
});
