import { Box, AppBar, Toolbar, Typography, IconButton, Avatar, Chip, Tooltip } from '@mui/material'
import NotificationsIcon from '@mui/icons-material/NotificationsOutlined'
import Sidebar, { DRAWER_WIDTH } from './Sidebar'
import { Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />

      {/* Main content area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', ml: `${DRAWER_WIDTH}px` }}>
        {/* Top bar */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            color: 'text.primary'
          }}
        >
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
              Voice of Consumer OS
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Tooltip title="通知">
                <IconButton size="small"><NotificationsIcon /></IconButton>
              </Tooltip>
              <Chip
                label="内测版"
                size="small"
                color="primary"
                variant="outlined"
                sx={{ height: 24, fontSize: '0.75rem' }}
              />
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.85rem' }}>
                薛
              </Avatar>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Page content */}
        <Box component="main" sx={{ flex: 1, p: 3, bgcolor: 'background.default' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}
