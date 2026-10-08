import { execSync } from "node:child_process";

const TEST_DATABASE_URL =
  "postgresql://cobyshelton@localhost:5432/tasks_app_test?schema=public";

export default function globalSetup() {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });
}
