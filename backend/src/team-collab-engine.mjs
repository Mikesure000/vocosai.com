// ============================================================
// BL-026: 团队协作引擎 — 任务分配 + 审批流 + 审核记录
// ============================================================

/**
 * 团队成员协作模块
 *
 * 核心流程:
 *   创建人 → 分配任务给执行者 → 执行者完成 → 提交审批
 *   → 审批人通过/驳回 → 已批准的生产卡可发布
 *
 * 数据模型:
 *   taskAssignments: { id, taskId, assigneeId, assignedBy, status, dueDate, createdAt }
 *   cardReviews:     { id, cardId, reviewerId, status, comment, createdAt }
 */

// ===== 任务分配 =====
export function assignTask(store, { taskId, assigneeId, assignedBy }) {
  const task = store.get("tasks", taskId);
  if (!task) throw notFound("Task", taskId);

  const existing = store.list("taskAssignments").find(a => a.taskId === taskId);
  if (existing) {
    // 重新分配
    const updated = store.update("taskAssignments", existing.id, {
      assigneeId,
      assignedBy,
      status: "assigned",
      updatedAt: new Date().toISOString()
    });
    return updated;
  }

  const id = createAssignmentId();
  return store.insert("taskAssignments", {
    id, taskId, assigneeId, assignedBy,
    status: "assigned",
    dueDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function getTaskAssignments(store, taskId) {
  const assignments = store.list("taskAssignments").filter(a => a.taskId === taskId);
  // 补充用户信息
  const users = store.list("users");
  return assignments.map(a => ({
    ...a,
    assigneeName: users.find(u => u.id === a.assigneeId)?.name || "Unknown",
    assignorName: users.find(u => u.id === a.assignedBy)?.name || "Unknown"
  }));
}

export function listMyTasks(store, userId) {
  const assignments = store.list("taskAssignments").filter(a => a.assigneeId === userId);
  const tasks = store.list("tasks");
  return assignments.map(a => {
    const task = tasks.find(t => t.id === a.taskId);
    return { assignment: a, task: task || null };
  });
}

// ===== 审批流 =====
export function submitForReview(store, { cardId, submittedBy }) {
  const card = store.get("productionCards", cardId);
  if (!card) throw notFound("Production card", cardId);

  if (card.status !== "draft" && card.status !== "rejected") {
    throw badRequest(`Cannot submit card in status: ${card.status}`);
  }

  return store.update("productionCards", cardId, {
    status: "pending_review",
    submittedBy,
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function approveCard(store, { cardId, reviewerId, comment }) {
  const card = store.get("productionCards", cardId);
  if (!card) throw notFound("Production card", cardId);

  if (card.status !== "pending_review") {
    throw badRequest(`Cannot approve card in status: ${card.status}`);
  }

  // 记录审批
  store.insert("cardReviews", {
    id: createReviewId(),
    cardId, reviewerId,
    status: "approved",
    comment: comment || "Approved",
    createdAt: new Date().toISOString()
  });

  // 更新生产卡状态
  return store.update("productionCards", cardId, {
    status: "approved",
    reviewedBy: reviewerId,
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function rejectCard(store, { cardId, reviewerId, comment }) {
  const card = store.get("productionCards", cardId);
  if (!card) throw notFound("Production card", cardId);

  if (card.status !== "pending_review") {
    throw badRequest(`Cannot reject card in status: ${card.status}`);
  }

  if (!comment) throw badRequest("Rejection requires a comment explaining why");

  // 记录审批
  store.insert("cardReviews", {
    id: createReviewId(),
    cardId, reviewerId,
    status: "rejected",
    comment,
    createdAt: new Date().toISOString()
  });

  // 更新状态
  return store.update("productionCards", cardId, {
    status: "rejected",
    reviewedBy: reviewerId,
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function getCardReviews(store, cardId) {
  return store.list("cardReviews").filter(r => r.cardId === cardId);
}

export function getPendingReviews(store, reviewerId) {
  const cards = store.list("productionCards").filter(c => c.status === "pending_review");
  const users = store.list("users");
  return cards.map(c => ({
    card: c,
    submittedBy: users.find(u => u.id === c.submittedBy)?.name || "Unknown"
  }));
}

export function getTeamStats(store, teamId) {
  const members = store.list("teamMembers").filter(m => m.teamId === teamId);
  const users = store.list("users");
  const tasks = store.list("tasks");
  const cards = store.list("productionCards");
  const assignments = store.list("taskAssignments");

  return members.map(m => {
    const user = users.find(u => u.id === m.userId);
    const memberTasks = tasks.filter(t => assignments.some(a => a.taskId === t.id && a.assigneeId === m.userId));
    const memberCards = cards.filter(c => memberTasks.some(t => t.id === c.taskId));
    const pendingCards = memberCards.filter(c => c.status === "pending_review");
    const approvedCards = memberCards.filter(c => c.status === "approved");

    return {
      userId: m.userId,
      userName: user?.name || "Unknown",
      role: m.role,
      taskCount: memberTasks.length,
      cardCount: memberCards.length,
      pendingReviewCount: pendingCards.length,
      approvedCount: approvedCards.length,
      workload: memberTasks.length > 5 ? "heavy" : memberTasks.length > 2 ? "medium" : "light"
    };
  });
}

// ===== 辅助函数 =====
function createAssignmentId() { return "assign_" + randomHex(8); }
function createReviewId() { return "review_" + randomHex(8); }
function randomHex(length) { return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join(""); }

function notFound(entity, id) {
  const e = new Error(`${entity} not found: ${id}`);
  e.statusCode = 404; e.code = "not_found"; return e;
}

function badRequest(message) {
  const e = new Error(message);
  e.statusCode = 400; e.code = "bad_request"; return e;
}
