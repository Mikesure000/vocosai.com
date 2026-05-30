import {
  Box, Card, CardContent, Typography, Grid, Button, Chip,
  Stack, LinearProgress, Avatar, IconButton
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import MoreVertIcon from '@mui/icons-material/MoreVert'

const PLATFORMS = [
  {
    name: '抖音', color: '#1a1a1a', icon: '🎵', status: '已连接',
    stats: { comments: '6,842', lastSync: '10分钟前', tasks: 3 }
  },
  {
    name: '小红书', color: '#ff2442', icon: '📕', status: '已连接',
    stats: { comments: '3,215', lastSync: '1小时前', tasks: 1 }
  },
  {
    name: 'B站', color: '#00a1d6', icon: '📺', status: '配置中',
    stats: { comments: '0', lastSync: '未同步', tasks: 0 }
  },
  {
    name: '微信', color: '#07c160', icon: '💬', status: '未配置',
    stats: { comments: '0', lastSync: '未同步', tasks: 0 }
  }
]

export default function DataSources() {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>数据源</Typography>
          <Typography variant="body2" color="text.secondary">
            管理各平台数据接入，一键采集消费者评论
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />}>
          接入新平台
        </Button>
      </Box>

      <Grid container spacing={2.5}>
        {PLATFORMS.map((p, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Card sx={{
              height: '100%',
              borderColor: p.status === '已连接' ? `${p.color}40` : 'divider',
              position: 'relative',
              opacity: p.status === '未配置' ? 0.6 : 1
            }}>
              <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Avatar sx={{ bgcolor: `${p.color}15`, color: p.color, width: 44, height: 44, fontSize: '1.3rem' }}>
                    {p.icon}
                  </Avatar>
                  <IconButton size="small"><MoreVertIcon fontSize="small" /></IconButton>
                </Box>

                <Typography variant="h6" sx={{ mb: 0.5 }}>{p.name}</Typography>

                <Chip label={p.status} size="small"
                  sx={{
                    height: 22, fontSize: '0.7rem', fontWeight: 500, mb: 2,
                    bgcolor: p.status === '已连接' ? '#e8f5e9' : p.status === '配置中' ? '#fff3e0' : '#f5f5f5',
                    color: p.status === '已连接' ? '#2e7d32' : p.status === '配置中' ? '#e65100' : '#9e9e9e'
                  }} />

                <Stack spacing={1}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">采集评论</Typography>
                    <Typography variant="caption" fontWeight={600}>{p.stats.comments}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">最近同步</Typography>
                    <Typography variant="caption" fontWeight={500}>{p.stats.lastSync}</Typography>
                  </Box>
                  {p.stats.tasks > 0 && (
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">运行任务</Typography>
                        <Typography variant="caption" fontWeight={600}>{p.stats.tasks}</Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={60} sx={{ height: 4, borderRadius: 2 }} />
                    </Box>
                  )}
                </Stack>

                {p.status === '已连接' && (
                  <Button fullWidth variant="outlined" size="small" startIcon={<RefreshIcon />}
                    sx={{ mt: 2, textTransform: 'none', fontSize: '0.8rem' }}>
                    立即采集
                  </Button>
                )}
                {p.status === '未配置' && (
                  <Button fullWidth variant="outlined" size="small"
                    sx={{ mt: 2, textTransform: 'none', fontSize: '0.8rem' }}>
                    配置接入
                  </Button>
                )}
                {p.status === '配置中' && (
                  <Button fullWidth variant="outlined" size="small" disabled
                    sx={{ mt: 2, textTransform: 'none', fontSize: '0.8rem' }}>
                    配置中…
                  </Button>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Quick add section */}
      <Card sx={{ mt: 3, borderStyle: 'dashed' }}>
        <CardContent sx={{ p: 3, '&:last-child': { pb: 3 }, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            当前支持 4 个平台，即将支持更多数据源
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
            {['淘宝/天猫', '京东', '拼多多', '美团'].map((name, i) => (
              <Chip key={i} label={name} variant="outlined" size="small"
                sx={{ opacity: 0.5, cursor: 'pointer', '&:hover': { opacity: 1 } }} />
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
