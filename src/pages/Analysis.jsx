import { useState } from 'react'
import {
  Box, Card, CardContent, Typography, Grid, TextField, Chip,
  Button, MenuItem, Stack, InputAdornment
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import FilterListIcon from '@mui/icons-material/FilterList'
import BarChartIcon from '@mui/icons-material/BarChart'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import SentimentDissatisfiedIcon from '@mui/icons-material/SentimentDissatisfied'
import LightbulbIcon from '@mui/icons-material/Lightbulb'

const PLATFORMS = ['全部平台', '抖音', '小红书', 'B站', '微信']
const SENTIMENTS = ['全部情感', '正面', '中性', '负面']

const SAMPLE_COMMENTS = [
  { content: '这个产品的质地真的很好，用了两周皮肤明显变好了', platform: '小红书', sentiment: '正面', likes: 238, date: '2026-05-28' },
  { content: '价格有点贵，性价比不如竞品', platform: '抖音', sentiment: '负面', likes: 86, date: '2026-05-27' },
  { content: '物流太慢了，等了五天还没到', platform: '抖音', sentiment: '负面', likes: 156, date: '2026-05-26' },
  { content: '整体还行吧，中规中矩的产品', platform: '小红书', sentiment: '中性', likes: 42, date: '2026-05-25' },
  { content: '包装设计很用心，送礼非常合适', platform: '微信', sentiment: '正面', likes: 312, date: '2026-05-24' }
]

const INSIGHTS = [
  { label: '高频关键词', value: '质地好、价格高、物流慢、包装精美', icon: <BarChartIcon /> },
  { label: '情感分布', value: '正面 45% · 中性 30% · 负面 25%', icon: <SentimentDissatisfiedIcon /> },
  { label: '推荐动作', value: '优化物流体验，突出产品质地卖点', icon: <LightbulbIcon /> }
]

export default function Analysis() {
  const [platform, setPlatform] = useState('全部平台')
  const [sentiment, setSentiment] = useState('全部情感')

  return (
    <Box>
      <Typography variant="h4" gutterBottom>评论分析</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        多维度分析消费者评论，发现核心洞察与机会点
      </Typography>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField select size="small" label="平台" value={platform} onChange={e => setPlatform(e.target.value)}
              sx={{ minWidth: 120 }}>
              {PLATFORMS.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="情感分类" value={sentiment} onChange={e => setSentiment(e.target.value)}
              sx={{ minWidth: 120 }}>
              {SENTIMENTS.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </TextField>
            <TextField size="small" placeholder="搜索评论内容…"
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              sx={{ minWidth: 200 }} />
            <Button variant="outlined" startIcon={<FilterListIcon />} size="small">高级筛选</Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Insights */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {INSIGHTS.map((insight, i) => (
          <Grid item xs={12} sm={4} key={i}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Box sx={{ color: 'primary.main', display: 'flex' }}>{insight.icon}</Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>{insight.label}</Typography>
                </Stack>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{insight.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Comments list */}
      <Typography variant="h6" sx={{ mb: 1.5 }}>评论列表</Typography>
      {SAMPLE_COMMENTS.map((c, i) => (
        <Card key={i} sx={{ mb: 1.5 }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body1" sx={{ mb: 1, lineHeight: 1.6 }}>{c.content}</Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip label={c.platform} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                  <Chip label={c.sentiment} size="small"
                    sx={{
                      height: 22, fontSize: '0.7rem',
                      bgcolor: c.sentiment === '正面' ? '#e8f5e9' : c.sentiment === '负面' ? '#ffebee' : '#f5f5f5',
                      color: c.sentiment === '正面' ? '#2e7d32' : c.sentiment === '负面' ? '#c62828' : '#757575'
                    }} />
                  <Typography variant="caption" color="text.secondary">{c.date}</Typography>
                </Stack>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 2, color: 'text.secondary', flexShrink: 0 }}>
                <ThumbUpIcon fontSize="small" />
                <Typography variant="caption">{c.likes}</Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  )
}
