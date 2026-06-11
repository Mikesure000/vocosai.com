import { createContext, useContext, useReducer, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { setAccessToken, getAccessToken } from "../services/api";

interface UserInfo {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  avatarUrl?: string;
  phone?: string;
}

interface TeamInfo {
  id: string;
  name: string;
  inviteCode?: string;
}

interface AuthState {
  user: UserInfo | null;
  team: TeamInfo | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
}

type AuthAction =
  | { type: "LOGIN_SUCCESS"; user: UserInfo; team: TeamInfo | null; permissions: string[] }
  | { type: "RESTORE_SESSION"; user: UserInfo; team: TeamInfo | null; permissions: string[] }
  | { type: "LOGOUT" }
  | { type: "UPDATE_USER"; user: UserInfo }
  | { type: "SESSION_EXPIRED" };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "LOGIN_SUCCESS":
    case "RESTORE_SESSION":
      return {
        user: action.user,
        team: action.team,
        permissions: action.permissions,
        isAuthenticated: true,
        isLoading: false,
      };
    case "LOGOUT":
      return {
        user: null,
        team: null,
        permissions: [],
        isAuthenticated: false,
        isLoading: false,
      };
    case "UPDATE_USER":
      return { ...state, user: action.user, isLoading: false };
    case "SESSION_EXPIRED":
      return {
        user: null,
        team: null,
        permissions: [],
        isAuthenticated: false,
        isLoading: false,
      };
  }
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  teamName?: string;
}

interface AuthContextValue {
  user: UserInfo | null;
  team: TeamInfo | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  updateProfile: (data: Partial<UserInfo>) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  hasPermission: (p: string) => boolean;
  hasAllPermissions: (ps: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const initialState: AuthState = {
  user: null,
  team: null,
  permissions: [],
  isAuthenticated: false,
  isLoading: true,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error("refresh failed");
        const json = await res.json();
        const data = json.data;
        setAccessToken(data.accessToken);
        dispatch({
          type: "RESTORE_SESSION",
          user: data.user,
          team: data.team ?? null,
          permissions: data.permissions ?? [],
        });
      } catch {
        dispatch({ type: "SESSION_EXPIRED" });
      }
    })();
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("refresh failed");
      const json = await res.json();
      const data = json.data;
      setAccessToken(data.accessToken);
      dispatch({
        type: "RESTORE_SESSION",
        user: data.user,
        team: data.team ?? null,
        permissions: data.permissions ?? [],
      });
    } catch {
      setAccessToken(null);
      dispatch({ type: "SESSION_EXPIRED" });
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Login failed" }));
      throw new Error(err.message || "Login failed");
    }
    const json = await res.json();
    const data = json.data;
    setAccessToken(data.accessToken);
    dispatch({
      type: "LOGIN_SUCCESS",
      user: data.user,
      team: data.team ?? null,
      permissions: data.permissions ?? [],
    });
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Registration failed" }));
      const error = new Error(err.message || "Registration failed") as Error & { status?: number };
      error.status = res.status;
      throw error;
    }
    const json = await res.json();
    const resp = json.data;
    setAccessToken(resp.accessToken);
    dispatch({
      type: "LOGIN_SUCCESS",
      user: resp.user,
      team: resp.team ?? null,
      permissions: resp.permissions ?? [],
    });
  }, []);

  const logout = useCallback(async () => {
    const token = getAccessToken();
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
    } catch {
      // ignore network errors on logout
    }
    setAccessToken(null);
    dispatch({ type: "LOGOUT" });
  }, []);

  const updateProfile = useCallback(async (data: Partial<UserInfo>) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch("/api/auth/me", {
      method: "PUT",
      headers,
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Profile update failed" }));
      throw new Error(err.message || "Profile update failed");
    }
    const json = await res.json();
    dispatch({ type: "UPDATE_USER", user: json.data ?? json });
  }, []);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch("/api/auth/me/password", {
      method: "PUT",
      headers,
      credentials: "include",
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Password change failed" }));
      throw new Error(err.message || "Password change failed");
    }
  }, []);

  const hasPermission = useCallback(
    (p: string) => state.permissions.includes(p),
    [state.permissions],
  );

  const hasAllPermissions = useCallback(
    (ps: string[]) => ps.every((p) => state.permissions.includes(p)),
    [state.permissions],
  );

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        team: state.team,
        permissions: state.permissions,
        isAuthenticated: state.isAuthenticated,
        isLoading: state.isLoading,
        login,
        register,
        logout,
        refreshToken,
        updateProfile,
        changePassword,
        hasPermission,
        hasAllPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
