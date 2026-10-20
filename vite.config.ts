import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The web app lives in src/web; the build goes to dist/web and the server serves it.
export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
});
