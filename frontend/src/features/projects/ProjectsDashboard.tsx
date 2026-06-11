import { useEffect, useState } from "react";
import { api, extractList } from "../../shared/services/api";
import {
  Box, Card, CardContent, Typography, CircularProgress,
  Chip, LinearProgress, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow,
} from "@mui/material";
import { Dashboard, TrendingUp, Assessment, AutoAwesome } from "@mui/icons-material";

export default function ProjectsDashboard() {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.listCategories(),
      api.listBrands(),
      api.listTasks(),
    ]).then(([cats, brandsResp, tasksResp]) => {
      setCategories(extractList(cats));
      setBrands(extractList(brandsResp));
      setJobs(extractList(tasksResp));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;

  const statusCounts = jobs.reduce((acc: any, j: any) => {
    acc[j.status] = (acc[j.status] || 0) + 1; return acc;
  }, {});

  const activeJobs = jobs.filter(j => j.status !== "archived");
  const completedRate = jobs.length > 0 ? Math.round((statusCounts.completed || 0) / jobs.length * 100) : 0;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            <Dashboard sx={{ mr: 1, verticalAlign: "middle", color: "#147d6f" }} />
            项目中心
          </Typography>
          <Typography color="text.secondary">跨品牌、跨品类、跨项目的全局视图</Typography>
        </Box>
        <Chip
          label={`${categories.length} 品类 · ${brands.length} 品牌 · ${activeJobs.length} 活跃任务`}
          color="primary" variant="outlined"
        />
      </Box>

      {/* Stats overview */}
      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        {[
          { label: "总任务数", value: jobs.length, color: "#147d6f", icon: <Assessment /> },
          { label: "已完成", value: statusCounts.completed || 0, color: "#2e7d32", icon: <TrendingUp /> },
          { label: "分析中", value: statusCounts.analyzing || 0, color: "#1976d2", icon: <AutoAwesome /> },
          { label: "完成率", value: `${completedRate}%`, color: "#ed6c02", icon: <TrendingUp /> },
        ].map(s => (
          <Card key={s.label} sx={{ flex: 1, minWidth: 160 }}>
            <CardContent sx={{ textAlign: "center" }}>
              <Box sx={{ color: s.color, mb: 0.5 }}>{s.icon}</Box>
              <Typography variant="h4" sx={{ fontWeight: 700, color: s.color }}>{s.value}</Typography>
              <Typography variant="body2" color="text.secondary">{s.label}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {/* Brands overview */}
        <Box sx={{ flex: "1 1 400px", minWidth: 300 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>品牌概览</Typography>
              {brands.length === 0 ? (
                <Typography color="text.secondary">暂无品牌数据</Typography>
              ) : (
                brands.slice(0, 5).map((b: any) => (
                  <Box key={b.id} sx={{ mb: 1.5 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{b.brandName || b.name}</Typography>
                      <Chip label={b.industry || "—"} size="small" variant="outlined" />
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, (jobs.filter(j => j.brandInfo?.includes(b.brandName)) || []).length * 20)}
                      color="primary" sx={{ height: 4, borderRadius: 2 }}
                    />
                  </Box>
                ))
              )}
            </CardContent>
          </Card>
        </Box>

        {/* Category overview */}
        <Box sx={{ flex: "1 1 400px", minWidth: 300 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>品类概览</Typography>
              {categories.length === 0 ? (
                <Typography color="text.secondary">暂无品类数据</Typography>
              ) : (
                categories.slice(0, 5).map((c: any) => (
                  <Box key={c.id} sx={{ mb: 1.5 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.categoryName}</Typography>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <Chip label={`${c.needTaxonomy?.length || 0} 需求`} size="small" color="primary" />
                        <Chip label={`${c.barrierTaxonomy?.length || 0} 障碍`} size="small" color="warning" />
                      </Box>
                    </Box>
                  </Box>
                ))
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Task timeline */}
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>最近任务流</Typography>
          {activeJobs.length === 0 ? (
            <Typography color="text.secondary">暂无活跃任务 — 前往评论信号池创建第一个分析任务</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>任务</TableCell>
                    <TableCell>平台</TableCell>
                    <TableCell>品牌</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>进度</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeJobs.slice(-10).reverse().map((j: any) => (
                    <TableRow key={j.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{j.taskName || j.id?.slice(0, 12)}</Typography>
                      </TableCell>
                      <TableCell>{j.platform || "—"}</TableCell>
                      <TableCell>{j.brandInfo || "—"}</TableCell>
                      <TableCell>
                        <Chip label={StatusLabel(j.status)} size="small"
                          color={j.status === "completed" ? "success" : j.status === "analyzing" ? "info" : "default"} />
                      </TableCell>
                      <TableCell>
                        <LinearProgress variant="determinate"
                          value={j.status === "completed" ? 100 : j.status === "analyzing" ? 50 : j.status === "ready" ? 25 : 10}
                          color={j.status === "completed" ? "success" : "primary"}
                          sx={{ height: 4, borderRadius: 2, minWidth: 80 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

function StatusLabel(s: string) {
  const map: Record<string, string> = {
    draft: "草稿", uploaded: "已上传", mapping_required: "需映射",
    ready: "就绪", analyzing: "分析中", completed: "已完成",
    failed: "失败", partially_failed: "部分失败"
  };
  return map[s] || s;
}
