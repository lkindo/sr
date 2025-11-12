import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { auth } from "@/auth";
import { LayoutWrapper } from "./layout-wrapper";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="relative flex min-h-screen flex-col">
      <Header user={session?.user} />
      <div className="flex-1">
        <LayoutWrapper>{children}</LayoutWrapper>
      </div>
      <Footer />
    </div>
  );
}
