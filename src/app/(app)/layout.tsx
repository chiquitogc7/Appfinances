import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";
import { ToastProvider } from "@/components/Toast";

export default function PrivateLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </ToastProvider>
  );
}
