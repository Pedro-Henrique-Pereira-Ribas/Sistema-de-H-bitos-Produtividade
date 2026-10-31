import { defineConfig } from "@neon/config/v1";

const realtimeOrigins = String(
  process.env.NEON_REALTIME_ALLOWED_ORIGINS ||
    "http://localhost:3000,http://localhost:3210,http://localhost:3212," +
      "http://127.0.0.1:3000,http://127.0.0.1:3210,http://127.0.0.1:3212," +
      "https://fluxo.onrender.com"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export default defineConfig({
  // Neon Auth (Managed Better Auth)
  auth: true,

  // Neon AI Gateway — bloqueado no plano Free desta conta.
  // Descomente depois de fazer upgrade para Launch/Scale e adicionar créditos:
  // aiGateway: true,

  // Private bucket for manual/cloud backups of each user's Fluxo state.
  buckets: {
    "fluxo-backups": {}
  },

  // Long-running function close to Postgres, used as the app's cloud health probe.
  functions: {
    fluxostatus: {
      name: "Fluxo cloud status",
      source: "functions/fluxo-status.ts",
      env: {
        FLUXO_FUNCTION_KEY: process.env.FLUXO_FUNCTION_KEY!
      }
    }
  },

  // Neon Realtime (beta) for live state updates across tabs/devices.
  preview: {
    realtime: {
      allowedOrigins: realtimeOrigins
    }
  },

  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  }
});
