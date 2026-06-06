import { Link } from "react-router-dom";
import { Box, Card, CardContent, Typography, Button } from "@mui/material";

export default function NotFoundPage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        bgcolor: "#f5f5f5",
      }}
    >
      <Card sx={{ width: 400, maxWidth: "90vw", textAlign: "center" }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h1" sx={{ fontWeight: 700, color: "primary.main", fontSize: "6rem" }}>
            404
          </Typography>
          <Typography variant="h5" sx={{ mb: 1 }}>
            页面未找到
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            您访问的页面不存在或已被移除
          </Typography>
          <Button variant="contained" component={Link} to="/" size="large">
            返回首页
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
