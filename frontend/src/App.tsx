import { BrowserRouter, Routes, Route, Link, useLocation, Outlet } from "react-router-dom";
import {
  AppBar, Box, CssBaseline, Drawer, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, Toolbar,
  Typography, ThemeProvider, createTheme,
} from "@mui/material";
import {
  Dashboard as DashboardIcon, TrendingUp as SignalsIcon,
  Map as DemandsIcon, Lightbulb as StrategyIcon,
  Description as ReportsIcon, WarningAmber as ObstaclesIcon,
  CompareArrows as CompetitorIcon, AutoAwesome as ContentLabIcon,
  Psychology as AiCenterIcon, Replay as AttributionIcon,
  Business as BrandIcon, Assessment as BenchmarkIcon, People as PeopleIcon, Category as CategoryIcon,
} from "@mui/icons-material";
import AuthGuard from "./shared/auth/AuthGuard";
import ErrorBoundary from "./shared/auth/ErrorBoundary";
import { useAuth } from "./shared/auth/AuthContext";
import DashboardPage from "./features/dashboard/DashboardPage";
import SignalsPage from "./features/signals/SignalsPage";
import DemandsPage from "./features/demands/DemandsPage";
import StrategyPage from "./features/strategy/StrategyPage";
import ReportsPage from "./features/reports/ReportsPage";
import ObstaclesPage from "./features/obstacles/ObstaclesPage";
import CompetitorPage from "./features/competitor/CompetitorPage";
import ContentLabPage from "./features/content-lab/ContentLabPage";
import AiCenterPage from "./features/ai-center/AiCenterPage";
import AttributionPage from "./features/attribution/AttributionPage";
import AttributionWorkbench from "./features/attribution/AttributionWorkbench";
import ProductionCardsPage from "./features/production-cards/ProductionCardsPage";
import ProjectsDashboard from "./features/projects/ProjectsDashboard";
import TeamCollaborationPage from "./features/team/TeamCollaborationPage";
import PlatformMethodologyPage from "./features/methodology/PlatformMethodologyPage";
import CategoryKnowledgePage from "./features/category/CategoryKnowledgePage";
import BrandPage from "./features/brand/BrandPage";
import BenchmarkPage from "./features/benchmark/BenchmarkPage";
import LoginPage from "./features/auth/LoginPage";
import RegisterPage from "./features/auth/RegisterPage";
import ForbiddenPage from "./features/auth/ForbiddenPage";
import NotFoundPage from "./features/auth/NotFoundPage";

const drawerWidth = 240;

const theme = createTheme({
  palette: {
    primary: { main: "#147d6f" },
    mode: "light",
  },
});

const menuItems = [
  { text: "决策台",       icon: <DashboardIcon />,   path: "/",            permission: null as string | null },
  { text: "评论信号池",   icon: <SignalsIcon />,      path: "/signals",     permission: "task.read" },
  { text: "需求地图",     icon: <DemandsIcon />,      path: "/demands",     permission: "task.read" },
  { text: "购买障碍",     icon: <ObstaclesIcon />,    path: "/obstacles",   permission: "task.read" },
  { text: "竞品机会",     icon: <CompetitorIcon />,   path: "/competitor",  permission: "task.read" },
  { text: "项目中心",     icon: <DashboardIcon />,   path: "/projects",     permission: "task.read" },
  { text: "内容实验室",   icon: <ContentLabIcon />,   path: "/content-lab", permission: "task.read" },
  { text: "策略 & Agent", icon: <StrategyIcon />,     path: "/strategy",    permission: "schema.read" },
  { text: "AI 分析中心",  icon: <AiCenterIcon />,     path: "/ai-center",   permission: "ai_run.read" },
  { text: "复盘归因",     icon: <AttributionIcon />,  path: "/attribution", permission: "task.read" },
  { text: "内容生产卡",   icon: <ContentLabIcon />,   path: "/production-cards", permission: "task.read" },
  { text: "品牌中心",     icon: <BrandIcon />,        path: "/brand",       permission: null },
  { text: "对标中心",     icon: <BenchmarkIcon />,    path: "/benchmark",   permission: null },
  { text: "平台方法论",   icon: <DemandsIcon />,       path: "/methodology", permission: "task.read" },
  { text: "品类知识库",   icon: <CategoryIcon />,       path: "/category",    permission: "task.read" },
  { text: "团队协作",     icon: <PeopleIcon />,        path: "/team",         permission: "task.read" },
  { text: "报告中心",     icon: <ReportsIcon />,      path: "/reports",     permission: "report.read" },
];

function SidebarNav() {
  const location = useLocation();
  const { hasPermission } = useAuth();

  const visibleItems = menuItems.filter(
    (item) => !item.permission || hasPermission(item.permission),
  );

  return (
    <List>
      {visibleItems.map((item) => (
        <ListItem key={item.text} disablePadding>
          <ListItemButton
            component={Link}
            to={item.path}
            selected={location.pathname === item.path}
            sx={{
              "&.Mui-selected": {
                bgcolor: "rgba(20,125,111,0.08)",
                borderRight: "3px solid",
                borderColor: "primary.main",
              }
            }}
          >
            <ListItemIcon sx={{ color: location.pathname === item.path ? "primary.main" : undefined }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText primary={item.text} sx={{ "& .MuiListItemText-primary": { fontWeight: location.pathname === item.path ? 600 : 400 } }} />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}

function MainLayout() {
  return (
    <Box sx={{ display: "flex" }}>
      <AppBar position="fixed" sx={{ zIndex: 1201, bgcolor: "#101614" }}>
        <Toolbar>
          <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
            VOCOS <Typography component="span" variant="body2" sx={{ opacity: 0.5, ml: 1 }}>Voice of Consumer OS</Typography>
          </Typography>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          "& .MuiDrawer-paper": { width: drawerWidth, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <SidebarNav />
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, width: `calc(100% - ${drawerWidth}px)` }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="/" element={<AuthGuard><MainLayout /></AuthGuard>}>
            <Route index element={<DashboardPage />} />
            <Route path="signals" element={<SignalsPage />} />
            <Route path="demands" element={<DemandsPage />} />
            <Route path="obstacles" element={<ObstaclesPage />} />
            <Route path="competitor" element={<CompetitorPage />} />
            <Route path="content-lab" element={<ContentLabPage />} />
            <Route path="ai-center" element={<AiCenterPage />} />
            <Route path="attribution" element={<AttributionPage />} />
            <Route path="attribution/:taskId" element={<AttributionWorkbench />} />
            <Route path="production-cards" element={<ProductionCardsPage />} />
            <Route path="production-cards/:taskId" element={<ProductionCardsPage />} />
            <Route path="methodology" element={<PlatformMethodologyPage />} />
            <Route path="category" element={<CategoryKnowledgePage />} />
            <Route path="team" element={<TeamCollaborationPage />} />
            <Route path="brand" element={<BrandPage />} />
            <Route path="benchmark" element={<BenchmarkPage />} />
            <Route path="strategy" element={
              <AuthGuard requiredPermissions={["schema.read"]}><StrategyPage /></AuthGuard>
            } />
            <Route path="reports" element={<ReportsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </ThemeProvider>
  );
}
