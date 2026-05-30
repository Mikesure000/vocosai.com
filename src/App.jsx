import { Routes, Route, Link } from 'react-router-dom'
import { AppBar, Toolbar, Typography, Container, Box, Button } from '@mui/material'

function Home() {
  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Typography variant="h3" gutterBottom>
        欢迎使用 VOCOS
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Voice of Consumer OS — 消费者评论分析智能工作台
      </Typography>
      <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
        <Button variant="contained" component={Link} to="/about">
          了解更多
        </Button>
      </Box>
    </Container>
  )
}

function About() {
  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>关于 VOCOS</Typography>
      <Typography variant="body1">
        将抖音、小红书、B站、微信的消费者评论转化为品牌与 Agency 的内容投放策略。
      </Typography>
    </Container>
  )
}

export default function App() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            VOCOS
          </Typography>
          <Button color="inherit" component={Link} to="/">首页</Button>
          <Button color="inherit" component={Link} to="/about">关于</Button>
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </Box>
    </Box>
  )
}
