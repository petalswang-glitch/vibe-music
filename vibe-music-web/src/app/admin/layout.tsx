import type { ReactNode } from "react";
import { AdminProvider } from "@/providers/admin-provider";
import { AdminFrame } from "@/components/admin-frame";
import "./admin.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AdminProvider>
      <AdminFrame>{children}</AdminFrame>
    </AdminProvider>
  );
}
