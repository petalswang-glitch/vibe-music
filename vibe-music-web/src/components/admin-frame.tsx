"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  LoaderCircle,
  LogOut,
  MessageSquare,
  Moon,
  Sun,
  Users,
  MicVocal,
  Music2,
  ListMusic,
  Images,
  LayoutDashboard,
} from "lucide-react";
import { useAdmin } from "@/providers/admin-provider";
import { authError } from "@/providers/auth-provider";

export function AdminFrame({ children }: { children: ReactNode }) {
  const { admin, ready, error, restore, login, logout } = useAdmin();
  const [dark, setDark] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const path = usePathname();
  const router = useRouter();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await login(username, password);
      setPassword("");
      if (path === "/admin/login") router.replace("/admin");
    } catch (cause) {
      setMessage(authError(cause, "登录失败，请重试"));
    } finally {
      setBusy(false);
    }
  }
  const theme = (
    <button
      type="button"
      aria-label={dark ? "后台切换浅色模式" : "后台切换深色模式"}
      onClick={() => setDark(!dark)}
      className="rounded-lg p-2 hover:bg-muted"
    >
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
  if (!ready)
    return (
      <div
        className="admin-surface flex items-center justify-center gap-3"
        role="status"
      >
        <LoaderCircle size={20} className="animate-spin" />
        正在验证管理员会话...
      </div>
    );
  if (!admin)
    return (
      <div
        className={`admin-surface ${dark ? "admin-dark" : ""} relative flex items-center justify-center px-5 py-16`}
      >
        <div className="absolute right-6 top-5">{theme}</div>
        <div className="w-full max-w-sm rounded-xl border bg-card px-7 py-9 shadow-sm">
          <Image
            src="/images/logo.png"
            alt=""
            width={56}
            height={56}
            className="mx-auto mb-5 rounded-lg"
          />
          <h1 className="text-center text-2xl font-semibold">
            Vibe Music 管理后台
          </h1>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block text-sm">
              用户名
              <input
                autoComplete="username"
                required
                pattern="[a-zA-Z0-9_-]{4,16}"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={busy}
                className="mt-2 w-full rounded-lg border bg-background px-3 py-2.5 outline-none focus:border-primary"
              />
            </label>
            <label className="block text-sm">
              密码
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
                className="mt-2 w-full rounded-lg border bg-background px-3 py-2.5 outline-none focus:border-primary"
              />
            </label>
            {(message || error) && (
              <p role="alert" className="text-sm text-destructive">
                {message ?? error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm text-white disabled:opacity-40"
            >
              {busy && <LoaderCircle size={16} className="animate-spin" />}登录
            </button>
          </form>
          {error && (
            <button
              type="button"
              onClick={() => void restore()}
              className="mt-4 text-sm text-primary"
            >
              重新验证会话
            </button>
          )}
          <Link
            href="/"
            className="mt-6 block text-center text-sm text-muted-foreground hover:text-primary"
          >
            返回音乐平台
          </Link>
        </div>
      </div>
    );
  return (
    <div
      className={`admin-surface ${dark ? "admin-dark" : ""} flex flex-col md:flex-row`}
    >
      <aside className="shrink-0 bg-[#001529] p-5 text-slate-200 md:min-h-dvh md:w-56">
        <Link
          href="/admin"
          className="flex items-center gap-3 font-semibold text-white"
        >
          <Image
            src="/images/logo.png"
            alt=""
            width={40}
            height={40}
            className="shrink-0 rounded-lg"
          />
          Vibe Music
        </Link>
        <nav aria-label="后台导航" className="mt-6 space-y-2">
          <Link
            href="/admin"
            aria-current={path === "/admin" ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm ${path === "/admin" ? "bg-blue-500/20 text-blue-300" : "hover:bg-white/10"}`}
          >
            <LayoutDashboard size={18} />
            数据统计
          </Link>
          <Link
            href="/admin/banners"
            aria-current={
              path.startsWith("/admin/banners") ? "page" : undefined
            }
            className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm ${path.startsWith("/admin/banners") ? "bg-blue-500/20 text-blue-300" : "hover:bg-white/10"}`}
          >
            <Images size={18} />
            轮播图管理
          </Link>
          <Link
            href="/admin/playlists"
            aria-current={
              path.startsWith("/admin/playlists") ? "page" : undefined
            }
            className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm ${path.startsWith("/admin/playlists") ? "bg-blue-500/20 text-blue-300" : "hover:bg-white/10"}`}
          >
            <ListMusic size={18} />
            歌单管理
          </Link>
          <Link
            href="/admin/songs"
            aria-current={path.startsWith("/admin/songs") ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm ${path.startsWith("/admin/songs") ? "bg-blue-500/20 text-blue-300" : "hover:bg-white/10"}`}
          >
            <Music2 size={18} />
            歌曲管理
          </Link>
          <Link
            href="/admin/artists"
            aria-current={
              path.startsWith("/admin/artists") ? "page" : undefined
            }
            className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm ${path.startsWith("/admin/artists") ? "bg-blue-500/20 text-blue-300" : "hover:bg-white/10"}`}
          >
            <MicVocal size={18} />
            歌手管理
          </Link>
          <Link
            href="/admin/users"
            aria-current={path.startsWith("/admin/users") ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm ${path.startsWith("/admin/users") ? "bg-blue-500/20 text-blue-300" : "hover:bg-white/10"}`}
          >
            <Users size={18} />
            用户管理
          </Link>
          <Link
            href="/admin/feedback"
            aria-current={path === "/admin/feedback" ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm ${path === "/admin/feedback" ? "bg-blue-500/20 text-blue-300" : "hover:bg-white/10"}`}
          >
            <MessageSquare size={18} />
            反馈管理
          </Link>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-card px-5 py-3 md:px-7">
          <span className="text-sm font-medium">
            管理后台 /{" "}
            {path === "/admin"
              ? "数据统计"
              : path.startsWith("/admin/banners")
                ? "轮播图管理"
                : path.startsWith("/admin/playlists")
                  ? "歌单管理"
                  : path.startsWith("/admin/songs")
                    ? "歌曲管理"
                    : path.startsWith("/admin/artists")
                      ? "歌手管理"
                      : path.startsWith("/admin/users")
                        ? "用户管理"
                        : "反馈管理"}
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span>{admin.username}</span>
            {theme}
            <button
              type="button"
              disabled={busy}
              aria-label="管理员退出登录"
              onClick={async () => {
                setBusy(true);
                try {
                  await logout();
                } catch {
                  /* Local session still clears on failure. */
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="min-w-0 p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
}
