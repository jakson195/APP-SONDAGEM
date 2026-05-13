import type { CapacitorConfig } from "@capacitor/cli";

const isDev = process.env.NODE_ENV === "development";

const config: CapacitorConfig = {
  appId: "com.solodata",
  appName: "SOILSUL",

  // Next `.next` has no root index.html; use a minimal folder so `cap sync` can copy assets.
  // Dev: rely on `server.url`; production static builds can replace contents with `next export` → `out` if you add export.
  webDir: "www",

  ...(isDev && {
    server: {
      url: "http://10.1.1.163:3000", // 👈 seu IP
      cleartext: true
    }
  })
};

export default config;
