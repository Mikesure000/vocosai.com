import { useEffect, useState, useRef, useCallback } from "react";
import {
  Box, Card, CardContent, Typography, CircularProgress,
  List, ListItemButton, ListItemText, ListItemIcon,
  TextField, Button, IconButton, Divider, Chip, Select, MenuItem,
  FormControl, InputLabel, Paper, Alert,
} from "@mui/material";
import {
  Chat as ChatIcon, Send as SendIcon, Delete as DeleteIcon,
  Add as AddIcon, SmartToy as AiIcon, Person as UserIcon,
} from "@mui/icons-material";
import { api, extractList } from "../../shared/services/api";
import { useAuth } from "../../shared/auth/AuthContext";

interface ChatSession {
  id: string;
  title: string | null;
  providerName: string | null;
  modelName: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  providerName: string | null;
  modelName: string | null;
  createdAt: string;
}

const PROVIDER_OPTIONS = [
  { value: "auto", label: "Auto (自动)" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "qwen", label: "千问 (Qwen)" },
  { value: "openai", label: "ChatGPT" },
];

export default function AiChatPage() {
  const { hasPermission } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadSessions = useCallback(() => {
    setLoading(true);
    api.listChatSessions()
      .then((result) => {
        const data = result?.data || result;
        const sessionList = data?.sessions || extractList(data) || [];
        setSessions(Array.isArray(sessionList) ? sessionList : []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadMessages = useCallback((sessionId: string) => {
    api.getChatMessages(sessionId)
      .then((result) => {
        const data = result?.data || result;
        const msgList = data?.messages || extractList(data) || [];
        setMessages(Array.isArray(msgList) ? msgList : []);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      loadMessages(currentSessionId);
    } else {
      setMessages([]);
    }
  }, [currentSessionId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    const content = inputText.trim();
    if (!content || sending) return;

    setSending(true);
    setError("");
    api.sendChatMessage(content, selectedProvider !== "auto" ? selectedProvider : undefined, currentSessionId || undefined)
      .then((result) => {
        const data = result?.data || result;
        const session = data?.session;
        const userMsg = data?.userMessage;
        const assistantMsg = data?.assistantMessage;

        if (session) {
          setCurrentSessionId(session.id);
          // Refresh sessions list
          loadSessions();
        }

        if (userMsg && assistantMsg) {
          setMessages((prev) => [...prev, userMsg, assistantMsg]);
        } else if (currentSessionId) {
          loadMessages(currentSessionId);
        }

        setInputText("");
        inputRef.current?.focus();
      })
      .catch((e) => setError(e.message))
      .finally(() => setSending(false));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInputText("");
  };

  const deleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    api.deleteChatSession(sessionId)
      .then(() => {
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null);
          setMessages([]);
        }
        loadSessions();
      })
      .catch((err) => setError(err.message));
  };

  if (!hasPermission("ai_run.read")) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">您没有权限访问 AI 聊天功能</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", height: "calc(100vh - 128px)", gap: 2 }}>
      {/* 左侧面板 - 会话列表 */}
      <Card sx={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 }, flex: 1, display: "flex", flexDirection: "column" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              会话列表
            </Typography>
            <IconButton size="small" color="primary" onClick={startNewChat} title="新建会话">
              <AddIcon fontSize="small" />
            </IconButton>
          </Box>
          <Divider sx={{ mb: 1 }} />
          <List sx={{ flex: 1, overflow: "auto", py: 0 }}>
            {loading && sessions.length === 0 ? (
              <Box sx={{ p: 2, textAlign: "center" }}>
                <CircularProgress size={24} />
              </Box>
            ) : sessions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
                暂无会话，发送消息开始聊天
              </Typography>
            ) : (
              sessions.map((session) => (
                <ListItemButton
                  key={session.id}
                  selected={currentSessionId === session.id}
                  onClick={() => setCurrentSessionId(session.id)}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    "&.Mui-selected": {
                      bgcolor: "rgba(20,125,111,0.08)",
                      borderRight: "3px solid",
                      borderColor: "primary.main",
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <ChatIcon fontSize="small" color={currentSessionId === session.id ? "primary" : "inherit"} />
                  </ListItemIcon>
                  <ListItemText
                    primary={session.title || "新对话"}
                    secondary={`${session.messageCount || 0} 条消息`}
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => deleteSession(session.id, e)}
                    sx={{ ml: 0.5 }}
                  >
                    <DeleteIcon fontSize="small" sx={{ fontSize: 14 }} />
                  </IconButton>
                </ListItemButton>
              ))
            )}
          </List>
        </CardContent>
      </Card>

      {/* 右侧面板 - 消息 + 输入 */}
      <Card sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* 顶部：提供商选择器 */}
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "center", gap: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            <AiIcon sx={{ mr: 0.5, verticalAlign: "middle", color: "#147d6f" }} />
            AI 聊天
          </Typography>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>提供商</InputLabel>
            <Select
              value={selectedProvider}
              label="提供商"
              onChange={(e) => setSelectedProvider(e.target.value)}
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {currentSessionId && (
            <Chip
              label="新对话"
              size="small"
              variant="outlined"
              onClick={startNewChat}
              icon={<AddIcon />}
            />
          )}
        </Box>

        {/* 消息列表 */}
        <Box sx={{ flex: 1, overflow: "auto", p: 2, bgcolor: "#f8f9fa" }}>
          {messages.length === 0 ? (
            <Box sx={{ textAlign: "center", pt: 8 }}>
              <AiIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                开始对话
              </Typography>
              <Typography variant="body2" color="text.disabled">
                输入您的问题，AI 将为您提供解答
              </Typography>
            </Box>
          ) : (
            messages.map((msg) => (
              <Box
                key={msg.id}
                sx={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  mb: 2,
                }}
              >
                <Paper
                  elevation={0}
                  sx={{
                    maxWidth: "75%",
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: msg.role === "user" ? "primary.main" : "white",
                    color: msg.role === "user" ? "white" : "text.primary",
                    border: msg.role === "assistant" ? "1px solid" : "none",
                    borderColor: "divider",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                    {msg.role === "assistant" ? (
                      <AiIcon sx={{ fontSize: 16, color: "#147d6f" }} />
                    ) : (
                      <UserIcon sx={{ fontSize: 16 }} />
                    )}
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {msg.role === "user" ? "你" : "AI"}
                    </Typography>
                    {msg.providerName && msg.role === "assistant" && (
                      <Chip
                        label={msg.providerName}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: "0.65rem", ml: 0.5 }}
                      />
                    )}
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      lineHeight: 1.6,
                    }}
                  >
                    {msg.content}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      mt: 0.5,
                      opacity: 0.6,
                      textAlign: "right",
                    }}
                  >
                    {new Date(msg.createdAt).toLocaleTimeString("zh-CN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Typography>
                </Paper>
              </Box>
            ))
          )}
          <div ref={messagesEndRef} />
        </Box>

        {/* 输入框 */}
        {error && (
          <Alert severity="error" sx={{ mx: 2, mb: 1 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        <Box sx={{ p: 2, borderTop: 1, borderColor: "divider", display: "flex", gap: 1 }}>
          <TextField
            inputRef={inputRef}
            fullWidth
            multiline
            maxRows={4}
            placeholder="输入消息..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            size="small"
          />
          <Button
            variant="contained"
            onClick={sendMessage}
            disabled={!inputText.trim() || sending}
            sx={{ minWidth: 80 }}
            endIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
          >
            {sending ? "发送中" : "发送"}
          </Button>
        </Box>
      </Card>
    </Box>
  );
}
