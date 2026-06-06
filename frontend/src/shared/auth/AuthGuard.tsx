import { Navigate } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "./AuthContext";

interface AuthGuardProps {
  children: React.ReactNode;
  requiredPermissions?: string[];
}

export default function AuthGuard({ children, requiredPermissions }: AuthGuardProps) {
  const { isAuthenticated, isLoading, hasAllPermissions } = useAuth();

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredPermissions && !hasAllPermissions(requiredPermissions)) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}
