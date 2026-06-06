import { Link } from "react-router-dom";
import { Box, Typography, Button } from "@mui/material";

export default function ForbiddenPage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        bgcolor: "#f5f5f5",
        gap: 2,
      }}
    >
      <Typography variant="h1" sx={{ fontWeight: 700, color: "#147d6f", fontSize: "6rem" }}>
        403
      </Typography>
      <Typography variant="h6" color="text.secondary">
        您没有权限访问此页面
      </Typography>
      <Button component={Link} to="/" variant="outlined" sx={{ mt: 1 }}>
        返回首页
      </Button>
    </Box>
  );
}
