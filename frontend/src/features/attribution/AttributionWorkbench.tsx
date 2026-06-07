import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../../shared/services/api";
import {
  Box, Typography, CircularProgress, Paper, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Alert, Button, LinearProgress, Tabs, Tab, Grid,
} from "@mui/material";

interface MatrixItem {
  contentPointId: string;
  contentPointText: string;
  reactionType: string;
  reactionCount: number;
  sentimentDistribution: { positive: number; negative: number; neutral: number };
  representativeComments: { text: string; likeCount: number }[];
  demandSignals: { demandCode: string; demandLabel: string; strength: number }[];
  barrierSignals: { barrierCode: string; barrierLabel: string; strength: string }[];
  impactScore: number;
  insightText: string;
}

export default function AttributionWorkbench() {
  const { taskId } = useParams<{ taskId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState(0);

  const load = () => {
    if (!taskId) return;
    setLoading(true);
    api.getAttribution(taskId).then((d: any) => {
      setData(d.data);
      setError("");
    }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  };

  const runAttribution = () => {
    if (!taskId) return;
    setRunning(true);
    api.runAttribution(taskId).then(() => {
      setTimeout(load, 1500);
    }).catch((e: Error) => setError(e.message)).finally(() => setRunning(false));
  };

  useEffect(() => { load(); }, [taskId]);

  if (loading) return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;

  const matrix = data?.result || data?.attributionMatrix || [];
  const gaps = data?.contentGaps || [];
  const rankings = data?.sellingPointRanking || [];
  const hasData = matrix.length > 0;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>归因工作台</Typography>
          <Typography color="text.secondary">
            内容-评论归因分析 · 理解用户为什么这样反应
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          {hasData && <Button variant="outlined" onClick={load} size="small">刷新</Button>}
          <Button
            variant="contained"
            onClick={runAttribution}
            disabled={running}
            size="small"
            sx={{ bgcolor: "#147d6f" }}
          >
            {running ? <CircularProgress size={18} sx={{ color: "white" }} /> : hasData ? "重新分析" : "运行归因分析"}
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!hasData && !running && (
        <Paper sx={{ p: 6, textAlign: "center" }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>尚未进行归因分析</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            归因分析将揭示内容的每个部分如何引发评论区的不同反应
          </Typography>
          <Button variant="contained" onClick={runAttribution} sx={{ bgcolor: "#147d6f" }}>
            开始归因分析
          </Button>
        </Paper>
      )}

      {hasData && (
        <>
          {/* Stats bar */}
          <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
            {[
              { label: "分析要点", value: matrix.length, color: "#147d6f" },
              { label: "内容缺口", value: gaps.length, color: "#ed6c02" },
              { label: "卖点排名", value: rankings.length, color: "#7b1fa2" },
              { label: "模型", value: data._metadata?.model || "deepseek", color: "#0288d1" },
            ].map(s => (
              <Card key={s.label} sx={{ flex: 1, minWidth: 120 }}>
                <CardContent sx={{ py: 1 }}>
                  <Typography variant="h5" sx={{ color: s.color, fontWeight: 700 }}>{s.value}</Typography>
                  <Typography variant="body2" color="text.secondary">{s.label}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="归因矩阵" />
            <Tab label={`内容缺口 (${gaps.length})`} />
            <Tab label="卖点效果排名" />
          </Tabs>

          {tab === 0 && <AttributionMatrix matrix={matrix} />}
          {tab === 1 && <ContentGaps gaps={gaps} />}
          {tab === 2 && <SellingPointRanking rankings={rankings} />}

          {/* Generate production card CTA */}
          <Box sx={{ mt: 3, textAlign: "center" }}>
            <Button
              component={Link}
              to={`/production-cards/${taskId}`}
              variant="contained"
              size="large"
              sx={{ bgcolor: "#147d6f" }}
            >
              基于归因结果生成生产卡 →
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}

// ===== Sub-components =====

function AttributionMatrix({ matrix }: { matrix: MatrixItem[] }) {
  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>内容要点</TableCell>
            <TableCell>反应类型</TableCell>
            <TableCell>评论数</TableCell>
            <TableCell>影响度</TableCell>
            <TableCell>情感分布</TableCell>
            <TableCell>归因洞察</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {matrix.map((m, i) => (
            <TableRow key={m.contentPointId || i} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {m.contentPointText?.slice(0, 40)}...
                </Typography>
              </TableCell>
              <TableCell>
                <Chip
                  label={ReactionLabel(m.reactionType)}
                  size="small"
                  color={m.reactionType === "negative" ? "error" : m.reactionType === "positive" ? "success" : "info"}
                />
              </TableCell>
              <TableCell>{m.reactionCount}</TableCell>
              <TableCell>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <LinearProgress variant="determinate" value={m.impactScore * 10}
                    color={m.impactScore >= 7 ? "error" : m.impactScore >= 4 ? "warning" : "success"}
                    sx={{ flex: 1, height: 6, borderRadius: 3 }} />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{m.impactScore}</Typography>
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                  <Chip label={`👍${m.sentimentDistribution.positive}`} size="small" color="success" />
                  <Chip label={`👎${m.sentimentDistribution.negative}`} size="small" color="error" />
                </Box>
              </TableCell>
              <TableCell>
                <Typography variant="caption" color="text.secondary">
                  {m.insightText?.slice(0, 60)}...
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ContentGaps({ gaps }: { gaps: { gapTopic: string; gapDescription: string; recommendedAction: string }[] }) {
  return (
    <Grid container spacing={2}>
      {gaps.map((g, i) => (
        <Grid item xs={12} md={6} key={i}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>{g.gapTopic}</Typography>
              <Typography variant="body2" color="text.secondary" paragraph>{g.gapDescription}</Typography>
              <Alert severity="info" variant="outlined">
                <Typography variant="caption">{g.recommendedAction}</Typography>
              </Alert>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

function SellingPointRanking({ rankings }: { rankings: { contentPointText: string; impactScore: number; verdict: string; positiveResonance: number; negativeCriticism: number }[] }) {
  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>排名</TableCell>
            <TableCell>卖点内容</TableCell>
            <TableCell>影响度</TableCell>
            <TableCell>正面共鸣</TableCell>
            <TableCell>负面质疑</TableCell>
            <TableCell>判定</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rankings.map((r, i) => (
            <TableRow key={i} hover>
              <TableCell>#{i + 1}</TableCell>
              <TableCell>
                <Typography variant="body2">{r.contentPointText?.slice(0, 40)}...</Typography>
              </TableCell>
              <TableCell>{r.impactScore}</TableCell>
              <TableCell><Chip label={r.positiveResonance} size="small" color="success" /></TableCell>
              <TableCell><Chip label={r.negativeCriticism} size="small" color="error" /></TableCell>
              <TableCell>
                <Chip
                  label={r.verdict === "high_potential" ? "高潜力" : r.verdict === "needs_optimization" ? "需优化" : "有问题"}
                  size="small"
                  color={r.verdict === "high_potential" ? "success" : r.verdict === "needs_optimization" ? "warning" : "error"}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ReactionLabel(type: string) {
  const map: Record<string, string> = { positive: "正面共鸣", negative: "质疑反驳", question: "追问好奇", action: "转化动作", mixed: "复合反应" };
  return map[type] || type;
}
