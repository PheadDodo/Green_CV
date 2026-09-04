import { PasswordForm } from "@/components/password-form";
import { PageHeader } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Account" };

export default function AccountPage() {
  const configured = isSupabaseConfigured();
  return <main className="page"><PageHeader eyebrow="Private workspace" title="Account security" description={configured ? "Update the password for your GreenCV account." : "Local demo mode does not create an account or password."} /><section className="panel" style={{ maxWidth: 580 }}><div className="panelHeader"><div><h2>{configured ? "Choose a new password" : "Demo workspace"}</h2><p>{configured ? "Use at least eight characters and avoid passwords from other sites." : "Configure Supabase to enable private user accounts."}</p></div></div><div className="panelBody"><PasswordForm configured={configured} /></div></section></main>;
}
