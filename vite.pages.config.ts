import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(projectRoot, "pages-src"),
  publicDir: resolve(projectRoot, "public"),
  base: "/alpha-lens-portfolio-changes/",
  plugins: [react()],
  build: { outDir: resolve(projectRoot, "pages-dist"), emptyOutDir: true },
});
