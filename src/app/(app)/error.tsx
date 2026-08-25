"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="page"><div className="emptyState errorState"><span className="emptyIcon"><AlertTriangle /></span><h2>That view could not load</h2><p>{error.message || "Pathfinder hit an unexpected error."}</p><Button onClick={reset}><RotateCcw size={16} /> Try again</Button></div></main>;
}
