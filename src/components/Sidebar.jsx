import { useNavigate, useLocation } from 'react-router-dom'
import {
  Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Box, Typography, Divider
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import StorageIcon from '@mui/icons-material/Storage'
import SettingsIcon from '@mui/icons-material/Settings'

const DRAWER_WIDTH = 240

const NAV_ITEMS = [
  { label: '工作台', path: '/', icon: <DashboardIcon /> },
  { label: '评论分析', path: '/analysis', icon: <AnalyticsIcon /> },
  { label: '数据源', path: '/data-sources', icon: <StorageIcon /> },
  { label: '系统设置', path: '/settings', icon: <SettingsIcon /> }
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': { width: DRAWER_WIDTH, bgcolor: '#1a2332', color: '#fff' }
      }}
    >
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{
          width: 32, height: 32, borderRadius: 1.5,
          bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 16
        }}>V</Box>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
          VOCOS
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      <List sx={{ px: 1, mt: 1 }}>
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path
          return (
            <ListItemButton
              key={item.path}
              onClick={() => navigate(item.path)}
              selected={active}
              sx={{
                borderRadius: 2, mb: 0.5,
                color: active ? '#fff' : 'rgba(255,255,255,0.6)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                '&.Mui-selected': {
                  bgcolor: 'rgba(26,115,232,0.2)',
                  '&:hover': { bgcolor: 'rgba(26,115,232,0.3)' }
                }
              }}
            >
              <ListItemIcon sx={{
                minWidth: 36, color: active ? '#4b9aff' : 'rgba(255,255,255,0.5)'
              }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: active ? 600 : 400 }} />
            </ListItemButton>
          )
        })}
      </List>
    </Drawer>
  )
}

export { DRAWER_WIDTH }
