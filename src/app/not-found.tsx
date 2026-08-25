import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return <main className="standaloneState"><Compass size={34} /><h1>We lost that trail.</h1><p>The page or application does not exist.</p><Link className="button button-primary" href="/dashboard">Back to dashboard</Link></main>;
}
