import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 443,
    strictPort: true, // fail if 4173 is taken
  },
});
