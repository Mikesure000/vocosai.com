import { useEffect, useState } from "react";
import { api } from "../../shared/services/api";
import { Box, Card, CardContent, Typography, CircularProgress, Chip } from "@mui/material";

export default function StrategyPage() {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [schemas, setSchemas] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([api.getSchema(), api.listModelRoutes(), api.listAiSchemas()])
      .then(([s, r, sc]) => { setAgents(s?.agents || []); setRoutes(r?.data || []); setSchemas(sc?.data || []); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ p: 4 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>策略卡 & Agent 配置</Typography>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>AI Agent 列表</Typography>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
        {agents.map((a: any) => (
          <Card key={a.id} sx={{ flex: "1 1 280px", maxWidth: 380 }}>
            <CardContent>
              <Typography variant="h6">{a.name}</Typography>
              <Chip label={a.code} size="small" sx={{ mr: 1 }} />
              <Chip label={`v${a.version}`} size="small" color="primary" />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Schema: {a.outputSchemaId}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>模型路由</Typography>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3 }}>
        {routes.slice(0, 6).map((r: any) => (
          <Card key={r.agentId} sx={{ flex: "1 1 280px", maxWidth: 380 }}>
            <CardContent>
              <Typography variant="subtitle2">{r.agentName}</Typography>
              <Chip label={`${r.providerName} / ${r.primaryModel}`} size="small" color="success" sx={{ mr: 1 }} />
              <Chip label={`fallback: ${r.fallbackProviderName}`} size="small" variant="outlined" />
              <Typography variant="body2" sx={{ mt: 1 }}>重试: {r.maxRetries} | 超时: {r.timeoutSeconds}s | 成本上限: ${r.costLimit}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Typography variant="h5" gutterBottom sx={{ mt: 3 }}>Schema 定义</Typography>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {schemas.slice(0, 8).map((s: any) => (
          <Card key={s.id} sx={{ flex: "1 1 200px" }}>
            <CardContent>
              <Typography variant="subtitle2" noWrap>{s.name}</Typography>
              <Chip label={s.status} size="small" color={s.status === "active" ? "success" : "default"} />
              <Typography variant="body2" color="text.secondary">{s.requiredCount} 必填 / {s.propertyCount} 字段</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
