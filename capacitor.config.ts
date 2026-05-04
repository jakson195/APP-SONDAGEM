import type { CapacitorConfig } from "@capacitor/cli";

const isDev = process.env.NODE_ENV === "development";

const config: CapacitorConfig = {
  appId: "com.soilsul.app",
  appName: "SOILSUL",

  webDir: "out",

  ...(isDev && {
    server: {
      url: "http://10.1.1163:3000", // 👈 seu IP
      cleartext: true
    }
  })
};

export default config;
