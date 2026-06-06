import { useEffect, useState } from "react";
import { Box, Card, CardContent, Typography, CircularProgress, Chip, TextField, Button, Alert } from "@mui/material";
import { CompareArrows, Lightbulb, TrendingUp } from "@mui/icons-material";
import { api } from "../../shared/services/api";

interface TaskInfo { id: string; taskName: string; status: string }
interface OppSignal { key: string; label: string; count: number; sample: string }

const SIGNAL_LABELS: Record<string, string> = {
  competitor_comparison: "竞品比较",
  purchase_intent: "购买意图",
  scenario_need: "场景需求",
  ingredient_focus: "成分关注",
};

export default function CompetitorPage() {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [taskId, setTaskId] = useState("");
  const [signals, setSignals] = useState<OppSignal[]>([]);
  const [sampleComments, setSampleComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listTasks().then((d: any) => {
      const list = d.data ?? d.tasks ?? d ?? [];
      setTasks(Array.isArray(list) ? list : []);
      if (list.length > 0) setTaskId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!taskId) return;
    setLoading(true); setError("");
    api.getCommentSignals(taskId)
      .then((d: any) => {
        const all = d.data?.signals ?? d.signals ?? [];
        setSignals(all.filter((s: any) =>
          ["competitor_comparison","purchase_intent","scenario_need","ingredient_focus"].includes(s.key)
        ).map((s: any) => ({
          key: s.key, label: SIGNAL_LABELS[s.key] ?? s.label ?? s.key,
          count: s.count ?? 0, sample: s.description ?? "",
        })));
        // Load competitor comparison samples
        const compSig = all.find((s: any) => s.key === "competitor_comparison");
        if (compSig) {
          return api.getSignalComments(taskId, "competitor_comparison") as Promise<any>;
        }
      })
      .then((d: any) => {
        if (d) setSampleComments((d.data?.comments ?? d.comments ?? []).slice(0, 5));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [taskId]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        <CompareArrows sx={{ mr: 1, verticalAlign: "middle" }} />
        竞品机会地图
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        从用户评论中发现竞品提及与可切入的机会信号
      </Typography>

      {tasks.length > 0 && (
        <TextField select label="选择任务" value={taskId} onChange={(e) => setTaskId(e.target.value)}
          sx={{ mb: 3, minWidth: 300 }}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.taskName ?? t.id}</option>)}
        </TextField>
      )}

      {loading && <CircularProgress sx={{ display: "block", mx: "auto", my: 8 }} />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && !error && signals.length === 0 && taskId && (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography color="text.secondary">暂无信号 — 请先运行AI分析管线</Typography>
          <Button variant="outlined" href="/signals" sx={{ mt: 2 }}>前往信号池</Button>
        </Box>
      )}

      {signals.length > 0 && (
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {signals.map((s) => (
            <Card key={s.key} sx={{ flex: "1 1 280px", maxWidth: 380 }}>
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  {s.key === "competitor_comparison" ? <CompareArrows color="primary" /> :
                   s.key === "purchase_intent" ? <TrendingUp color="success" /> :
                   <Lightbulb color="warning" />}
                  <Typography variant="h6">{s.label}</Typography>
                </Box>
                <Chip label={`${s.count} 条信号`} color={s.key === "competitor_comparison" ? "primary" : "default"} size="small" />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {s.sample || "点击查看详情评论"}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {sampleComments.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>竞品提及评论样例</Typography>
          {sampleComments.map((c: any, i: number) => (
            <Card key={i} variant="outlined" sx={{ mb: 1, p: 1.5 }}>
              <Typography variant="body2">"{c.commentText ?? c.content ?? c.text}"</Typography>
              <Typography variant="caption" color="text.secondary">
                👍 {c.likeCount ?? 0} · {c.userNameHash ?? "匿名"}
              </Typography>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
