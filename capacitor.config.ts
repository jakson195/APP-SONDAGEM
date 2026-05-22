import type { CapacitorConfig } from "@capacitor/cli";

/** URL do Next em dev. Desative com CAP_DISABLE_LIVE=1 ao fazer build de produção nativo. */
const liveReloadUrl = process.env.CAP_DISABLE_LIVE
  ? undefined
  : (process.env.CAP_SERVER_URL?.trim() || "http://localhost:3000");

const config: CapacitorConfig = {
  appId: "com.datageo.digital",
  appName: "DataGeo Digital",

  // Next `.next` has no root index.html; use a minimal folder so `cap sync` can copy assets.
  webDir: "www",

  ...(liveReloadUrl && {
    server: {
      // Browser / iOS Simulator: localhost. Android Emulator: CAP_SERVER_URL=http://10.0.2.2:3000
      // Telemóvel na Wi‑Fi: CAP_SERVER_URL=http://IP_DO_PC:3000
      url: liveReloadUrl,
      cleartext: true,
    },
  }),
};

export default config;
