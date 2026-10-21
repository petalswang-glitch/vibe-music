"use client";

import axios from "axios";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  apiClient,
  authStorageKey,
  getApi,
  postApi,
  setBrowserToken,
  type ApiResult,
} from "@/lib/api-client";
import { usePlayer } from "@/providers/player-provider";

export type UserInfo = {
  userId: number;
  username: string;
  email: string;
  phone: string | null;
  userAvatar: string | null;
  introduction: string | null;
};
type AuthContextValue = {
  user: UserInfo | null;
  ready: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<UserInfo>;
  clearSession: () => void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

function isUserQuery(query: { queryKey: readonly unknown[] }) {
  return ["song", "songs", "artist", "playlist", "favorite", "user"].includes(
    String(query.queryKey[0]),
  );
}

export function authError(
  error: unknown,
  fallback = "请求失败，请重试",
): string {
  if (axios.isAxiosError(error))
    return error.response?.data?.message ?? fallback;
  return error instanceof Error ? error.message : fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const queryClient = useQueryClient();
  const resetLikes = usePlayer((state) => state.resetLikes);

  function refreshIdentityQueries() {
    const predicate = isUserQuery;
    void queryClient.cancelQueries({ predicate }).then(() => {
      queryClient.removeQueries({ queryKey: ["favorite"] });
      void queryClient.invalidateQueries({ predicate });
    });
  }

  function forget() {
    revision.current++;
    setBrowserToken(null);
    try {
      localStorage.removeItem(authStorageKey);
    } catch {
      /* Optional persistence. */
    }
    setUser(null);
    resetLikes();
    refreshIdentityQueries();
  }

  useEffect(() => {
    let stopped = false;
    const controller = new AbortController();
    const current = ++revision.current;
    const expired = () => {
      if (stopped) return;
      revision.current++;
      setBrowserToken(null);
      try {
        localStorage.removeItem(authStorageKey);
      } catch {
        /* Optional persistence. */
      }
      setUser(null);
      setReady(true);
      setError("会话过期，请重新登录");
      resetLikes();
      void queryClient.cancelQueries({ predicate: isUserQuery }).then(() => {
        queryClient.removeQueries({ queryKey: ["favorite"] });
        void queryClient.invalidateQueries({ predicate: isUserQuery });
      });
    };
    window.addEventListener("vibe-auth-expired", expired);
    async function restore() {
      let token: string | null = null;
      try {
        token = localStorage.getItem(authStorageKey);
      } catch {
        /* Continue without storage. */
      }
      setBrowserToken(token);
      if (!token) {
        if (!stopped) setReady(true);
        return;
      }
      try {
        const profile = await getApi<UserInfo>(
          "/user/getUserInfo",
          controller.signal,
        );
        if (!stopped && current === revision.current) setUser(profile);
      } catch (cause) {
        if (!stopped && current === revision.current) {
          // Keep stored credentials for a reload/retry, but anonymous queries
          // must not send an unverified token under an anonymous cache key.
          setBrowserToken(null);
          setError(authError(cause, "暂时无法验证登录状态，请重新登录"));
        }
      } finally {
        if (!stopped) setReady(true);
      }
    }
    void restore();
    return () => {
      stopped = true;
      controller.abort();
      window.removeEventListener("vibe-auth-expired", expired);
    };
  }, [queryClient, resetLikes]);

  async function login(email: string, password: string) {
    const current = ++revision.current;
    setError(null);
    const token = await postApi<string>("/user/login", { email, password });
    if (current !== revision.current) return;
    try {
      // Verify the new token without publishing it to guest queries or Agent requests.
      const { data } = await apiClient.get<ApiResult<UserInfo>>(
        "/user/getUserInfo",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (data.code !== 0) throw new Error(data.message || "登录信息验证失败");
      const profile = data.data;
      if (current !== revision.current) return;
      setBrowserToken(token);
      try {
        localStorage.setItem(authStorageKey, token);
      } catch {
        /* Memory session still works. */
      }
      setUser(profile);
      setReady(true);
      refreshIdentityQueries();
    } catch (cause) {
      if (current === revision.current) forget();
      throw cause;
    }
  }

  async function logout() {
    setError(null);
    try {
      await apiClient.post("/user/logout").then(({ data }) => {
        if (data.code !== 0) throw new Error(data.message);
      });
    } catch (cause) {
      if (!axios.isAxiosError(cause) || cause.response?.status !== 401)
        throw cause;
    }
    forget();
  }

  async function refreshUser() {
    const current = revision.current;
    const profile = await getApi<UserInfo>("/user/getUserInfo");
    if (current !== revision.current)
      throw new Error("登录状态已变化，请重新操作");
    setUser(profile);
    refreshIdentityQueries();
    return profile;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        error,
        login,
        logout,
        refreshUser,
        clearSession: forget,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth requires AuthProvider");
  return value;
}
