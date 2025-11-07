import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Header />
      <div className="flex-1">
        <div className="flex">
          <Sidebar />
          <main className="flex-1 ml-64 p-6">{children}</main>
        </div>
      </div>
      <Footer />
    </div>
  );
}
