import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The web app lives in src/web; the build goes to dist/web and the server serves it.
export default defineConfig({
  root: "src/web",
  plugins: [react()],
  // The spreadsheet UI asks for "@ironcalc/wasm"; give it the build that can also read and write .xlsx,
  // so the browser loads only one copy of the engine.
  resolve: { alias: { "@ironcalc/wasm": fileURLToPath(new URL("./node_modules/@ironcalc/wasm-xlsx/wasm.js", import.meta.url)) } },
  optimizeDeps: { exclude: ["@ironcalc/wasm", "@ironcalc/wasm-xlsx"] },
  build: { outDir: "../../dist/web", emptyOutDir: true },
  server: { port: 5173, proxy: { "/api": "http://localhost:3000" } },
});
