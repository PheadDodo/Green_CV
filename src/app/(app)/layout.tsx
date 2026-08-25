import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  return <AppShell viewer={{ email: viewer.email ?? viewer.displayName ?? "Account", isDemo: viewer.isDemo }}>{children}</AppShell>;
}
