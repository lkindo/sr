"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";

export default function MainContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";

  return (
    <div className="flex-1 flex">
      <Sidebar />
      <main className={isDashboard ? "flex-1 p-8 sr-content-bg" : "flex-1 ml-64 p-8 sr-content-bg"}>
        <div className="w-full max-w-[1280px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
