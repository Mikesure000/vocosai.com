import { useEffect, useState } from "react";
import { Box, Card, CardContent, Typography, CircularProgress, TextField, Chip, Divider } from "@mui/material";
import { Business, TrendingUp, Campaign, Store } from "@mui/icons-material";
import { api, extractList } from "../../shared/services/api";

interface BrandProfile { name: string; industry: string; products: string[]; platforms: string[]; keyMessages: string[] }

const DEMO_BRAND: BrandProfile = {
  name: "克奥妮斯",
  industry: "新消费护肤抗衰",
  products: ["仙人掌透皮眼膜", "修护精华"],
  platforms: ["抖音", "小红书"],
  keyMessages: ["微晶透皮技术", "70根微晶", "28天见效", "38女神节"],
};

export default function BrandPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskId, setTaskId] = useState("");
  const [brand, setBrand] = useState<BrandProfile | null>(null);
  const [stats, setStats] = useState({ taskCount: 0, commentCount: 0, signalCount: 0 });

  useEffect(() => {
    api.listTasks().then((d: any) => {
      const list = extractList(d);
      setTasks(Array.isArray(list) ? list : []);
      if (list.length > 0) setTaskId(list[0].id);
    }).catch(() => {});
    api.listBrands().then((d: any) => {
      const brands = d?.data ?? d?.brands ?? d ?? [];
      if (brands.length > 0) {
        const b = brands[0];
        setBrand({ name: b.name ?? b.brandName ?? "默认品牌", industry: b.industry ?? "-", products: b.products ?? [], platforms: b.platforms ?? ["抖音"], keyMessages: b.keyMessages ?? [] });
      } else setBrand(DEMO_BRAND);
    }).catch(() => setBrand(DEMO_BRAND));
  }, []);

  useEffect(() => {
    if (!taskId) return;
    api.getCommentSignals(taskId).then((d: any) => {
      const signals = d.data?.signals ?? d.signals ?? [];
      setStats((s) => ({ ...s, taskCount: tasks.length, commentCount: d.data?.totalComments ?? d.totalComments ?? 0, signalCount: signals.length }));
    }).catch(() => {});
  }, [taskId]);

  if (!brand) return <CircularProgress sx={{ display: "block", mx: "auto", my: 8 }} />;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
        <Business sx={{ mr: 1, verticalAlign: "middle", color: "#147d6f" }} />
        品牌中心
      </Typography>

      <Card sx={{ mb: 3, borderTop: 4, borderColor: "#147d6f" }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>{brand.name}</Typography>
          <Chip label={brand.industry} color="primary" size="small" sx={{ mr: 1 }} />
          {brand.platforms.map((p) => <Chip key={p} label={p} variant="outlined" size="small" sx={{ mr: 0.5 }} />)}
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>核心产品</Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {brand.products.map((p) => <Chip key={p} icon={<Store />} label={p} />)}
          </Box>
          <Typography variant="subtitle2" sx={{ mt: 2 }} gutterBottom>关键信息点</Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {brand.keyMessages.map((m) => <Chip key={m} icon={<Campaign />} label={m} variant="outlined" />)}
          </Box>
        </CardContent>
      </Card>

      {tasks.length > 0 && (
        <TextField select label="选择任务查看数据" value={taskId} onChange={(e) => setTaskId(e.target.value)}
          sx={{ mb: 3, minWidth: 300 }}
          slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.taskName ?? t.id}</option>)}
        </TextField>
      )}

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {[
          { label: "分析任务数", value: stats.taskCount, icon: <TrendingUp /> },
          { label: "累计评论", value: stats.commentCount, icon: <Campaign /> },
          { label: "信号维度", value: stats.signalCount, icon: <Store /> },
        ].map((s) => (
          <Card key={s.label} sx={{ flex: "1 1 180px", minWidth: 160 }}>
            <CardContent sx={{ textAlign: "center" }}>
              <Box sx={{ color: "#147d6f", mb: 1 }}>{s.icon}</Box>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>{s.value}</Typography>
              <Typography variant="body2" color="text.secondary">{s.label}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
