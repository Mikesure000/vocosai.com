import { useEffect, useState } from "react";
import { Box, Card, CardContent, Typography, CircularProgress, Chip, LinearProgress, Alert, TextField, Button } from "@mui/material";
import { WarningAmber, PriceChange, HealthAndSafety, PersonOff, GppBad } from "@mui/icons-material";
import { api, extractList } from "../../shared/services/api";

interface Barrier {
  key: string;
  label: string;
  count: number;
  description: string;
  severity?: "high" | "medium" | "low";
}
interface TaskInfo { id: string; taskName: string; status: string }

const BARRIER_ICONS: Record<string, React.ReactNode> = {
  effect_skepticism: <WarningAmber />,
  price_objection: <PriceChange />,
  safety_concern: <HealthAndSafety />,
  audience_fit: <PersonOff />,
  trust_gap: <GppBad />,
};
const BARRIER_LABELS: Record<string, string> = {
  effect_skepticism: "效果怀疑",
  price_objection: "价格异议",
  safety_concern: "安全担忧",
  audience_fit: "人群不适配",
  trust_gap: "信任缺口",
};
const BARRIER_DESCS: Record<string, string> = {
  effect_skepticism: "用户对产品实际效果存疑，需要实证内容说服",
  price_objection: "用户认为价格偏高或性价比不足",
  safety_concern: "用户担心副作用/安全隐患，尤其是透皮类产品",
  audience_fit: "用户认为自己不属于目标人群，或肤质不匹配",
  trust_gap: "用户对品牌/技术缺乏信任，需权威背书",
};

export default function ObstaclesPage() {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [taskId, setTaskId] = useState("");
  const [barriers, setBarriers] = useState<Barrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listTasks().then((d: any) => {
      const list = extractList(d);
      setTasks(Array.isArray(list) ? list : []);
      if (list.length > 0) setTaskId(list[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!taskId) return;
    setLoading(true);
    setError("");
    api.getCommentSignals(taskId)
      .then((d: any) => {
        const signals = d.data?.signals ?? d.signals ?? [];
        const topBarriers = d.data?.topBarriers ?? d.topBarriers ?? [];
        const mapped: Barrier[] = (topBarriers.length > 0 ? topBarriers : signals
          .filter((s: any) => ["effect_skepticism","price_objection","safety_concern","audience_fit","trust_gap"].includes(s.key))
          .slice(0, 5))
          .map((s: any) => ({
            key: s.key ?? s.label,
            label: BARRIER_LABELS[s.key] ?? s.label ?? s.key,
            count: s.count ?? 0,
            description: BARRIER_DESCS[s.key] ?? s.description ?? "",
            severity: s.count > 20 ? "high" as const : s.count > 10 ? "medium" as const : "low" as const,
          }));
        setBarriers(mapped);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [taskId]);

  const total = barriers.reduce((s, b) => s + b.count, 0);
  const severityColor = (s?: string) => s === "high" ? "error" : s === "medium" ? "warning" : "success";

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        购买障碍地图
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        识别阻止用户下单的核心障碍，按严重程度排序
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

      {!loading && !error && barriers.length === 0 && taskId && (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography color="text.secondary">暂无数据 — 请先导入评论并启动AI分析</Typography>
          <Button variant="outlined" href="/signals" sx={{ mt: 2 }}>前往导入评论</Button>
        </Box>
      )}

      {barriers.length > 0 && (
        <>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>共 {total} 条障碍信号</Typography>
          {barriers.map((b) => (
            <Card key={b.key} sx={{ mb: 2, borderLeft: 6, borderColor: `${severityColor(b.severity)}.main` }}>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {BARRIER_ICONS[b.key]}
                    <Typography variant="h6">{b.label}</Typography>
                  </Box>
                  <Chip label={`${b.count} 条`} color={severityColor(b.severity) as any} size="small" />
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{b.description}</Typography>
                <LinearProgress variant="determinate" value={total > 0 ? (b.count / total) * 100 : 0}
                  color={severityColor(b.severity) as any} sx={{ height: 8, borderRadius: 4 }} />
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </Box>
  );
}
