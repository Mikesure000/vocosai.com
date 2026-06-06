import { useEffect, useState } from "react";
import { api } from "../../shared/services/api";
import { Box, Card, CardContent, Typography, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Button, Alert } from "@mui/material";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [schema, setSchema] = useState<any>(null);
  const [cost, setCost] = useState<any>(null);

  const refresh = () => {
    setLoading(true);
    setError("");
    Promise.all([
      api.health(), api.listTasks(), api.getSchema(),
      api.getCostSummary("?period=current_month").catch(() => null)
    ]).then(([h, t, s, c]) => {
      setHealth(h); setTasks(t?.data || []); setSchema(s); setCost(c);
    }).catch((err) => setError(err.message || "加载仪表板数据失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  if (loading) return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;

  const statusCounts = tasks.reduce((acc: any, t: any) => {
    acc[t.status] = (acc[t.status] || 0) + 1; return acc;
  }, {});

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>决策台</Typography>
          <Typography color="text.secondary">品牌内容智能分析工作站 v{health?.version || "0.2.0"}</Typography>
        </Box>
        <Button variant="outlined" onClick={refresh} size="small">刷新</Button>
      </Box>

      {/* P2-1: 错误提示 */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Quick stats */}
      <Box sx={{ display: "flex", gap: 3, mb: 3, flexWrap: "wrap" }}>
        {[
          ["任务总数", tasks.length, "#147d6f"],
          ["已完成", statusCounts.completed || 0, "#388e3c"],
          ["分析中", statusCounts.analyzing || 0, "#1976d2"],
          ["Agent 数", schema?.agents?.length || 17, "#7b1fa2"],
          ["月度成本", `$${(cost?.quota?.usedCost || 0).toFixed(2)}`, "#f57c00"],
          [tasks.length > 0 ? "存储引擎" : "就绪", health?.storeDriver || "SQLite", "#0288d1"],
        ].map(([label, value, color]) => (
          <Card key={label as string} sx={{ flex: "1 1 150px", minWidth: 140, borderTop: `3px solid ${color}` }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption" color="text.secondary">{label as string}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: color as string }}>{String(value)}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Tasks table */}
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>分析任务</Typography>
      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>任务</TableCell><TableCell>平台</TableCell><TableCell>品牌</TableCell><TableCell>状态</TableCell><TableCell>创建</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary" sx={{ mb: 1 }}>还没有分析任务</Typography>
                  <Button component="a" href="/signals" variant="outlined" size="small">去创建第一个任务</Button>
                </TableCell>
              </TableRow>
            ) : tasks.slice(-10).reverse().map((t: any) => (
              <TableRow key={t.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{t.taskName || t.contentTitle}</Typography>
                  <Typography variant="caption" color="text.secondary">{t.id?.slice(0, 20)}...</Typography>
                </TableCell>
                <TableCell>{t.platform}</TableCell>
                <TableCell>{t.brandInfo}</TableCell>
                <TableCell>
                  <Chip label={statusLabel(t.status)} size="small"
                    color={t.status === "completed" ? "success" : t.status === "analyzing" ? "info" : t.status === "failed" ? "error" : "default"} />
                </TableCell>
                <TableCell>{t.createdAt?.slice(0, 10)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    draft: "草稿", uploaded: "已上传", mapping_required: "需映射", ready: "就绪",
    analyzing: "分析中", completed: "已完成", failed: "失败", partially_failed: "部分失败"
  };
  return map[s] || s;
}
