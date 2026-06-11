// 任务管线编排模块
// 当前为占位模块，管线逻辑在 server.mjs 中直接实现
// 后续可抽取管线编排逻辑到此处，支持更复杂的 DAG 执行模式

/**
 * 创建管线执行器
 * @param {{ store: object }} params
 * @returns {{ run: Function, getStatus: Function }}
 */
export function createTaskPipeline({ store }) {
  return {
    /**
     * 异步运行管线
     * @param {string} taskId - 任务 ID
     * @returns {Promise<void>}
     */
    async run(taskId) {
      // 占位：当前管线逻辑在 server.mjs 的 runPipelineJob 中
      throw new Error("Task pipeline not yet extracted to this module. Use server.mjs runPipelineJob instead.");
    },

    /**
     * 获取管线状态
     * @param {string} taskId - 任务 ID
     * @returns {object|null}
     */
    getStatus(taskId) {
      return store.getPipelineJob?.(taskId) ?? null;
    }
  };
}
