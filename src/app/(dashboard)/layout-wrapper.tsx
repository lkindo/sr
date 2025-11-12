"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { usePathname } from "next/navigation";

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Dashboard 페이지인지 확인
  const isDashboard = pathname === "/dashboard";

  return (
    <div className="flex min-h-[calc(100vh-104px)]">
      <Sidebar />
      <main className={isDashboard ? "flex-1 p-8 sr-content-bg" : "flex-1 ml-64 p-8 sr-content-bg"}>
        <div className="w-full max-w-[1280px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
