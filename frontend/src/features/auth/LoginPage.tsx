import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Box, Card, CardContent, Typography, TextField, Button, Alert,
} from "@mui/material";
import { useAuth } from "../../shared/auth/AuthContext";

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated && !isLoading) {
    return <Navigate to="/" replace />;
  }

  const validate = (): boolean => {
    if (!email.trim() || !email.includes("@")) {
      setError("请输入有效的邮箱地址");
      return false;
    }
    if (!password.trim()) {
      setError("请输入密码");
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
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登录失败");
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
            VOCOS 登录
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="邮箱"
              type="email"
              fullWidth
              margin="normal"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
            <TextField
              label="密码"
              type="password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={submitting}
              sx={{ mt: 2, py: 1.2 }}
            >
              {submitting ? "登录中..." : "登录"}
            </Button>
          </Box>

          <Typography variant="body2" sx={{ mt: 2, textAlign: "center" }}>
            <Link to="/register" style={{ color: "#147d6f", textDecoration: "none" }}>
              还没有账号？立即注册
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
