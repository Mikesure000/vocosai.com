export const TASK_STATUSES = [
  "draft",
  "uploaded",
  "mapping_required",
  "ready",
  "analyzing",
  "partially_failed",
  "failed",
  "completed",
  "exported",
  "archived"
];

const TRANSITIONS = {
  draft: ["uploaded", "archived"],
  uploaded: ["mapping_required", "ready", "archived"],
  mapping_required: ["ready", "uploaded", "archived"],
  ready: ["analyzing", "archived"],
  analyzing: ["completed", "partially_failed", "failed"],
  partially_failed: ["analyzing", "completed", "failed", "archived"],
  failed: ["analyzing", "archived"],
  completed: ["exported", "analyzing", "archived"],
  exported: ["analyzing", "archived"],
  archived: []
};

export function canTransition(from, to) {
  return Boolean(TRANSITIONS[from]?.includes(to));
}

export function assertTransition(from, to) {
  if (!TASK_STATUSES.includes(from)) {
    throw new Error(`Unknown task status: ${from}`);
  }

  if (!TASK_STATUSES.includes(to)) {
    throw new Error(`Unknown target status: ${to}`);
  }

  if (!canTransition(from, to)) {
    throw new Error(`Invalid task transition: ${from} -> ${to}`);
  }
}

export function nextStatusForParsedFile({ needsMapping }) {
  return needsMapping ? "mapping_required" : "ready";
}
