import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Typography, CircularProgress, Chip,
  TextField, Button, Alert, Divider,
} from "@mui/material";
import { AutoAwesome, ContentCopy, TrendingUp, Campaign } from "@mui/icons-material";
import { api } from "../../shared/services/api";

interface TaskInfo { id: string; taskName: string; status: string }
interface ContentIdea {
  title: string;
  angle: "hook" | "trust" | "comparison" | "education" | "testimonial";
  rationale: string;
  signalSource: string;
}

const ANGLE_ICONS: Record<string, React.ReactNode> = {
  hook: <Campaign />, trust: <AutoAwesome />, comparison: <TrendingUp />,
  education: <ContentCopy />, testimonial: <AutoAwesome />,
};
const ANGLE_LABELS: Record<string, string> = {
  hook: "钩子型", trust: "信任型", comparison: "对比型", education: "科普型", testimonial: "证言型",
};

function generateIdeas(signals: any[]): ContentIdea[] {
  const ideas: ContentIdea[] = [];
  const hasSignal = (key: string) => signals.some((s: any) => s.key === key && (s.count ?? 0) > 0);
  if (hasSignal("effect_skepticism")) ideas.push({
    title: "「28天实测」仙人掌眼膜前后对比挑战",
    angle: "testimonial", rationale: "用户最关心效果，用真实前后对比打消怀疑", signalSource: "效果怀疑",
  });
  if (hasSignal("safety_concern")) ideas.push({
    title: "「70根微晶透皮」安全吗？皮肤科医生3分钟讲透原理",
    angle: "education", rationale: "用专业科普缓解安全焦虑，建立技术信任", signalSource: "安全担忧",
  });
  if (hasSignal("price_objection")) ideas.push({
    title: "「一片眼膜=一次美容院」成本对比拆解",
    angle: "comparison", rationale: "用性价比对比回应价格异议", signalSource: "价格异议",
  });
  if (hasSignal("competitor_comparison")) ideas.push({
    title: "「用过XX和XX的人换克奥妮斯后说了什么」竞品横评",
    angle: "comparison", rationale: "直面竞品对比，用真实用户转品牌案例说服", signalSource: "竞品比较",
  });
  if (hasSignal("ingredient_focus")) ideas.push({
    title: "「仙人掌透皮技术的3个你不知道的黑科技」成分深扒",
    angle: "education", rationale: "深度解析成分优势，满足成分党需求", signalSource: "成分关注",
  });
  if (ideas.length === 0) ideas.push({
    title: "「开局一对眼膜」内容拆解 + 评论区隐藏需求挖掘",
    angle: "hook", rationale: "从热门内容出发，提炼评论区最高频需求", signalSource: "通用",
  });
  return ideas;
}

export default function ContentLabPage() {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [taskId, setTaskId] = useState("");
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

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
        const signals = d.data?.signals ?? d.signals ?? [];
        setIdeas(generateIdeas(signals));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [taskId]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        <AutoAwesome sx={{ mr: 1, verticalAlign: "middle", color: "#147d6f" }} />
        内容实验室
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        基于评论信号AI生成内容选题，每个选题附带理由和数据来源
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

      {!loading && !error && taskId && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {ideas.map((idea, i) => (
            <Card key={i} variant="outlined" sx={{ transition: "0.2s", "&:hover": { borderColor: "#147d6f" } }}>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      {ANGLE_ICONS[idea.angle]}
                      <Chip label={ANGLE_LABELS[idea.angle]} size="small" color="primary" variant="outlined" />
                      <Chip label={idea.signalSource} size="small" />
                    </Box>
                    <Typography variant="h6" sx={{ mt: 1 }}>{idea.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      💡 {idea.rationale}
                    </Typography>
                  </Box>
                </Box>
                <Divider sx={{ my: 1.5 }} />
                <Button size="small" startIcon={<ContentCopy />}
                  onClick={() => { navigator.clipboard.writeText(idea.title); setCopied(idea.title); }}>
                  {copied === idea.title ? "已复制" : "复制选题"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
