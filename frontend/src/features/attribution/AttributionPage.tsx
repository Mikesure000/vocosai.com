import { useEffect, useState } from "react";
import { Box, Card, CardContent, Typography, CircularProgress, TextField, Button, Alert, Divider, Chip } from "@mui/material";
import { Replay, ContentPaste, TrendingUp } from "@mui/icons-material";
import { api } from "../../shared/services/api";

interface TaskInfo { id: string; taskName: string; status: string }
interface AttributionPair { contentPoint: string; reactions: { type: string; count: number; comments: string[] }; impact: string }

export default function AttributionPage() {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [taskId, setTaskId] = useState("");
  const [pairs, setPairs] = useState<AttributionPair[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listTasks().then((d: any) => {
      const list = Array.isArray(d?.data) ? d.data : Array.isArray(d?.tasks) ? d.tasks : Array.isArray(d?.runs) ? d.runs : Array.isArray(d?.brands) ? d.brands : Array.isArray(d) ? d : [];
      setTasks(Array.isArray(list) ? list : []);
      if (list.length > 0) setTaskId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!taskId) return;
    setLoading(true); setError("");
    fetch(`/api/tasks/${taskId}/diagnosis`)
      .then((r) => r.json())
      .then((d: any) => {
        const data = d.data ?? d;
        setPairs((data.pairs ?? []).map((p: any) => ({
          contentPoint: p.content_point ?? p.contentPoint ?? p.label ?? "-",
          reactions: {
            type: p.reaction_type ?? p.reactionType ?? "mixed",
            count: p.count ?? p.reactions?.length ?? 0,
            comments: p.comments ?? p.reactions ?? [],
          },
          impact: p.impact ?? p.insight ?? "-",
        })));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [taskId]);

  const reactionColor = (t: string) => t === "positive" ? "success" : t === "negative" ? "error" : "default";

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        <Replay sx={{ mr: 1, verticalAlign: "middle", color: "#147d6f" }} />
        复盘归因
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        将每条评论精准归因到内容的哪个点、引发了哪种反应
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

      {!loading && !error && pairs.length === 0 && taskId && (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography color="text.secondary">暂无归因数据 — 请先运行AI分析管线</Typography>
          <Button variant="outlined" href="/signals" sx={{ mt: 2 }}>前往信号池</Button>
        </Box>
      )}

      {pairs.map((p, i) => (
        <Card key={i} variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <ContentPaste color="primary" />
              <Typography variant="h6">{p.contentPoint}</Typography>
              <Chip label={`${p.reactions.count} 条相关评论`}
                color={reactionColor(p.reactions.type)} size="small" />
            </Box>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, color: "text.secondary" }}>
              <TrendingUp fontSize="small" sx={{ mt: 0.3 }} />
              <Typography variant="body2">{p.impact}</Typography>
            </Box>
            {p.reactions.comments.length > 0 && (
              <Box sx={{ mt: 1.5, p: 1.5, bgcolor: "grey.50", borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">代表评论：</Typography>
                {p.reactions.comments.slice(0, 3).map((c, j) => (
                  <Typography key={j} variant="body2" sx={{ mt: 0.5, fontStyle: "italic" }}>
                    "{typeof c === "string" ? c : (c as any).text ?? (c as any).content ?? JSON.stringify(c).slice(0, 80)}"
                  </Typography>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
