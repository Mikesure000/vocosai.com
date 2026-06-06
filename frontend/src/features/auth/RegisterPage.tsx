import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Box, Card, CardContent, Typography, TextField, Button, Alert,
} from "@mui/material";
import { useAuth } from "../../shared/auth/AuthContext";

export default function RegisterPage() {
  const { register, isAuthenticated, isLoading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated && !isLoading) {
    return <Navigate to="/" replace />;
  }

  const validate = (): boolean => {
    if (!name.trim()) {
      setError("请输入姓名");
      return false;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("请输入有效的邮箱地址");
      return false;
    }
    if (!password.trim()) {
      setError("请输入密码");
      return false;
    }
    if (password.length < 8) {
      setError("密码长度至少 8 位");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!validate()) return;
    setSubmitting(true);
    try {
      await register({ name, email, password, teamName: teamName || undefined });
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) {
        setError("该邮箱已注册");
      } else {
        setError(err instanceof Error ? err.message : "注册失败");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        bgcolor: "#f5f5f5",
      }}
    >
      <Card sx={{ width: 400, maxWidth: "90vw" }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, textAlign: "center" }}>
            创建账号
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="姓名"
              required
              fullWidth
              margin="normal"
              value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              autoFocus
            />
            <TextField
              label="邮箱"
              type="email"
              required
              fullWidth
              margin="normal"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <TextField
              label="密码"
              type="password"
              required
              fullWidth
              margin="normal"
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              autoComplete="new-password"
              helperText="至少 8 位字符"
            />
            <TextField
              label="团队名称"
              fullWidth
              margin="normal"
              value={teamName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTeamName(e.target.value)}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={submitting}
              sx={{ mt: 2, py: 1.2 }}
            >
              {submitting ? "注册中..." : "注册"}
            </Button>
          </Box>

          <Typography variant="body2" sx={{ mt: 2, textAlign: "center" }}>
            <Link to="/login" style={{ color: "#147d6f", textDecoration: "none" }}>
              已有账号？返回登录
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
