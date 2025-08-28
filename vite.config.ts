import { defineConfig } from "vite";
import { consoleForwardPlugin } from "./vite-console-forward-plugin";

export default defineConfig({
  plugins: [
    consoleForwardPlugin({
      // Using default configuration:
      // - injectPatterns: ["**/*.html"] - only HTML files get console forwarding
      // - excludePatterns: ["**/node_modules/**"] - node_modules excluded
      // - forwardErrors: true - uncaught errors and promise rejections are forwarded
    }),
  ],
  server: {
    port: 5173,
  },
});
