# vite-console-forward-plugin

A Vite plugin that forwards browser console logs to the Vite dev server console for better debugging experience during development.

## What it does

This plugin intercepts browser console logs (`console.log`, `console.warn`, `console.error`, etc.) and forwards them to your Vite dev server console with module-aware tracking. This is particularly useful when:

- Debugging client-side JavaScript in environments where browser dev tools aren't easily accessible
- You want to see all application logs in one place with module context (e.g., `[background]`, `[content]`)
- Working with mobile devices or embedded browsers
- Running automated tests and want console output in your CI logs
- Developing browser extensions where logs from different contexts need to be tracked separately

<img src="log.png" alt="Screenshot" width=500>

## Installation

Since this is a single-file plugin, you can copy `vite-console-forward-plugin.ts` directly into your project, or install it as a local dependency.

## Usage

Add the plugin to your `vite.config.ts`:

### Basic Setup (Web Applications)
```typescript
import { defineConfig } from "vite";
import { consoleForwardPlugin } from "./vite-console-forward-plugin";

export default defineConfig({
  plugins: [
    consoleForwardPlugin({
      // Default configuration works for most web apps
      // Automatically injects into all HTML files
    }),
  ],
});
```

### Advanced Setup (Custom Configuration)
```typescript
import { defineConfig } from "vite";
import { consoleForwardPlugin } from "./vite-console-forward-plugin";

export default defineConfig({
  plugins: [
    consoleForwardPlugin({
      // Include JavaScript/TypeScript files directly
      injectPatterns: [
        "**/*.{js,jsx,ts,tsx,html}"
      ],
      
      // Exclude test files and specific directories
      excludePatterns: [
        "**/node_modules/**",
        "**/*.test.{js,ts}",
        "**/dist/**"
      ],

      // Custom module name extraction
      moduleExtractor: (id: string) => {
        // Extract meaningful module names from file paths
        if (id.includes("/components/")) return "component";
        if (id.includes("/utils/")) return "utils";
        if (id.includes("/api/")) return "api";
        return "app";
      },
      
      // Forward errors and promise rejections
      forwardErrors: true,
    }),
  ],
});
```

## Configuration

The `consoleForwardPlugin` accepts an options object with the following properties:

| Option            | Type                             | Default                                     | Description                                        |
| ----------------- | -------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| `enabled`         | `boolean`                        | `true`                                      | Whether to enable console forwarding               |
| `endpoint`        | `string`                         | `"/api/debug/client-logs"`                  | API endpoint path for receiving logs               |
| `levels`          | `string[]`                       | `["log", "warn", "error", "info", "debug"]` | Console levels to forward                          |
| `injectPatterns`  | `string[]`                       | `["**/*.html"]`                             | Glob patterns for files to inject console forwarding |
| `excludePatterns` | `string[]`                       | `["**/node_modules/**"]`                    | Glob patterns for files to exclude from injection |
| `moduleExtractor` | `(id: string) => string`         | Built-in path parser                        | Custom function to extract module names from paths |
| `silentOnError`   | `boolean`                        | `true`                                      | Don't show console warnings when server is down   |
| `forwardErrors`   | `boolean`                        | `true`                                      | Forward uncaught errors and promise rejections    |

## Pattern Matching with Glob

The plugin uses [micromatch](https://github.com/micromatch/micromatch) for powerful glob pattern matching:

### Default Behavior
By default, the plugin only injects into HTML files (`["**/*.html"]`). This is perfect for standard web applications where all JavaScript is loaded through HTML pages.

### Custom Patterns
You can customize which files receive console forwarding using glob patterns:

```typescript
consoleForwardPlugin({
  // Include all JavaScript and TypeScript files
  injectPatterns: ["**/*.{js,jsx,ts,tsx}"],
  
  // Exclude test files and node_modules
  excludePatterns: ["**/node_modules/**", "**/*.test.{js,ts}", "**/*.spec.{js,ts}"]
})
```

### Common Pattern Examples
- `"**/*.js"` - All JavaScript files
- `"src/**/*.{ts,tsx}"` - TypeScript files in src directory
- `"!**/*.min.js"` - Exclude minified files
- `"**/components/**/*.jsx"` - JSX files in any components directory

## Browser Extensions

For browser extension development, you'll need to specify your extension's entry points since they don't run through HTML files:

```typescript
consoleForwardPlugin({
  enabled: isDev,
  // Target specific extension entry points
  injectPatterns: [
    "**/entries/background/**/*.{ts,js}",
    "**/entries/content/**/*.{ts,js}", 
    "**/entries/popup/**/*.{tsx,jsx}",
    "**/entries/options/**/*.{tsx,jsx}",
  ],
  // Custom module extraction for cleaner logs
  moduleExtractor: (id) => {
    if (id.includes("/background/")) return "background";
    if (id.includes("/content/")) return "content"; 
    if (id.includes("/popup/")) return "popup";
    if (id.includes("/options/")) return "options";
    return "extension";
  },
})
```

This will show logs like `[background] User logged in` or `[content] Page loaded`, making it easy to track which part of your extension is generating each log.

### Web Workers and Service Workers
For applications using workers, add their scripts to the patterns:

```typescript
consoleForwardPlugin({
  injectPatterns: [
    "**/*.html",
    "**/workers/**/*.js",
    "**/service-worker.js"
  ],
  moduleExtractor: (id) => {
    if (id.includes("service-worker")) return "service-worker";
    if (id.includes("/workers/")) return "worker";
    return defaultModuleExtractor(id);
  }
})
```

## How it works

1. **Client-side**: The plugin transforms your code to patch browser console methods
2. **Module tracking**: Each log is tagged with its source module for better organization
3. **Buffering**: Console logs are buffered and sent in batches to reduce network overhead
4. **Server-side**: A middleware endpoint receives the logs and outputs them using Vite's logger with module prefixes
5. **Formatting**: Logs maintain their original formatting and include stack traces for errors
6. **Error handling**: Network failures are handled gracefully without breaking your application

## Simple Error Handling

The plugin includes simple, robust error handling for when the development server is unavailable:

- **Silent failures**: By default, connection errors are silent to avoid console noise (set `silentOnError: false` to see errors)
- **Graceful degradation**: Failed requests are simply ignored, your application continues normally
- **No retry complexity**: Keeps the implementation simple and predictable

This ensures your application continues to work normally even when the dev server is down, without generating `ERR_CONNECTION_REFUSED` errors in the browser console.

## License

MIT
