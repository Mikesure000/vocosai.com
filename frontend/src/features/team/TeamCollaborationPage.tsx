import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Typography, CircularProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, Alert, List, ListItem, Divider,
} from "@mui/material";
import { People, Assignment, CheckCircle, Cancel, Pending } from "@mui/icons-material";
import { api, getAccessToken } from "../../shared/services/api";

export default function TeamCollaborationPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any[]>([]);
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.getTeamStats(),
      api.listMyTasks(),
      api.listTasks(),
    ]).then(([s, mt, t]) => {
      setStats(s?.data || []);
      setMyTasks(mt?.data || []);
      setTasks(t?.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleApprove = (cardId: string) => {
    fetch(`/api/production-cards/${cardId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) },
      credentials: "include",
      body: JSON.stringify({ comment: "Approved" })
    }).then(() => load());
  };

  const handleReject = (cardId: string) => {
    const reason = prompt("请填写驳回原因:");
    if (!reason) return;
    fetch(`/api/production-cards/${cardId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}) },
      credentials: "include",
      body: JSON.stringify({ comment: reason })
    }).then(() => load());
  };

  if (loading) return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
        <People sx={{ mr: 1, verticalAlign: "middle", color: "#147d6f" }} />
        团队协作
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>任务分配 · 审批流 · 成员工作量</Typography>

      {/* Team Stats */}
      <Typography variant="h6" gutterBottom>成员工时概览</Typography>
      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>成员</TableCell><TableCell>角色</TableCell><TableCell>任务</TableCell>
              <TableCell>生产卡</TableCell><TableCell>待审批</TableCell><TableCell>已批准</TableCell>
              <TableCell>负载</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stats.map(m => (
              <TableRow key={m.userId} hover>
                <TableCell>{m.userName}</TableCell>
                <TableCell><Chip label={m.role} size="small" variant="outlined" /></TableCell>
                <TableCell>{m.taskCount}</TableCell>
                <TableCell>{m.cardCount}</TableCell>
                <TableCell>{m.pendingReviewCount}</TableCell>
                <TableCell>{m.approvedCount}</TableCell>
                <TableCell>
                  <Chip label={m.workload === "heavy" ? "繁重" : m.workload === "medium" ? "中等" : "轻松"}
                    size="small" color={m.workload === "heavy" ? "error" : m.workload === "medium" ? "warning" : "success"} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pending Reviews */}
      <Typography variant="h6" gutterBottom>
        <Pending sx={{ verticalAlign: "middle", mr: 1 }} />
        待审批生产卡 ({pendingReviews.length})
      </Typography>
      {pendingReviews.length === 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>暂无待审批的生产卡</Alert>
      ) : (
        <List>
          {pendingReviews.map((pr: any) => (
            <Card key={pr.card?.id} sx={{ mb: 1 }}>
              <CardContent sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box>
                  <Typography variant="subtitle1">{pr.card?.title || "无标题"}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    提交人: {pr.submittedBy} · 类型: {pr.card?.card_type}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button size="small" variant="contained" color="success"
                    onClick={() => handleApprove(pr.card?.id)} startIcon={<CheckCircle />}>通过</Button>
                  <Button size="small" variant="contained" color="error"
                    onClick={() => handleReject(pr.card?.id)} startIcon={<Cancel />}>驳回</Button>
                </Box>
              </CardContent>
            </Card>
          ))}
        </List>
      )}

      {/* My Tasks */}
      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
        <Assignment sx={{ verticalAlign: "middle", mr: 1 }} />
        我的任务 ({myTasks.length})
      </Typography>
      {myTasks.length === 0 ? (
        <Alert severity="info">暂无分配给你的任务</Alert>
      ) : myTasks.map((mt: any) => (
        <Card key={mt.assignment?.id} sx={{ mb: 1 }}>
          <CardContent>
            <Typography variant="subtitle1">{mt.task?.taskName || "未命名任务"}</Typography>
            <Box sx={{ display: "flex", gap: 1, mt: 0.5 }}>
              <Chip label={`状态: ${mt.task?.status || "—"}`} size="small"
                color={mt.task?.status === "completed" ? "success" : "default"} />
              <Chip label={`分配人: ${mt.assignment?.assignorName || "—"}`} size="small" variant="outlined" />
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
