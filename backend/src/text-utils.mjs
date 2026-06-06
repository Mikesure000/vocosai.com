export function isCorruptDisplayText(value) {
  const text = String(value ?? "").trim();
  if (!text) return true;
  const questionMarks = (text.match(/\?/g) ?? []).length;
  const replacementChars = (text.match(/\uFFFD/g) ?? []).length;
  return questionMarks >= 4 || replacementChars > 0;
}

export function cleanDisplayText(value, fallback = "") {
  const text = String(value ?? "").trim();
  if (!text || isCorruptDisplayText(text)) return fallback;
  return text;
}

export function deriveTitleFromFileName(fileName, fallback = "Analysis") {
  const name = String(fileName ?? "").trim();
  if (!name || isCorruptDisplayText(name)) return fallback;
  const videoTitle = name.match(/视频[「"](.*?)[」"]/u)?.[1]?.trim();
  if (videoTitle) return videoTitle;
  return name
    .replace(/\.(csv|xlsx|xls)$/i, "")
    .replace(/[-_]?评论数据[-_]?\d{8}[-_]?\d{4}$/u, "")
    .replace(/^【社媒助手】/u, "")
    .trim() || fallback;
}

export function buildTaskDisplayTitle({ task, commentFiles = [], suffix = "" }) {
  const fallbackFromFile = deriveTitleFromFileName(commentFiles[0]?.fileName, "");
  const base = cleanDisplayText(task?.taskName)
    || cleanDisplayText(task?.contentTitle)
    || fallbackFromFile
    || cleanDisplayText(task?.id, "Analysis");
  return `${base}${suffix}`;
}

export function asciiFileNameFallback(value, fallback = "download") {
  const cleaned = String(value ?? fallback)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .trim();
  const ascii = cleaned.replace(/[^\x20-\x7E]+/g, "");
  return (ascii || fallback).slice(0, 120);
}

export function contentDispositionAttachment(fileName) {
  const encoded = encodeURIComponent(String(fileName ?? "download"));
  return `attachment; filename="${asciiFileNameFallback(fileName)}"; filename*=UTF-8''${encoded}`;
}
