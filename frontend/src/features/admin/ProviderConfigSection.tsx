import { useEffect, useState, useCallback } from "react";
import {
  Box, Card, CardContent, Typography, CircularProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, TextField, Alert, IconButton, Tooltip,
} from "@mui/material";
import {
  CheckCircle, Cancel, VpnKey, Delete as DeleteIcon,
  CloudSync as TestIcon, Save as SaveIcon,
} from "@mui/icons-material";
import { api } from "../../shared/services/api";

interface ProviderStatus {
  providerName: string;
  baseUrl: string;
  configured: boolean;
  source: string;
  keyMasked: string | null;
  keyUpdatedAt: string | null;
  defaultModel: string;
  reasoningModel: string;
  priority: number;
}

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  openai: "ChatGPT (OpenAI)",
  qwen: "千问 (Qwen)",
};

export default function ProviderConfigSection() {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  const load = useCallback(() => {
    setLoading(true);
    api.listModelProviders()
      .then((providersData) => {
        const gateway = providersData?.data?.providers || providersData?.providers || [];
        setProviders(Array.isArray(gateway) ? gateway : []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveKey = (providerName: string) => {
    const apiKey = apiKeyInputs[providerName];
    if (!apiKey) return;
    setError("");
    setSuccess("");
    api.upsertProviderKey(providerName, apiKey)
      .then(() => {
        setSuccess(`${PROVIDER_LABELS[providerName] || providerName} 密钥已保存`);
        setApiKeyInputs((prev) => ({ ...prev, [providerName]: "" }));
        load();
      })
      .catch((e) => setError(e.message));
  };

  const deleteKey = (providerName: string) => {
    setError("");
    setSuccess("");
    api.deleteProviderKey(providerName)
      .then(() => {
        setSuccess(`${PROVIDER_LABELS[providerName] || providerName} 密钥已删除`);
        load();
      })
      .catch((e) => setError(e.message));
  };

  const testConnection = (providerName: string) => {
    setTestingProvider(providerName);
    setTestResult((prev) => {
      const next = { ...prev };
      delete next[providerName];
      return next;
    });
    api.testProvider(providerName)
      .then((result) => {
        const test = result?.data?.test || result?.test;
        setTestResult((prev) => ({
          ...prev,
          [providerName]: {
            ok: test?.ok ?? test?.status === "connected",
            message: test?.ok
              ? `连接成功 (${test.latencyMs ?? 0}ms)`
              : test?.errorMessage ?? "连接失败",
          },
        }));
      })
      .catch((e) => {
        setTestResult((prev) => ({
          ...prev,
          [providerName]: { ok: false, message: e.message },
        }));
      })
      .finally(() => setTestingProvider(null));
  };

  if (loading) {
    return (
      <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
          <VpnKey sx={{ mr: 1, verticalAlign: "middle", color: "#147d6f" }} />
          AI 提供商配置
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          管理 AI 模型提供商的 API 密钥和连接状态
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>
            {success}
          </Alert>
        )}

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>提供商</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Base URL</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>默认模型</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>配置状态</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>密钥信息</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>更新时间</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {providers.map((provider) => {
                const label = PROVIDER_LABELS[provider.providerName] || provider.providerName;
                const isConfigured = provider.configured;
                const testInfo = testResult[provider.providerName];

                return (
                  <TableRow key={provider.providerName} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {label}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: "0.75rem", wordBreak: "break-all" }}>
                        {provider.baseUrl}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {provider.defaultModel}
                      </Typography>
                      {provider.reasoningModel && provider.reasoningModel !== provider.defaultModel && (
                        <Box component="span" sx={{ display: "block", typography: "caption", color: "text.secondary" }}>
                          推理: {provider.reasoningModel}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={isConfigured ? <CheckCircle /> : <Cancel />}
                        label={isConfigured ? "已配置" : "未配置"}
                        size="small"
                        color={isConfigured ? "success" : "default"}
                        variant={isConfigured ? "filled" : "outlined"}
                      />
                    </TableCell>
                    <TableCell>
                      {isConfigured ? (
                        <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                          {provider.keyMasked || "****"}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {provider.keyUpdatedAt
                          ? new Date(provider.keyUpdatedAt).toLocaleString("zh-CN")
                          : "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {isConfigured ? (
                          <>
                            <Tooltip title="删除密钥">
                              <IconButton
                                size="small"
                                color="warning"
                                onClick={() => deleteKey(provider.providerName)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="测试连接">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => testConnection(provider.providerName)}
                                disabled={testingProvider === provider.providerName}
                              >
                                {testingProvider === provider.providerName ? (
                                  <CircularProgress size={16} />
                                ) : (
                                  <TestIcon fontSize="small" />
                                )}
                              </IconButton>
                            </Tooltip>
                          </>
                        ) : (
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <TextField
                              size="small"
                              type="password"
                              placeholder="API Key"
                              value={apiKeyInputs[provider.providerName] || ""}
                              onChange={(e) =>
                                setApiKeyInputs((prev) => ({
                                  ...prev,
                                  [provider.providerName]: e.target.value,
                                }))
                              }
                              sx={{ minWidth: 180 }}
                            />
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<SaveIcon />}
                              onClick={() => saveKey(provider.providerName)}
                              disabled={!apiKeyInputs[provider.providerName]}
                            >
                              保存
                            </Button>
                          </Box>
                        )}
                        {testInfo && (
                          <Chip
                            label={testInfo.message}
                            size="small"
                            color={testInfo.ok ? "success" : "error"}
                            variant="outlined"
                            sx={{ maxWidth: 200 }}
                          />
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
}
