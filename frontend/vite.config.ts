import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  build: { outDir: "build" },
  server: {
    host: "::",
    port: 8080,
    proxy: { "/api": "http://localhost:5000" },
    hmr: { overlay: false },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
