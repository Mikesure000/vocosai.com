import { useEffect, useState } from "react";
import { api } from "../../shared/services/api";
import { Box, Card, CardContent, Typography, CircularProgress, Chip, Button } from "@mui/material";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#1976d2", "#388e3c", "#f57c00", "#d32f2f", "#7b1fa2", "#0288d1", "#689f38", "#ffa000", "#c2185b", "#0097a7"];

export default function DemandsPage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [signalData, setSignalData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.listTasks().then(d => {
      if (cancelled) return;
      const items = d?.data || [];
      setTasks(items);
      if (items.length > 0) loadSignals(items[items.length - 1].id);
      else setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const loadSignals = async (taskId: string) => {
    setLoading(true);
    try {
      const s = await api.getCommentSignals(taskId);
      setSelected(s);
      const signals = s?.signals || s?.data?.signals || [];
      setSignalData(signals.map((s: any) => ({ name: s.label || s.key, 数量: s.count || 0 })));
      setPieData(signals.map((s: any) => ({ name: s.label || s.key, value: s.count || 0 })));
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) return <Box sx={{ p: 4 }}><CircularProgress /></Box>;
  if (!selected) return (
    <Box sx={{ p: 4, textAlign: "center" }}>
      <Typography color="text.secondary" sx={{ mb: 2 }}>暂无数据</Typography>
      <Button variant="outlined" href="/signals">创建任务</Button>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>用户需求地图</Typography>
      <Box sx={{ mb: 2, display: "flex", gap: 1, flexWrap: "wrap" }}>
        {tasks.map(t => (
          <Chip key={t.id} label={t.taskName || t.id?.slice(0,8)} onClick={() => loadSignals(t.id)} color="primary" variant="outlined" />
        ))}
      </Box>

      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", mb: 3 }}>
        <Card sx={{ flex: "1 1 400px", minWidth: 300 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Top 障碍信号</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={signalData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" /><YAxis /><Tooltip />
                <Bar dataKey="数量" fill="#1976d2" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card sx={{ flex: "1 1 400px", minWidth: 300 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>信号分布</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Box>

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {(selected?.topBarriers || selected?.data?.topBarriers || []).map((b: any) => (
          <Card key={b.key} sx={{ flex: "1 1 200px" }}>
            <CardContent>
              <Typography variant="h6">{b.label}</Typography>
              <Typography variant="h4" color="error">{b.count}</Typography>
              <Typography variant="body2" color="text.secondary">{b.description}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
