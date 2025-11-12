"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { usePathname } from "next/navigation";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Dashboard 페이지인지 확인
  const isDashboard = pathname === "/dashboard";

  return (
    <div className="flex">
      <Sidebar />
      <main className={isDashboard ? "flex-1 p-6" : "flex-1 ml-64 p-6"}>
        {children}
      </main>
    </div>
  );
}
