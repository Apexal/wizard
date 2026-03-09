import { defineConfig } from "vite";

export default defineConfig({
  server: {
    allowedHosts: [
      "localhost",
      "sheaflike-carley-literately.ngrok-free.dev",
      "1baf-72-45-218-231.ngrok-free.app",
    ],
    proxy: {
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
      },
    },
  },
});
