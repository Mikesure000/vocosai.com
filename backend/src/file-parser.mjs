// 评论文件解析器 — 支持 xlsx (SheetJS)、csv、json
// 20+ 字段中英文映射表，从部署版 parse_csv_payload 提取

import { readFileSync } from "node:fs";
import { extname } from "node:path";

// 列名映射表：中文列名 → Js 字段名
const COLUMN_MAP = {
  // 评论核心
  '评论ID': 'commentIdExternal',
  '评论内容': 'commentText',
  '评论正文': 'commentText',
  '评论': 'commentText',
  '内容': 'commentText',
  '正文': 'commentText',

  // 点赞
  '点赞量': 'likeCount',
  '点赞数': 'likeCount',
  '点赞': 'likeCount',
  '赞': 'likeCount',

  // 时间
  '评论时间': 'createdAtExternal',
  '时间': 'createdAtExternal',
  '发布时间': 'createdAtExternal',
  '创建时间': 'createdAtExternal',

  // IP / 地域
  'IP地址': 'ipLocation',
  'IP属地': 'ipLocation',
  'IP': 'ipLocation',
  '属地': 'ipLocation',
  '城市': 'ipLocation',

  // 用户
  '用户名称': 'userNameHash',
  '用户名': 'userNameHash',
  '用户昵称': 'userNameHash',
  '昵称': 'userNameHash',
  '作者': 'userNameHash',

  // 用户等级
  '抖音号': 'userLevel',
  '等级': 'userLevel',
  '用户等级': 'userLevel',

  // 父级评论
  '一级评论ID': 'parentCommentId',
  '上级评论ID': 'parentCommentId',
  '父评论ID': 'parentCommentId',
  '回复评论ID': 'parentCommentId',
  'parent_id': 'parentCommentId',

  // 父级内容
  '一级评论内容': 'parentCommentText',
  '上级评论内容': 'parentCommentText',
  '父评论内容': 'parentCommentText',

  // 回复数
  '子评论数': 'replyCount',
  '回复数': 'replyCount',
  '回复量': 'replyCount',
  '子评论量': 'replyCount',

  // 视频
  '视频ID': 'videoId',
  '视频链接': 'videoUrl',
  '视频地址': 'videoUrl',
  '链接': 'videoUrl',

  // 用户ID
  '用户UID': 'userIdHash',
  '用户ID': 'userIdHash',
  'UID': 'userIdHash',
  'user_id': 'userIdHash',

  // 用户链接
  '用户链接': 'userUrl',
  '用户主页': 'userUrl',
  '主页': 'userUrl',

  // 评论类型
  '评论类型': 'commentType',
  '类型': 'commentType',

  // 回复对象
  '回复对象': 'replyToUser',
  '回复用户': 'replyToUser',

  // 评论来源
  '评论来源': 'source',
  '来源': 'source',

  // 平台
  '平台': 'platform',
  '发布平台': 'platform',

  // JSON 原始字段（英文直接映射）
  'id': 'commentIdExternal',
  'commentIdExternal': 'commentIdExternal',
  'commentText': 'commentText',
  'content': 'commentText',
  'text': 'commentText',
  'likeCount': 'likeCount',
  'likes': 'likeCount',
  'createdAtExternal': 'createdAtExternal',
  'comment_time': 'createdAtExternal',
  'ipLocation': 'ipLocation',
  'userNameHash': 'userNameHash',
  'userLevel': 'userLevel',
  'parentCommentId': 'parentCommentId',
  'parentCommentText': 'parentCommentText',
  'replyCount': 'replyCount',
  'videoId': 'videoId',
  'videoUrl': 'videoUrl',
  'userIdHash': 'userIdHash',
  'userUrl': 'userUrl',
  'commentType': 'commentType',
  'replyToUser': 'replyToUser',
  'source': 'source',
  'platform': 'platform',
};

/** 检测文件格式 */
function detectFormat(filePath) {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case '.xlsx':
    case '.xls':
      return 'xlsx';
    case '.csv':
    case '.tsv':
      return 'csv';
    case '.json':
      return 'json';
    default:
      return 'unknown';
  }
}

/** 自动检测列映射 */
export function autoDetectMapping(columns) {
  const mapped = {};
  const unmapped = [];
  let matchCount = 0;

  for (const col of columns) {
    const normalized = String(col).trim();
    const key = COLUMN_MAP[normalized];
    if (key) {
      mapped[normalized] = key;
      matchCount++;
    } else {
      // 尝试模糊匹配（包含关系）
      let found = false;
      for (const [cnKey, jsKey] of Object.entries(COLUMN_MAP)) {
        if (normalized.includes(cnKey) || cnKey.includes(normalized)) {
          mapped[normalized] = jsKey;
          matchCount++;
          found = true;
          break;
        }
      }
      if (!found) {
        unmapped.push(normalized);
      }
    }
  }

  const confidence = columns.length > 0 ? matchCount / columns.length : 0;

  return { mapped, unmapped, confidence };
}

/** 应用列映射 — 将原始行转换为标准字段 */
function applyMapping(row, mapping) {
  const result = {};
  for (const [srcCol, rawValue] of Object.entries(row)) {
    const targetKey = mapping[String(srcCol).trim()];
    if (targetKey) {
      // 类型转换
      let value = rawValue;
      if (value !== null && value !== undefined && value !== '') {
        // 数字字段转换
        if (['likeCount', 'replyCount'].includes(targetKey)) {
          const num = Number(value);
          if (!isNaN(num)) value = num;
        }
        // 字符串字段确保为字符串
        else if (typeof value !== 'string') {
          value = String(value);
        }
      }
      result[targetKey] = value;
    }
  }
  return result;
}

/** 解析 JSON 文件 */
function parseJson(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const arr = Array.isArray(data) ? data : (data.data ?? data.items ?? data.comments ?? [data]);
  const columns = arr.length > 0 ? Object.keys(arr[0]) : [];
  const { mapped, unmapped, confidence } = autoDetectMapping(columns);

  return {
    format: 'json',
    rows: arr,
    columns,
    mapping: mapped,
    unmappedColumns: unmapped,
    confidence,
    total: arr.length
  };
}

/** 解析 CSV 文件 */
function parseCsv(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(line => line.trim());

  if (lines.length === 0) {
    return {
      format: 'csv',
      rows: [],
      columns: [],
      mapping: {},
      unmappedColumns: [],
      confidence: 0,
      total: 0
    };
  }

  // 解析 CSV 行（处理引号内的逗号）
  function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  // 检测 BOM
  let headerLine = lines[0];
  if (headerLine.charCodeAt(0) === 0xFEFF) {
    headerLine = headerLine.slice(1);
  }

  const headers = parseCsvLine(headerLine);
  const { mapped, unmapped, confidence } = autoDetectMapping(headers);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;

    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] !== undefined ? values[j] : '';
    }
    rows.push(row);
  }

  return {
    format: 'csv',
    rows,
    columns: headers,
    mapping: mapped,
    unmappedColumns: unmapped,
    confidence,
    total: rows.length
  };
}

/** 解析 XLSX 文件 */
let _xlsx = null;
function getXlsx() {
  if (!_xlsx) {
    try {
      _xlsx = await_import_xlsx();
    } catch (e) {
      throw new Error('xlsx 依赖未安装，请运行：npm install xlsx');
    }
  }
  return _xlsx;
}

function await_import_xlsx() {
  // 动态 import，避免顶层 await 问题
  return import('xlsx').then(m => m.default || m);
}

async function parseXlsx(filePath) {
  const XLSX = await import('xlsx').then(m => m.default || m);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  if (rawRows.length === 0) {
    return {
      format: 'xlsx',
      rows: [],
      columns: [],
      mapping: {},
      unmappedColumns: [],
      confidence: 0,
      total: 0
    };
  }

  const columns = Object.keys(rawRows[0]);
  const { mapped, unmapped, confidence } = autoDetectMapping(columns);

  return {
    format: 'xlsx',
    rows: rawRows,
    columns,
    mapping: mapped,
    unmappedColumns: unmapped,
    confidence,
    total: rawRows.length
  };
}

/**
 * 解析评论文件，自动检测格式
 * @param {string} filePath - 文件路径
 * @param {object} [options] - 选项
 * @param {object} [options.mapping] - 自定义字段映射 { 原始列名: js字段名 }
 * @param {number} [options.maxRows] - 最大行数限制
 * @returns {Promise<{ rows: Array, mapping: object, detectedColumns: Array, format: string, total: number, unmappedColumns: Array, confidence: number }>}
 */
export async function parseCommentFile(filePath, options = {}) {
  const format = detectFormat(filePath);

  let result;
  switch (format) {
    case 'json':
      result = parseJson(filePath);
      break;
    case 'csv':
      result = parseCsv(filePath);
      break;
    case 'xlsx':
      result = await parseXlsx(filePath);
      break;
    default:
      throw new Error(`不支持的文件格式: ${extname(filePath)}. 支持: .xlsx, .csv, .json`);
  }

  // 使用自定义映射（如果提供）
  if (options.mapping && Object.keys(options.mapping).length > 0) {
    result.mapping = { ...result.mapping, ...options.mapping };
    result.confidence = 1.0;
  }

  // 应用映射转换行数据
  const mappedRows = result.rows.map(row => applyMapping(row, result.mapping));

  // 限制行数
  if (options.maxRows && options.maxRows > 0 && mappedRows.length > options.maxRows) {
    result.rows = mappedRows.slice(0, options.maxRows);
  } else {
    result.rows = mappedRows;
  }
  result.total = result.rows.length;

  return {
    format: result.format,
    rows: result.rows,
    mapping: result.mapping,
    detectedColumns: result.columns,
    unmappedColumns: result.unmappedColumns,
    confidence: result.confidence,
    total: result.total
  };
}

/** 同步检测文件格式 */
export { detectFormat };

/** 导出列映射表供外部使用 */
export { COLUMN_MAP };

// ============================================================
// Server-side parse functions (content-based, returns full record)
// ============================================================

import { createId, now } from "./store.mjs";

/**
 * Parse comments from file content (string).
 * Used for JSON/text-based uploads.
 */
export function parseCommentFileContent({ fileName, fileContent, platform = "douyin", mapping = null }) {
  const format = detectFormat(fileName);

  let rawRows;
  let columns;

  switch (format) {
    case "json": {
      const data = JSON.parse(fileContent);
      const arr = Array.isArray(data) ? data : (data.data ?? data.items ?? data.comments ?? [data]);
      rawRows = arr;
      columns = arr.length > 0 ? Object.keys(arr[0]) : [];
      break;
    }
    case "csv": {
      const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
      if (lines.length === 0) {
        rawRows = [];
        columns = [];
        break;
      }
      let headerLine = lines[0];
      if (headerLine.charCodeAt(0) === 0xFEFF) headerLine = headerLine.slice(1);
      const headers = parseCsvLineSync(headerLine);
      columns = headers;
      rawRows = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLineSync(lines[i]);
        if (values.length === 0 || (values.length === 1 && !values[0])) continue;
        const row = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = values[j] !== undefined ? values[j] : "";
        }
        rawRows.push(row);
      }
      break;
    }
    case "xlsx":
    default:
      throw new Error(`fileContent mode does not support format: ${format}. Use parseCommentFileBuffer for binary formats.`);
  }

  const mappingResult = mapping ?? autoDetectMapping(columns);
  return buildFullParseResult({ format, fileName, platform, mapping: mappingResult, rows: rawRows, total: rawRows.length });
}

function parseCsvLineSync(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parse comments from file buffer (Buffer).
 * Used for multipart/form-data uploads.
 */
export async function parseCommentFileBuffer({ fileName, fileBuffer, platform = "douyin", mapping = null }) {
  const format = detectFormat(fileName);

  let rawRows;
  let columns;

  if (format === "xlsx") {
    const XLSX = await import("xlsx").then(m => m.default || m);
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  } else if (format === "csv") {
    const content = fileBuffer.toString("utf8");
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) {
      rawRows = [];
      columns = [];
    } else {
      let headerLine = lines[0];
      if (headerLine.charCodeAt(0) === 0xFEFF) headerLine = headerLine.slice(1);
      const headers = parseCsvLineSync(headerLine);
      columns = headers;
      rawRows = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLineSync(lines[i]);
        if (values.length === 0 || (values.length === 1 && !values[0])) continue;
        const row = {};
        for (let j = 0; j < headers.length; j++) {
          row[headers[j]] = values[j] !== undefined ? values[j] : "";
        }
        rawRows.push(row);
      }
    }
  } else if (format === "json") {
    const content = fileBuffer.toString("utf8");
    const data = JSON.parse(content);
    const arr = Array.isArray(data) ? data : (data.data ?? data.items ?? data.comments ?? [data]);
    rawRows = arr;
    columns = arr.length > 0 ? Object.keys(arr[0]) : [];
  } else {
    throw new Error(`Unsupported file format: ${format}. Supported: .xlsx, .csv, .json`);
  }

  const mappingResult = mapping ?? autoDetectMapping(columns);
  return buildFullParseResult({ format, fileName, platform, mapping: mappingResult, rows: rawRows, total: rawRows.length });
}

function buildFullParseResult({ format, fileName, platform, mapping, rows, total }) {
  const needsMapping = !mapping || Object.keys(mapping.mapped ?? mapping).length === 0;

  // Apply mapping to get comments
  const comments = rows.map((row, index) => {
    const mapped = applyMapping(row, mapping.mapped ?? mapping);
    return {
      id: createId("cmt"),
      taskId: null,
      commentFileId: null,
      index,
      commentIdExternal: mapped.commentIdExternal ?? `row_${index}`,
      commentText: mapped.commentText ?? "",
      likeCount: Number(mapped.likeCount ?? 0) || 0,
      createdAtExternal: mapped.createdAtExternal ?? null,
      ipLocation: mapped.ipLocation ?? "",
      userNameHash: mapped.userNameHash ?? "",
      userLevel: mapped.userLevel ?? "",
      parentCommentId: mapped.parentCommentId ?? null,
      parentCommentText: mapped.parentCommentText ?? "",
      replyCount: Number(mapped.replyCount ?? 0) || 0,
      videoId: mapped.videoId ?? "",
      videoUrl: mapped.videoUrl ?? "",
      userIdHash: mapped.userIdHash ?? "",
      userUrl: mapped.userUrl ?? "",
      commentType: mapped.commentType ?? "",
      replyToUser: mapped.replyToUser ?? "",
      source: mapped.source ?? "",
      platform: mapped.platform ?? platform,
      createdBy: "system",
      createdAt: now(),
      updatedAt: now()
    };
  });

  const errors = [];
  let skippedEmpty = 0;
  for (const comment of comments) {
    if (!comment.commentText || String(comment.commentText).trim() === "") {
      skippedEmpty++;
    }
  }

  const file = {
    id: createId("cmtfile"),
    fileName,
    format,
    rowCount: total,
    parseStatus: needsMapping ? "mapping_required" : "parsed",
    mappingConfig: needsMapping ? null : (mapping.mapped ?? mapping),
    platform,
    parseErrors: errors,
    createdAt: now()
  };

  return {
    file,
    needsMapping,
    mapping: mapping.mapped ?? mapping,
    comments,
    stats: {
      totalRows: total,
      parsedRows: comments.length,
      errorRows: errors.length,
      skippedEmpty,
      mappingConfidence: mapping.confidence ?? 0
    },
    preview: comments.slice(0, 10)
  };
}

