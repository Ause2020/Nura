import { ToastProvider } from "@/components/ui/toast";

export default function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="min-h-screen">{children}</div>
    </ToastProvider>
  );
}
