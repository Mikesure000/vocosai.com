import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Typography, CircularProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, TextField, Alert, LinearProgress, Accordion, AccordionSummary, AccordionDetails,
} from "@mui/material";
import { ExpandMore, CheckCircle, Error as ErrorIcon, Schedule, Psychology } from "@mui/icons-material";
import { api, extractList } from "../../shared/services/api";

interface AgentRun {
  id: string; agentName: string; status: string;
  startedAt?: string; completedAt?: string;
  retryCount?: number; totalTokenCount?: number; actualCost?: number;
  outputJson?: any;
}
interface PipelineStage {
  id: string; label: string; icon: string; total: number; completed: number; failed: number; pending: number; status: string;
}

const STAGE_ICONS: Record<string, string> = {
  content_analysis: "🎯", data_cleaning: "🧹", deep_analysis: "🔍",
  insight_extraction: "💎", strategy_generation: "📋", quality_review: "✅",
};

export default function AiCenterPage() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [totalRuns, setTotalRuns] = useState(0);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskId, setTaskId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listTasks().then((d: any) => {
      const list = extractList(d);
      setTasks(Array.isArray(list) ? list : []);
    }).catch(() => {});
    loadAllRuns();
  }, []);

  function loadAllRuns() {
    setLoading(true); setError("");
    api.listAiRuns()
      .then((d: any) => {
        const list = extractList(d);
        setRuns(Array.isArray(list) ? list : []);
        setTotalRuns(list.length ?? 0);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!taskId) { setStages([]); return; }
    api.getTaskStatus(taskId).then((d: any) => {
      setStages((d.data?.stages ?? d.stages ?? d.progress?.stages ?? []).map((s: any) => ({
        ...s,
        icon: STAGE_ICONS[s.id] ?? "⚙",
        status: s.status ?? (s.completed === s.total ? "completed" : s.completed > 0 ? "running" : "pending"),
      })));
    }).catch(() => {});
  }, [taskId]);

  const successCount = runs.filter((r) => r.status === "success").length;
  const failCount = runs.filter((r) => r.status === "failed").length;
  const totalCost = runs.reduce((sum, r) => sum + (r.actualCost ?? 0), 0);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        <Psychology sx={{ mr: 1, verticalAlign: "middle", color: "#147d6f" }} />
        AI 分析中心
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        17个Agent全链路运行日志、状态监控与输出面板
      </Typography>

      {/* Stats Cards */}
      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        {[
          { label: "总运行数", value: totalRuns, color: "#147d6f" },
          { label: "成功", value: successCount, color: "#2e7d32" },
          { label: "失败", value: failCount, color: failCount > 0 ? "#d32f2f" : "#666" },
          { label: "总成本", value: `$${totalCost.toFixed(4)}`, color: "#ed6c02" },
        ].map((s) => (
          <Card key={s.label} sx={{ flex: 1, minWidth: 140 }}>
            <CardContent>
              <Typography variant="h5" sx={{ color: s.color, fontWeight: 700 }}>{s.value}</Typography>
              <Typography variant="body2" color="text.secondary">{s.label}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Pipeline Stages */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <TextField select label="选择任务查看管线进度" value={taskId} onChange={(e) => setTaskId(e.target.value)}
          sx={{ mb: 2, minWidth: 300 }}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
          <option value="">-- 选择任务 --</option>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.taskName ?? t.id}</option>)}
        </TextField>
        {stages.length > 0 && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {stages.map((s) => (
              <Card key={s.id} sx={{
                flex: "1 1 150px", minWidth: 140,
                borderTop: 4,
                borderColor: s.status === "completed" ? "#2e7d32" : s.status === "failed" ? "#d32f2f" : s.status === "running" ? "#ed6c02" : "#e0e0e0",
              }}>
                <CardContent sx={{ textAlign: "center" }}>
                  <Typography variant="h5">{s.icon}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.label}</Typography>
                  <Typography variant="caption">
                    {s.completed}/{s.total}
                    {s.failed > 0 && <span style={{ color: "#d32f2f" }}> ⚠{s.failed}</span>}
                  </Typography>
                  <LinearProgress variant="determinate"
                    value={s.total > 0 ? (s.completed / s.total) * 100 : 0}
                    color={s.status === "completed" ? "success" : s.status === "failed" ? "error" : "warning"}
                    sx={{ mt: 0.5, height: 4, borderRadius: 2 }} />
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Paper>

      {/* Agent Run Table */}
      {loading && <CircularProgress sx={{ display: "block", mx: "auto", my: 4 }} />}
      {error && <Alert severity="error">{error}</Alert>}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Agent</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>重试</TableCell>
              <TableCell>Token</TableCell>
              <TableCell>成本</TableCell>
              <TableCell>详情</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {runs.slice(0, 50).map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{r.agentName}</Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    icon={r.status === "success" ? <CheckCircle /> : r.status === "failed" ? <ErrorIcon /> : <Schedule />}
                    label={r.status === "success" ? "成功" : r.status === "failed" ? "失败" : "进行中"}
                    size="small"
                    color={r.status === "success" ? "success" : r.status === "failed" ? "error" : "default"}
                  />
                </TableCell>
                <TableCell>{r.retryCount ?? 0}</TableCell>
                <TableCell>{r.totalTokenCount?.toLocaleString() ?? "-"}</TableCell>
                <TableCell>${(r.actualCost ?? 0).toFixed(4)}</TableCell>
                <TableCell>
                  {r.outputJson ? (
                    <Accordion>
                      <AccordionSummary expandIcon={<ExpandMore />}>
                        <Typography variant="caption">展开输出</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <pre style={{ fontSize: 11, maxHeight: 200, overflow: "auto", whiteSpace: "pre-wrap" }}>
                          {typeof r.outputJson === "string" ? r.outputJson : JSON.stringify(r.outputJson, null, 2)}
                        </pre>
                      </AccordionDetails>
                    </Accordion>
                  ) : (
                    <Typography variant="caption" color="text.secondary">无</Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {runs.length === 0 && !loading && (
              <TableRow><TableCell colSpan={6} align="center">暂无 AI 运行记录 — 请先创建任务并启动分析</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
