import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    cloudflare({
      tunnel: { autoStart: false },
      viteEnvironment: { name: "ssr" },
    }),
    tanstackStart({
      router: {
        codeSplittingOptions: {
          splitBehavior: ({ routeId }) =>
            routeId === "/login" ? [] : undefined,
        },
      },
    }),
    viteReact(),
  ],
  preview: {
    allowedHosts: [".trycloudflare.com"],
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    allowedHosts: ["zen-devbox-1", "zen-devbox-1.tail208664.ts.net"],
    port: 3000,
  },
});
