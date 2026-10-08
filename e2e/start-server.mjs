import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import path from "node:path";

// Each invocation owns a fresh ignored directory; never reset the user's .data.
const runsDirectory = path.resolve(".data", "e2e");
mkdirSync(runsDirectory, { recursive: true });
const runDirectory = mkdtempSync(path.join(runsDirectory, "run-"));

const server = spawn(process.execPath, [
  "node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3100",
], {
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    NODE_ENV: "development",
    GREEN_CV_E2E: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    JOBS_SUMMARY_LOCAL_DATA_PATH: path.join(runDirectory, "workspace.json"),
    JOBS_SUMMARY_LOCAL_CV_ROOT: path.join(runDirectory, "cv-files"),
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
    // Explicit empty values take precedence over .env files loaded by Next.js.
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_SECRET_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    OPENAI_API_KEY: "",
    LLM_SETTINGS_ENCRYPTION_KEY: "",
    MAX_EVALUATIONS_PER_DAY: "0",
    CRON_SECRET: "",
  },
});

server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
server.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { server.kill(signal); });
}
