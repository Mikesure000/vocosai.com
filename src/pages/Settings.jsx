import { useState } from 'react'
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Divider, Switch, FormControlLabel, Stack, Alert, Chip, IconButton
} from '@mui/material'
import KeyIcon from '@mui/icons-material/Key'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import PaletteIcon from '@mui/icons-material/Palette'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'

export default function Settings() {
  const [apiKey, setApiKey] = useState('sk-xxxxxxxxxxxxxxxxxxxx')
  const [model, setModel] = useState('deepseek-chat')
  const [autoSync, setAutoSync] = useState(true)
  const [dailyReport, setDailyReport] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard?.writeText('VOS-INT-2026-001')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>系统设置</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        配置 AI 模型、账号信息与首选项
      </Typography>

      <Stack spacing={2.5}>
        {/* AI Model Config */}
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <SmartToyIcon color="primary" />
              <Typography variant="h6">AI 模型配置</Typography>
            </Box>
            <Stack spacing={2}>
              <TextField label="API Key" type="password" size="small" fullWidth
                value={apiKey} onChange={e => setApiKey(e.target.value)}
                helperText="支持 OpenAI 兼容格式的 API Key" />
              <TextField label="模型名称" size="small" fullWidth
                value={model} onChange={e => setModel(e.target.value)}
                helperText="推荐 DeepSeek / 通义千问 / OpenAI" />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="contained">测试连接</Button>
                <Button variant="outlined">保存配置</Button>
              </Box>
              <Alert severity="info" sx={{ fontSize: '0.85rem' }}>
                当前配置使用 DeepSeek 模型，如 API 不可用时自动降级为关键词引擎分析
              </Alert>
            </Stack>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <KeyIcon color="primary" />
              <Typography variant="h6">账号信息</Typography>
            </Box>
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">用户 ID</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" fontWeight={600}>VOS-INT-2026-001</Typography>
                  <IconButton size="small" onClick={handleCopy}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                  {copied && <Chip label="已复制" size="small" color="success" sx={{ height: 22, fontSize: '0.7rem' }} />}
                </Box>
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">账号等级</Typography>
                <Chip label="内测版" size="small" color="primary" variant="outlined" />
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">数据配额</Typography>
                <Typography variant="body2" fontWeight={600}>12,847 / 50,000 条</Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <PaletteIcon color="primary" />
              <Typography variant="h6">偏好设置</Typography>
            </Box>
            <Stack spacing={1.5}>
              <FormControlLabel control={<Switch checked={autoSync} onChange={e => setAutoSync(e.target.checked)} />}
                label={<Box><Typography variant="body2">自动同步</Typography><Typography variant="caption" color="text.secondary">定时自动拉取各平台最新评论</Typography></Box>} />
              <Divider />
              <FormControlLabel control={<Switch checked={dailyReport} onChange={e => setDailyReport(e.target.checked)} />}
                label={<Box><Typography variant="body2">日报推送</Typography><Typography variant="caption" color="text.secondary">每日早晨推送前一日分析报告</Typography></Box>} />
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  )
}
