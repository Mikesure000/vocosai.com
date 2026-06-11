import { useEffect, useState } from "react";
import { api } from "../../shared/services/api";
import {
  Box, Card, CardContent, Typography, CircularProgress, Alert, Button, Chip, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
} from "@mui/material";
import { Download } from "@mui/icons-material";

const EXPORT_FORMATS = [
  { key: "markdown", label: "Markdown", ext: ".md" },
  { key: "html", label: "HTML", ext: ".html" },
  { key: "json", label: "JSON", ext: ".json" },
];

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cost, setCost] = useState<any>(null);
  const [quality, setQuality] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    Promise.all([
      api.getCostSummary(),
      api.getQualitySummary(),
      api.health(),
      api.listTasks(),
    ]).then(([c, q, h, t]) => {
      setCost(c); setQuality(q); setHealth(h);
      setTasks(t?.data || []);
    }).catch((err) => setError(err.message || "加载报告数据失败"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ p: 4 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>报告中心</Typography>
          <Typography color="text.secondary">
            系统版本: {health?.version || "—"} · 存储: {health?.storeDriver || "—"} · 任务: {health?.tasks || 0} · AI运行: {health?.aiRuns || 0}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          {EXPORT_FORMATS.map(f => (
            <Button key={f.key} variant="outlined" size="small" startIcon={<Download />}
              onClick={() => downloadAsFormat(f.key)}>
              {f.label}
            </Button>
          ))}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        {cost && (
          <Card sx={{ flex: 1, minWidth: 200 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>成本概览</Typography>
              <Typography variant="body2">月度配额: {cost?.quota?.monthlyQuota || 0}</Typography>
              <Typography variant="body2">已使用: {cost?.quota?.usedCost || 0}</Typography>
              <Chip label={`使用率 ${cost?.quota?.usagePercent || 0}%`} size="small" color="primary" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        )}
        {quality && (
          <Card sx={{ flex: 1, minWidth: 200 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>质量概览</Typography>
              <Typography variant="body2">成功率: {quality?.successRate || "—"}%</Typography>
              <Typography variant="body2">平均延迟: {quality?.avgLatencyMs || "—"}ms</Typography>
              <Chip label={`${(quality?.successRate || 0) > 90 ? "健康" : "需关注"}`} size="small"
                color={quality?.successRate > 90 ? "success" : "warning"} sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        )}
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`分析任务 (${tasks.length})`} />
        <Tab label="导出格式" />
      </Tabs>

      {tab === 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>任务</TableCell>
                <TableCell>平台</TableCell>
                <TableCell>状态</TableCell>
                <TableCell>创建时间</TableCell>
                <TableCell>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">暂无分析任务</TableCell>
                </TableRow>
              ) : tasks.slice(-10).reverse().map((t: any) => (
                <TableRow key={t.id} hover>
                  <TableCell>{t.taskName || t.contentTitle || t.id?.slice(0, 12)}</TableCell>
                  <TableCell>{t.platform || "—"}</TableCell>
                  <TableCell>
                    <Chip label={t.status || "draft"} size="small"
                      color={t.status === "completed" ? "success" : t.status === "analyzing" ? "info" : "default"} />
                  </TableCell>
                  <TableCell>{t.createdAt?.slice(0, 10)}</TableCell>
                  <TableCell>
                    <Button size="small" href={`/reports?download&taskId=${t.id}`}>下载</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 1 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>导出格式说明</Typography>
            {EXPORT_FORMATS.map(f => (
              <Box key={f.key} sx={{ mb: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <Typography variant="body1">{f.label} 格式</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {f.key === "markdown" ? "适合编辑复用和飞书/Notion粘贴" :
                     f.key === "html" ? "浏览器直接预览" : "程序化处理和二次分析"}
                  </Typography>
                </Box>
                <Button size="small" startIcon={<Download />} onClick={() => downloadAsFormat(f.key)}>
                  导出{f.ext}
                </Button>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

function downloadAsFormat(format: string) {
  const data = JSON.stringify({ summary: "Vocos Report", exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([data], { type: format === "html" ? "text/html" : "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vocos-report-${Date.now()}.${format === "markdown" ? "md" : format}`;
  a.click();
  URL.revokeObjectURL(url);
}
