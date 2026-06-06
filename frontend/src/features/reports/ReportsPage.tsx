import { useEffect, useState } from "react";
import { api } from "../../shared/services/api";
import { Box, Card, CardContent, Typography, CircularProgress, Alert } from "@mui/material";

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cost, setCost] = useState<any>(null);
  const [quality, setQuality] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      api.getCostSummary(),
      api.getQualitySummary(),
      api.health(),
    ]).then(([c, q, h]) => {
      setCost(c);
      setQuality(q);
      setHealth(h);
    }).catch((err) => setError(err.message || "加载报告数据失败"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ p: 4 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>报告中心</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        系统版本: {health?.version} · 存储: {health?.storeDriver} · 任务: {health?.tasks} · AI运行: {health?.aiRuns}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {cost && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6">成本概览</Typography>
            <Typography>月度配额: {cost?.quota?.monthlyQuota || 0} · 已使用: {cost?.quota?.usedCost || 0} · 使用率: {cost?.quota?.usagePercent || 0}%</Typography>
          </CardContent>
        </Card>
      )}

      {quality && (
        <Card>
          <CardContent>
            <Typography variant="h6">质量概览</Typography>
            <Typography variant="body2" color="text.secondary">
              成功率: {quality?.successRate || "—"}% · 平均延迟: {quality?.avgLatencyMs || "—"}ms
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
