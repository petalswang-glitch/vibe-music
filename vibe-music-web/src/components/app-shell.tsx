"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  Disc3,
  Home,
  Heart,
  Library,
  MicVocal,
  Moon,
  Sun,
} from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { useTheme } from "@/lib/use-theme";
import { HeaderSearch } from "@/components/header-search";
import { SidebarFavorites } from "@/components/sidebar-favorites";
import { GlobalPlayer } from "@/components/global-player";
import { AccountEntry } from "@/components/account-entry";
import { AgentChat } from "@/components/agent-chat";

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [dark, toggleTheme] = useTheme();
  if (path === "/admin" || path.startsWith("/admin/")) return children;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex min-h-20 shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-3 md:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-serif-display text-lg font-semibold sm:gap-3 sm:text-xl"
        >
          <AudioLines className="text-primary" size={26} />
          Vibe Music
        </Link>
        <div className="order-3 w-full sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 sm:px-5">
          <Suspense>
            <HeaderSearch />
          </Suspense>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <AccountEntry />
          <button
            aria-label={dark ? "切换浅色模式" : "切换深色模式"}
            onClick={toggleTheme}
            className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted"
          >
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>
      <nav
        aria-label="移动导航"
        className="flex gap-1 overflow-x-auto border-b px-4 py-2 text-sm md:hidden"
      >
        {[
          { href: "/", label: "推荐" },
          { href: "/library", label: "曲库" },
          { href: "/artist", label: "歌手" },
          { href: "/playlist", label: "歌单" },
          { href: "/like", label: "喜欢" },
        ].map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={
              path === href || (href !== "/" && path.startsWith(`${href}/`))
                ? "page"
                : undefined
            }
            className={`shrink-0 rounded-lg px-4 py-2 ${path === href || (href !== "/" && path.startsWith(`${href}/`)) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 border-r px-5 py-8 md:block">
          <nav aria-label="主导航" className="space-y-2">
            <Link
              href="/"
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${path === "/" ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
            >
              <Home size={19} />
              推荐
            </Link>
            <p className="px-4 pb-2 pt-5 text-xs tracking-widest text-muted-foreground">
              发现
            </p>
            <Link
              href="/library"
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${path === "/library" ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
            >
              <Library size={19} />
              曲库
            </Link>
            <Link
              href="/artist"
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${path.startsWith("/artist") ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
            >
              <MicVocal size={19} />
              歌手
            </Link>
            <Link
              href="/playlist"
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${path.startsWith("/playlist") ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
            >
              <Disc3 size={19} />
              歌单
            </Link>
            <Link
              href="/like"
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${path === "/like" ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
            >
              <Heart size={19} />
              喜欢
            </Link>
          </nav>
          <SidebarFavorites />
        </aside>
        <main className="min-w-0 flex-1 px-5 py-8 md:px-10 md:py-10">
          {children}
        </main>
      </div>
      <GlobalPlayer isDark={dark} onToggleTheme={toggleTheme} />
      <AgentChat />
    </div>
  );
}
