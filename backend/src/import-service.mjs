// 评论导入服务 — 文件解析 + 字段映射 + 批量入库
// 调用 comment-insights.mjs 的 classifyComment 对新评论打标签
// store.insertMany("comments", rows) で一括DB保存

import { parseCommentFile, autoDetectMapping } from "./file-parser.mjs";
import { classifyComment } from "./comment-insights.mjs";
import { createId, now } from "./store.mjs";

/**
 * importComments({ store, taskId, filePath }) 関数
 * - parseCommentFile でファイル解析
 * - classifyComment でコメントタグ付け
 * - store.insertMany("comments", rows) で一括DB保存
 *
 * @param {object} params
 * @param {object} params.store - 数据存储实例
 * @param {string} params.taskId - 任务ID
 * @param {string} params.filePath - 评论文件路径
 * @param {object} [params.mapping] - 自定义字段映射（可选）
 * @returns {Promise<{ inserted: number, skipped: number, total: number, fileInfo: object }>}
 */
export async function importComments({ store, taskId, filePath, mapping = null }) {
  // 1. 解析文件
  const parseResult = await parseCommentFile(filePath, { mapping });
  const { rows, mapping: detectedMapping, detectedColumns, format, confidence } = parseResult;

  // 2. 获取任务信息
  const task = store.get("tasks", taskId);
  if (!task) {
    throw new Error(`任务不存在: ${taskId}`);
  }

  // 3. 检查映射置信度
  if (confidence < 0.5 && !mapping) {
    console.warn(`[importComments] 列映射置信度较低: ${(confidence * 100).toFixed(0)}%，建议手动确认映射。未映射列: ${parseResult.unmappedColumns?.join(', ') || '无'}`);
  }

  // 4. 获取已有评论用于去重
  const existingComments = store.list("comments").filter(c => c.taskId === taskId);
  const existingExternalIds = new Set(
    existingComments
      .filter(c => c.commentIdExternal)
      .map(c => String(c.commentIdExternal))
  );

  // 5. 构建评论记录数组 → store.insertMany 批量保存
  let inserted = 0;
  let skipped = 0;
  const nowTime = now();
  const commentRecords = [];

  for (const row of rows) {
    // 去重检查 — 基于外部评论ID
    const externalId = row.commentIdExternal ? String(row.commentIdExternal) : null;
    if (externalId && existingExternalIds.has(externalId)) {
      skipped++;
      continue;
    }

    // 跳过空评论
    if (!row.commentText || String(row.commentText).trim() === '') {
      skipped++;
      continue;
    }

    // classifyComment でタグ付け
    const classified = classifyComment({
      commentIdExternal: externalId || '',
      commentText: String(row.commentText),
      likeCount: row.likeCount ?? 0
    });

    // 构建评论记录
    const comment = {
      id: createId("comment"),
      taskId,
      commentIdExternal: externalId || '',
      commentText: String(row.commentText).trim(),
      likeCount: row.likeCount ?? 0,
      replyCount: row.replyCount ?? 0,
      createdAtExternal: row.createdAtExternal || null,
      ipLocation: row.ipLocation || null,
      userNameHash: row.userNameHash || null,
      userLevel: row.userLevel || null,
      parentCommentId: row.parentCommentId || null,
      parentCommentText: row.parentCommentText || null,
      videoId: row.videoId || null,
      videoUrl: row.videoUrl || null,
      userIdHash: row.userIdHash || null,
      userUrl: row.userUrl || null,
      commentType: row.commentType || null,
      replyToUser: row.replyToUser || null,
      source: row.source || null,
      platform: row.platform || task.platform || null,

      // 自动分类标签 (classifyComment)
      labels: classified.signalKeys,
      signalKeys: classified.signalKeys,

      // 导入元数据
      importSource: format,
      importMapping: JSON.stringify(detectedMapping),
      importedAt: nowTime,
      createdAt: row.createdAtExternal || nowTime,
      updatedAt: nowTime
    };

    commentRecords.push(comment);
    existingExternalIds.add(externalId);
    inserted++;
  }

  // store.insertMany("comments", rows) で一括保存
  if (commentRecords.length > 0) {
    await store.insertMany("comments", commentRecords);
  }

  // 6. 记录评论文件信息
  const stats = await getFileStats(filePath);
  const fileRecord = {
    id: createId("file"),
    taskId,
    fileName: filePath.split(/[/\\]/).pop(),
    storageUrl: filePath,
    fileType: format,
    fileSize: stats?.size ?? 0,
    rowCount: inserted,
    mappingConfig: detectedMapping,
    parseStatus: 'completed',
    createdAt: nowTime,
    updatedAt: nowTime
  };
  await store.insert("commentFiles", fileRecord);

  return {
    inserted,
    skipped,
    total: inserted + skipped,
    fileInfo: {
      format,
      fileName: filePath.split(/[/\\]/).pop(),
      detectedColumns,
      mapping: detectedMapping,
      unmappedColumns: parseResult.unmappedColumns,
      confidence
    }
  };
}

/**
 * 确认/更新字段映射
 * @param {object} params
 * @param {object} params.store - 数据存储实例
 * @param {string} params.taskId - 任务ID
 * @param {object} params.mapping - 新映射配置 { 原始列名: js字段名 }
 * @returns {Promise<object>} 更新后的映射信息
 */
export async function confirmMapping({ store, taskId, mapping }) {
  if (!mapping || Object.keys(mapping).length === 0) {
    throw new Error('映射配置不能为空');
  }

  const commentFiles = store.list("commentFiles").filter(f => f.taskId === taskId);
  if (commentFiles.length === 0) {
    throw new Error(`任务 ${taskId} 没有关联的评论文件`);
  }

  for (const file of commentFiles) {
    const existingMapping = file.mappingConfig || {};
    const mergedMapping = { ...existingMapping, ...mapping };
    await store.update("commentFiles", file.id, {
      mappingConfig: mergedMapping,
      updatedAt: now()
    });
  }

  return { taskId, mapping, updatedFiles: commentFiles.length };
}

/**
 * 重新解析评论文件（使用新的映射配置）
 * @param {object} params
 * @param {object} params.store - 数据存储实例
 * @param {string} params.taskId - 任务ID
 * @param {string} params.filePath - 文件路径
 * @param {object} params.mapping - 新映射
 * @returns {Promise<object>} 导入结果
 */
export async function reparseWithMapping({ store, taskId, filePath, mapping }) {
  // 清空旧评论
  await store.replaceAll("comments", store.list("comments").filter(c => c.taskId !== taskId));
  // 清空旧文件记录
  await store.replaceAll("commentFiles", store.list("commentFiles").filter(f => f.taskId !== taskId));

  return importComments({ store, taskId, filePath, mapping });
}

/** 获取文件状态信息 */
async function getFileStats(filePath) {
  try {
    const { statSync } = await import("node:fs");
    return statSync(filePath);
  } catch {
    return null;
  }
}

// 同步版本（向后兼容）
export { parseCommentFile, detectFormat } from "./file-parser.mjs";
export { autoDetectMapping } from "./file-parser.mjs";
