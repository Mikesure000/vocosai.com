import { useEffect, useState } from "react";
import { api } from "../../shared/services/api";
import {
  Box, Card, CardContent, Typography, CircularProgress, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Alert,
} from "@mui/material";
import { Category, Lightbulb, Warning, People } from "@mui/icons-material";

export default function CategoryKnowledgePage() {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    api.listCategories().then((d: any) => {
      setCategories(d.data ?? d ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;

  const active = categories[tab];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        <Category sx={{ mr: 1, verticalAlign: "middle", color: "#147d6f" }} />
        品类知识库
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        美妆护肤 · 母婴健康 · 功效食品 三大品类的典型需求、购买障碍与人群画像
      </Typography>

      {categories.length === 0 ? (
        <Alert severity="info">暂无品类数据 — 请先初始化种子数据</Alert>
      ) : (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
            {categories.map((c: any) => (
              <Tab key={c.id} label={c.categoryName || c.id} />
            ))}
          </Tabs>

          {active && (
            <>
              <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
                <Chip icon={<Lightbulb />} label={`${active.needTaxonomy?.length || 0} 条典型需求`} color="primary" />
                <Chip icon={<Warning />} label={`${active.barrierTaxonomy?.length || 0} 条购买障碍`} color="warning" />
                <Chip icon={<People />} label={`${active.audienceSegments?.length || 0} 个人群画像`} color="success" />
                <Chip label={`竞品对标: ${active.competitorBenchmarks?.length || 0} 个`} variant="outlined" />
              </Box>

              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>典型需求分类</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>需求代码</TableCell>
                          <TableCell>需求名称</TableCell>
                          <TableCell>描述</TableCell>
                          <TableCell>紧急度</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {active.needTaxonomy?.map((n: any) => (
                          <TableRow key={n.code} hover>
                            <TableCell><Chip label={n.code} size="small" variant="outlined" /></TableCell>
                            <TableCell>{n.label}</TableCell>
                            <TableCell>{n.description}</TableCell>
                            <TableCell>
                              <Chip label={`Lv${n.severity}`} size="small"
                                color={n.severity >= 5 ? "error" : n.severity >= 3 ? "warning" : "info"} />
                            </TableCell>
                          </TableRow>
                        )) || null}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>

              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>购买障碍分类</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>障碍代码</TableCell>
                          <TableCell>障碍名称</TableCell>
                          <TableCell>描述</TableCell>
                          <TableCell>出现频率</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {active.barrierTaxonomy?.map((b: any) => (
                          <TableRow key={b.code} hover>
                            <TableCell><Chip label={b.code} size="small" variant="outlined" /></TableCell>
                            <TableCell>{b.label}</TableCell>
                            <TableCell>{b.description}</TableCell>
                            <TableCell>
                              <Chip label={b.frequency} size="small"
                                color={b.frequency === "HIGH" ? "error" : b.frequency === "MEDIUM" ? "warning" : "info"} />
                            </TableCell>
                          </TableRow>
                        )) || null}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>目标人群画像</Typography>
                  {active.audienceSegments?.map((s: any, i: number) => (
                    <Box key={i} sx={{ mb: 2 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{s.segment}</Typography>
                      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                        {s.traits?.map((t: string) => <Chip key={t} label={t} size="small" variant="outlined" />)}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                        痛点: {s.painPoints?.join(" · ")}
                      </Typography>
                    </Box>
                  )) || <Typography color="text.secondary">暂无数据</Typography>}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </Box>
  );
}
