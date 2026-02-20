import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import dts from "vite-plugin-dts"
import { resolve } from "path"

export default defineConfig({
  plugins: [react(), dts({ tsconfigPath: "./tsconfig.json" })],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es", "cjs"],
      fileName: (format) => `index.${format === "es" ? "js" : "cjs"}`,
    },
    rollupOptions: {
      external: [
        "react", "react-dom", "react/jsx-runtime",
        "@radix-ui/themes", "@tanstack/react-query",
        "lucide-react",
        "react-router",
      ],
    },
  },
})
