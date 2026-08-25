import { PasswordForm } from "@/components/password-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Account" };

export default function AccountPage() {
  return <main className="page"><PageHeader eyebrow="Private workspace" title="Account security" description="Update the password for your Pathfinder account." /><section className="panel" style={{ maxWidth: 580 }}><div className="panelHeader"><div><h2>Choose a new password</h2><p>Use at least eight characters and avoid passwords from other sites.</p></div></div><div className="panelBody"><PasswordForm /></div></section></main>;
}
