import {
  Box, Grid, Card, CardContent, Typography,
  List, ListItem, ListItemText, ListItemAvatar, Avatar, Chip
} from '@mui/material'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import CommentIcon from '@mui/icons-material/Comment'
import StorageIcon from '@mui/icons-material/Storage'
import AutoGraphIcon from '@mui/icons-material/AutoGraph'

const STATS = [
  { label: '采集评论数', value: '12,847', change: '+23%', icon: <CommentIcon />, color: '#1a73e8' },
  { label: '分析批次', value: '47', change: '+12%', icon: <AutoGraphIcon />, color: '#7c4dff' },
  { label: '数据源', value: '4', label2: '个平台已接入', icon: <StorageIcon />, color: '#00b894' },
  { label: '洞察策略', value: '186', change: '+18%', icon: <TrendingUpIcon />, color: '#f0932b' }
]

const RECENT_TASKS = [
  { title: '抖音美妆评论采集', platform: '抖音', time: '10分钟前', status: '完成' },
  { title: '618大促投放分析', platform: '小红书', time: '1小时前', status: '完成' },
  { title: '竞品口碑监控', platform: '抖音', time: '3小时前', status: '处理中' },
  { title: 'B站品牌声量报告', platform: 'B站', time: '5小时前', status: '待处理' }
]

function StatCard({ label, value, change, icon, color, label2 }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Avatar sx={{ bgcolor: `${color}15`, color, width: 40, height: 40 }}>
            {icon}
          </Avatar>
          {change && (
            <Chip label={change} size="small" color="success" variant="outlined"
              sx={{ height: 22, fontSize: '0.75rem', fontWeight: 600, color: '#00b894', borderColor: '#00b894' }} />
          )}
        </Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>{value}</Typography>
        <Typography variant="body2" color="text.secondary">
          {label2 || label}
        </Typography>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>工作台</Typography>
        <Typography variant="body2" color="text.secondary">
          消费者评论分析智能工作台，助你将社媒评论转化为投放策略
        </Typography>
      </Box>

      {/* Stats */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {STATS.map((s, i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <StatCard {...s} />
          </Grid>
        ))}
      </Grid>

      {/* Main content area */}
      <Grid container spacing={2.5}>
        {/* Platform activity */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Typography variant="h6" gutterBottom>平台监控概览</Typography>
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                {[
                  { name: '抖音', color: '#1a1a1a', count: '6,842', desc: '条评论待分析' },
                  { name: '小红书', color: '#ff2442', count: '3,215', desc: '条评论待分析' },
                  { name: 'B站', color: '#00a1d6', count: '1,890', desc: '条评论待分析' },
                  { name: '微信', color: '#07c160', count: '900', desc: '条评论待分析' }
                ].map((p, i) => (
                  <Grid item xs={6} key={i}>
                    <Box sx={{
                      p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider',
                      display: 'flex', alignItems: 'center', gap: 1.5
                    }}>
                      <Box sx={{
                        width: 10, height: 10, borderRadius: '50%', bgcolor: p.color, flexShrink: 0
                      }} />
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          <strong>{p.count}</strong> {p.desc}
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent tasks */}
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Typography variant="h6" gutterBottom>最近任务</Typography>
              <List dense disablePadding>
                {RECENT_TASKS.map((t, i) => (
                  <ListItem key={i} sx={{ px: 0, borderBottom: i < RECENT_TASKS.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                    <ListItemAvatar sx={{ minWidth: 40 }}>
                      <Avatar sx={{ width: 28, height: 28, fontSize: '0.65rem', bgcolor: t.status === '完成' ? '#e8f5e9' : t.status === '处理中' ? '#fff3e0' : '#f5f5f5', color: t.status === '完成' ? '#2e7d32' : t.status === '处理中' ? '#e65100' : '#757575' }}>
                        {t.status === '完成' ? '✓' : t.status === '处理中' ? '⟳' : '…'}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={t.title}
                      secondary={`${t.platform} · ${t.time}`}
                      primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 500 }}
                      secondaryTypographyProps={{ fontSize: '0.75rem' }}
                    />
                    <Chip label={t.status} size="small"
                      sx={{
                        height: 22, fontSize: '0.7rem', fontWeight: 500,
                        bgcolor: t.status === '完成' ? '#e8f5e9' : t.status === '处理中' ? '#fff3e0' : '#f5f5f5',
                        color: t.status === '完成' ? '#2e7d32' : t.status === '处理中' ? '#e65100' : '#757575'
                      }} />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
