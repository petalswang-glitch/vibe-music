import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { QueryProvider } from "@/providers/query-provider";
import { PlayerProvider } from "@/providers/player-provider";
import { AuthProvider } from "@/providers/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vibe Music",
  description: "在线音乐平台",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <QueryProvider>
          <PlayerProvider>
            <AuthProvider>
              <AppShell>{children}</AppShell>
            </AuthProvider>
          </PlayerProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
