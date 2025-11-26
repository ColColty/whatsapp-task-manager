import { defineConfig } from "drizzle-kit";

import { env } from "~/env.js";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  tablesFilter: ["whatsapp-task-manager_*"],
});
