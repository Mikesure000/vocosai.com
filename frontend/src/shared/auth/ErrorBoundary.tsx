import React from "react";
import { Box, Typography, Button } from "@mui/material";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h4" gutterBottom>页面出错了</Typography>
          <Typography sx={{ color: "text.secondary", mb: 2 }}>
            {this.state.error?.message || "未知错误"}
          </Typography>
          <Button
            variant="contained"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.href = "/";
            }}
          >
            返回首页
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
