"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/providers/admin-provider";

export default function Page() {
  const { admin } = useAdmin();
  const router = useRouter();
  useEffect(() => {
    if (admin) router.replace("/admin");
  }, [admin, router]);
  return null;
}
