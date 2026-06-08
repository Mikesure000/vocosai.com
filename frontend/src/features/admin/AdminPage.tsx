import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Typography, CircularProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, TextField, Alert,
} from "@mui/material";
import { AdminPanelSettings, PersonAdd, Edit, Block } from "@mui/icons-material";
import { api } from "../../shared/services/api";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "member" });

  const load = () => {
    setLoading(true);
    fetch("/api/admin/users").then(r => r.json()).then(d => {
      const list = Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : [];
      setUsers(list);
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const addUser = () => {
    fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser)
    }).then(r => r.json()).then(() => {
      setShowAdd(false);
      setNewUser({ name: "", email: "", password: "", role: "member" });
      load();
    }).catch(e => setError(e.message));
  };

  const updateStatus = (id: string, status: string) => {
    fetch(`/api/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    }).then(() => load()).catch(e => setError(e.message));
  };

  const updateRole = (id: string, role: string) => {
    fetch(`/api/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role })
    }).then(() => load()).catch(e => setError(e.message));
  };

  if (loading) return <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            <AdminPanelSettings sx={{ mr: 1, verticalAlign: "middle", color: "#147d6f" }} />
            系统管理
          </Typography>
          <Typography color="text.secondary">用户管理 · 角色权限 · 系统配置</Typography>
        </Box>
        <Button variant="contained" startIcon={<PersonAdd />} onClick={() => setShowAdd(!showAdd)}>
          添加用户
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {/* Add User Form */}
      {showAdd && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>新建用户</Typography>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField label="姓名" size="small" value={newUser.name}
                onChange={e => setNewUser({ ...newUser, name: e.target.value })} />
              <TextField label="邮箱" size="small" type="email" value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
              <TextField label="密码" size="small" type="password" value={newUser.password}
                onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
              <TextField select label="角色" size="small" value={newUser.role}
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                slotProps={{ select: { native: true } }}>
                <option value="super_admin">超级管理员</option>
                <option value="team_admin">团队管理员</option>
                <option value="ai_engineer_admin">AI工程师</option>
                <option value="member">普通成员</option>
              </TextField>
              <Button variant="contained" onClick={addUser} disabled={!newUser.email || !newUser.password}>
                创建
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Users Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>姓名</TableCell>
              <TableCell>邮箱</TableCell>
              <TableCell>角色</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id} hover>
                <TableCell>{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <TextField select size="small" value={u.role} sx={{ minWidth: 140 }}
                    onChange={e => updateRole(u.id, e.target.value)}
                    slotProps={{ select: { native: true } }}>
                    <option value="super_admin">超级管理员</option>
                    <option value="team_admin">团队管理员</option>
                    <option value="ai_engineer_admin">AI工程师</option>
                    <option value="member">普通成员</option>
                  </TextField>
                </TableCell>
                <TableCell>
                  <Chip label={u.status === "active" ? "正常" : "已禁用"} size="small"
                    color={u.status === "active" ? "success" : "default"} />
                </TableCell>
                <TableCell>
                  <Button size="small" variant="outlined"
                    color={u.status === "active" ? "warning" : "success"}
                    onClick={() => updateStatus(u.id, u.status === "active" ? "disabled" : "active")}
                    startIcon={u.status === "active" ? <Block /> : <Edit />}>
                    {u.status === "active" ? "禁用" : "启用"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
