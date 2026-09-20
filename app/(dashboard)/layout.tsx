import { DashboardQuickCapture } from "@/components/layout/dashboard-quick-capture";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { SidebarFallback } from "@/components/layout/sidebar-fallback";
import { ToastProvider } from "@/components/ui/toast";
import { Suspense } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-background">
        <Suspense fallback={<SidebarFallback />}>
          <DashboardSidebar />
        </Suspense>
        <main className="md:ml-56 ml-14 min-h-screen">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
        <Suspense fallback={null}>
          <DashboardQuickCapture />
        </Suspense>
      </div>
    </ToastProvider>
  );
}
