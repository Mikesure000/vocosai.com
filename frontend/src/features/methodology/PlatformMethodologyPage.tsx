import { useEffect, useState } from "react";
import { api, extractList } from "../../shared/services/api";
import {
  Box, Card, CardContent, Typography, CircularProgress, Tabs, Tab,
  Alert, List, ListItem, Divider, Chip,
} from "@mui/material";
import { PlayCircle, AutoStories } from "@mui/icons-material";

interface BestPractice { rule: string; explanation: string; example: string }
interface ForbiddenPattern { pattern: string; reason: string; consequence: string }
interface Method { id: string; platform: string; bestPractice: BestPractice[]; forbiddenPatterns: ForbiddenPattern[]; recommendedFormats: any[] }

export default function PlatformMethodologyPage() {
  const [methods, setMethods] = useState<Method[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    api.listPlatformMethods().then((d: any) => {
      const list = extractList(d);
      setMethods(list);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;

  const douyin = methods.find(m => m.platform === "douyin");
  const xhs = methods.find(m => m.platform === "xiaohongshu");
  const active = tab === 0 ? douyin : xhs;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>平台方法论库</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        抖音/小红书内容创作最佳实践 · 基于真实内容团队经验沉淀
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab icon={<PlayCircle />} label="抖音" />
        <Tab icon={<AutoStories />} label="小红书" />
      </Tabs>

      {!active && <Alert severity="info">暂无{tab === 0 ? "抖音" : "小红书"}方法论数据</Alert>}

      {active && (
        <>
          {/* Best Practices */}
          <Typography variant="h6" gutterBottom>最佳实践</Typography>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
            {active.bestPractice?.map((bp, i) => (
              <Card key={i} sx={{ flex: "1 1 360px", minWidth: 300 }}>
                <CardContent>
                  <Chip label={`#${i + 1}`} size="small" color="primary" sx={{ mb: 1 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{bp.rule}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{bp.explanation}</Typography>
                  <Alert severity="info" variant="outlined" sx={{ fontSize: "0.8rem" }}>
                    "{(bp.example || "").slice(0, 80)}..."
                  </Alert>
                </CardContent>
              </Card>
            ))}
          </Box>

          {/* Forbidden Patterns */}
          <Typography variant="h6" gutterBottom>平台避坑</Typography>
          <TableList rows={active.forbiddenPatterns?.map(fp => ({
            label: fp.pattern, detail: `${fp.reason} → ${fp.consequence}`
          })) || []} />

          {/* Recommended Formats */}
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>推荐格式</Typography>
          {active.recommendedFormats?.map((rf: any, i: number) => (
            <Card key={i} sx={{ mb: 1 }}>
              <CardContent>
                <Chip label={rf.format} size="small" color="secondary" sx={{ mr: 1 }} />
                <Chip label={rf.whenToUse} size="small" variant="outlined" />
                <Typography variant="body2" sx={{ mt: 1 }}>{rf.spec}</Typography>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </Box>
  );
}

function TableList({ rows }: { rows: { label: string; detail: string }[] }) {
  return (
    <List>
      {rows.map((r, i) => (
        <ListItem key={i} sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.label}</Typography>
          <Typography variant="caption" color="text.secondary">{r.detail}</Typography>
          {i < rows.length - 1 && <Divider sx={{ width: "100%", mt: 1 }} />}
        </ListItem>
      ))}
    </List>
  );
}
