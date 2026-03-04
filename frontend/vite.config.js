import { defineConfig } from "vite";

export default defineConfig({
  server: {
    allowedHosts: ["localhost", "sheaflike-carley-literately.ngrok-free.dev"],
    proxy: {
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
      },
    },
  },
});
