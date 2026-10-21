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
  adminGet,
  adminPost,
  adminStorageKey,
  setAdminToken,
} from "@/lib/admin-api";
import { authError } from "@/providers/auth-provider";

type Identity = { adminId: number; username: string };
type Context = {
  admin: Identity | null;
  ready: boolean;
  error: string | null;
  restore: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};
const AdminContext = createContext<Context | null>(null);
export function AdminProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const client = useQueryClient();
  function clear() {
    sequence.current++;
    setAdminToken(null);
    setAdmin(null);
    try {
      localStorage.removeItem(adminStorageKey);
    } catch {
      /* Optional persistence. */
    }
    // Cancellation starts synchronously; remove this session's cache now so a
    // delayed cleanup cannot delete the next administrator's fresh queries.
    void client.cancelQueries({ queryKey: ["admin"] });
    client.removeQueries({ queryKey: ["admin"] });
  }
  async function restore() {
    const current = ++sequence.current;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(adminStorageKey);
    } catch {
      /* Optional persistence. */
    }
    setAdminToken(saved);
    try {
      const identity = await (saved
        ? adminGet<Identity>("/admin/session")
        : Promise.resolve(null));
      if (sequence.current === current) {
        setAdmin(identity);
        setError(null);
      }
    } catch (cause) {
      if (sequence.current === current) {
        setAdminToken(null);
        setAdmin(null);
        setError(authError(cause, "暂时无法验证管理员登录状态"));
        if (
          axios.isAxiosError(cause) &&
          [401, 403].includes(cause.response?.status ?? 0)
        ) {
          try {
            localStorage.removeItem(adminStorageKey);
          } catch {
            /* Optional persistence. */
          }
        }
      }
    } finally {
      if (sequence.current === current) setReady(true);
    }
  }
  useEffect(() => {
    let disposed = false;
    const expired = () => {
      clear();
      setError("会话过期，请重新登录");
      setReady(true);
    };
    window.addEventListener("vibe-admin-expired", expired);
    // Restore browser storage after hydration; don't start if this mount was
    // already disposed (including development Strict Mode's probe mount).
    void Promise.resolve().then(() => {
      if (!disposed) return restore();
    });
    return () => {
      disposed = true;
      // Deliberately invalidate the latest generation on teardown.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      sequence.current++;
      setAdminToken(null);
      window.removeEventListener("vibe-admin-expired", expired);
    };
    // Lifecycle belongs to this mounted admin area; functions read stable refs/client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);
  async function login(username: string, password: string) {
    const current = ++sequence.current;
    setError(null);
    const value = await adminPost<string>("/admin/login", {
      username,
      password,
    });
    if (sequence.current !== current) return;
    setAdminToken(value);
    try {
      const identity = await adminGet<Identity>("/admin/session");
      if (sequence.current !== current) return;
      try {
        localStorage.setItem(adminStorageKey, value);
      } catch {
        /* Optional persistence. */
      }
      setAdmin(identity);
      setReady(true);
    } catch (cause) {
      if (sequence.current === current) setAdminToken(null);
      throw cause;
    }
  }
  async function logout() {
    const current = sequence.current;
    try {
      await adminPost("/admin/logout", null);
    } finally {
      if (sequence.current === current) clear();
    }
  }
  return (
    <AdminContext.Provider
      value={{
        admin,
        ready,
        error,
        restore: async () => {
          setReady(false);
          setError(null);
          await restore();
        },
        login,
        logout,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}
export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) throw new Error("useAdmin requires AdminProvider");
  return context;
}
