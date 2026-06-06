import { useEffect, useState } from "react";
import {
  Box, Typography, CircularProgress, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip,
} from "@mui/material";
import { Assessment, TrendingUp, TrendingDown, Remove } from "@mui/icons-material";
import { api } from "../../shared/services/api";

interface BenchmarkItem {
  metric: string;
  ourValue: number;
  industryAvg: number;
  unit: string;
  trend: "up" | "down" | "flat";
}

export default function BenchmarkPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskId, setTaskId] = useState("");
  const [metrics, setMetrics] = useState<BenchmarkItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.listTasks().then((d: any) => {
      const list = d.data ?? d.tasks ?? d ?? [];
      setTasks(Array.isArray(list) ? list : []);
      if (list.length > 0) setTaskId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!taskId) return;
    setLoading(true);
    api.getCommentSignals(taskId)
      .then((d: any) => {
        const signals = d.data?.signals ?? d.signals ?? [];
        const total = (d.data?.totalComments ?? d.totalComments ?? 0) || 1;
        const purchase = signals.find((s: any) => s.key === "purchase_intent")?.count ?? 0;
        const competitor = signals.find((s: any) => s.key === "competitor_comparison")?.count ?? 0;
        const negative = signals.find((s: any) => s.key === "negative_experience")?.count ?? 0;
        const effect = signals.find((s: any) => s.key === "effect_skepticism")?.count ?? 0;
        const ingredient = signals.find((s: any) => s.key === "ingredient_focus")?.count ?? 0;

        setMetrics([
          { metric: "购买意图率", ourValue: Number(((purchase / total) * 100).toFixed(1)), industryAvg: 8.5, unit: "%", trend: (purchase / total) * 100 > 8.5 ? "up" : "down" },
          { metric: "竞品提及率", ourValue: Number(((competitor / total) * 100).toFixed(1)), industryAvg: 12.0, unit: "%", trend: "down" },
          { metric: "负面信号率", ourValue: Number(((negative / total) * 100).toFixed(1)), industryAvg: 15.0, unit: "%", trend: (negative / total) * 100 < 15 ? "up" : "down" },
          { metric: "效果疑虑率", ourValue: Number(((effect / total) * 100).toFixed(1)), industryAvg: 20.0, unit: "%", trend: (effect / total) * 100 < 20 ? "up" : "down" },
          { metric: "成分关注度", ourValue: Number(((ingredient / total) * 100).toFixed(1)), industryAvg: 6.0, unit: "%", trend: (ingredient / total) * 100 > 6 ? "up" : "down" },
        ]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [taskId]);

  const trendIcon = (t: string) =>
    t === "up" ? <TrendingUp color="success" /> : t === "down" ? <TrendingDown color="error" /> : <Remove />;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        <Assessment sx={{ mr: 1, verticalAlign: "middle", color: "#147d6f" }} />
        对标中心
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        将品牌数据与行业均值对比，发现差距与优势
      </Typography>

      {tasks.length > 0 && (
        <TextField select label="选择任务" value={taskId} onChange={(e) => setTaskId(e.target.value)}
          sx={{ mb: 3, minWidth: 300 }}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.taskName ?? t.id}</option>)}
        </TextField>
      )}

      {loading && <CircularProgress sx={{ display: "block", mx: "auto", my: 4 }} />}

      {metrics.length > 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>指标</TableCell>
                <TableCell align="right">我们的值</TableCell>
                <TableCell align="right">行业均值</TableCell>
                <TableCell align="right">差距</TableCell>
                <TableCell align="center">趋势</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {metrics.map((m) => {
                const diff = Number((m.ourValue - m.industryAvg).toFixed(1));
                return (
                  <TableRow key={m.metric}>
                    <TableCell><Typography sx={{ fontWeight: 500 }}>{m.metric}</Typography></TableCell>
                    <TableCell align="right">{m.ourValue}{m.unit}</TableCell>
                    <TableCell align="right">{m.industryAvg}{m.unit}</TableCell>
                    <TableCell align="right">
                      <Chip
                        label={`${diff > 0 ? "+" : ""}${diff}${m.unit}`}
                        color={m.trend === "up" ? "success" : "error"}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">{trendIcon(m.trend)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
