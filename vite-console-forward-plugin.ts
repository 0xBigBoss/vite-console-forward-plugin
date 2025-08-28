import { createLogger } from "vite";
import type { Plugin, ViteDevServer, ResolvedConfig } from "vite";
import type { IncomingMessage } from "http";
import assert from "assert";
import micromatch from "micromatch";

interface LogEntry {
  level: string;
  message: string;
  timestamp: Date;
  url?: string;
  userAgent?: string;
  stacks?: string[];
  extra?: any;
  module?: string;
}

interface ClientLogRequest {
  logs: LogEntry[];
}

export interface ConsoleForwardOptions {
  /**
   * Whether to enable console forwarding (default: true in dev mode)
   */
  enabled?: boolean;
  /**
   * API endpoint path (default: '/api/debug/client-logs')
   */
  endpoint?: string;
  /**
   * Console levels to forward (default: ['log', 'warn', 'error', 'info', 'debug'])
   */
  levels?: ("log" | "warn" | "error" | "info" | "debug")[];
  /**
   * Glob patterns to match files for injection
   * Default: HTML files only
   * Set to empty array to disable automatic injection
   */
  injectPatterns?: string[];
  /**
   * Glob patterns to exclude from injection
   * Default: node_modules directory
   * Takes precedence over injectPatterns
   */
  excludePatterns?: string[];
  /**
   * Custom function to extract module name from file path
   */
  moduleExtractor?: (filePath: string) => string;
  /**
   * Silent on error - don't show console warnings when server is down (default: true)
   */
  silentOnError?: boolean;
  /**
   * Enable forwarding of unhandled errors and promise rejections (default: true)
   */
  forwardErrors?: boolean;
}

// Default module extractor
function defaultModuleExtractor(id: string): string {
  const parts = id.split("/");

  // Try to find meaningful directory structure
  const srcIndex = parts.findIndex((part) => part === "src");
  if (srcIndex >= 0 && srcIndex < parts.length - 2) {
    // Use the directory after src
    return parts[srcIndex + 1];
  }

  // Fall back to parent directory name
  const parentDir = parts[parts.length - 2];
  if (parentDir && parentDir !== "." && parentDir !== "..") {
    return parentDir;
  }

  // Final fallback to filename without extension
  const filename = parts[parts.length - 1];
  return filename ? filename.split(".")[0] : "unknown";
}

export function consoleForwardPlugin(
  options: ConsoleForwardOptions = {}
): Plugin {
  const {
    enabled = true,
    endpoint = "/api/debug/client-logs",
    levels = ["log", "warn", "error", "info", "debug"],
    injectPatterns = ["**/*.html"],
    excludePatterns = ["**/node_modules/**"],
    moduleExtractor = defaultModuleExtractor,
    silentOnError = true,
    forwardErrors = true,
  } = options;

  // Virtual modules
  const configModuleId = "virtual:console-forward-config";
  const forwardModuleId = "virtual:console-forward";
  const resolvedConfigModuleId = "\0" + configModuleId;
  const resolvedForwardModuleId = "\0" + forwardModuleId;

  let devServerUrl = "";
  let server: ViteDevServer | null = null;
  let resolvedConfig: ResolvedConfig;

  // Dynamic logger cache
  const loggerCache = new Map<string, ReturnType<typeof createLogger>>();

  function getOrCreateLogger(moduleName: string) {
    if (!loggerCache.has(moduleName)) {
      loggerCache.set(
        moduleName,
        createLogger("info", {
          prefix: `[${moduleName}]`,
        })
      );
    }
    return loggerCache.get(moduleName)!;
  }

  return {
    name: "console-forward",

    configResolved(config) {
      resolvedConfig = config;
    },

    resolveId(id) {
      if (id === configModuleId) {
        return resolvedConfigModuleId;
      }
      if (id === forwardModuleId) {
        return resolvedForwardModuleId;
      }
    },

    load(id) {
      if (id === resolvedConfigModuleId) {
        if (!enabled) {
          return `export const DEV_SERVER_ENDPOINT = '';
export const SILENT_ON_ERROR = true;`;
        }

        // Use the resolved Vite config to determine server URL
        const serverConfig = resolvedConfig.server || {};
        const host = serverConfig.host || "localhost";
        const port = serverConfig.port || 5173;
        const protocol = serverConfig.https ? "https" : "http";

        // Handle special host values for client-side connections
        let actualHost = host;
        if (host === true || host === "0.0.0.0") {
          actualHost = "localhost";
        }

        const serverUrl = `${protocol}://${actualHost}:${port}`;
        return `export const DEV_SERVER_ENDPOINT = '${serverUrl}';
export const SILENT_ON_ERROR = ${silentOnError};`;
      }

      if (id === resolvedForwardModuleId) {
        if (!enabled) {
          return "export default {};";
        }

        return `
import { DEV_SERVER_ENDPOINT, SILENT_ON_ERROR } from '${configModuleId}';

// Module context tracking
let currentModuleContext = 'unknown';

export function setModuleContext(context) {
  currentModuleContext = context;
}

// Console forwarding implementation
const originalMethods = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

const logBuffer = [];
let flushTimeout = null;
const FLUSH_DELAY = 100;
const MAX_BUFFER_SIZE = 50;

function createLogEntry(level, args) {
  const stacks = [];
  const extra = [];

  const message = args.map((arg) => {
    if (arg === undefined) return "undefined";
    if (typeof arg === "string") return arg;
    if (arg instanceof Error || typeof arg.stack === "string") {
      let stringifiedError = arg.toString();
      if (arg.stack) {
        let stack = arg.stack.toString();
        if (stack.startsWith(stringifiedError)) {
          stack = stack.slice(stringifiedError.length).trimStart();
        }
        if (stack) {
          stacks.push(stack);
        }
      }
      return stringifiedError;
    }
    if (typeof arg === "object" && arg !== null) {
      try {
        extra.push(JSON.parse(JSON.stringify(arg)));
      } catch {
        extra.push(String(arg));
      }
      return "[extra#" + extra.length + "]";
    }
    return String(arg);
  }).join(" ");

  return {
    level,
    message,
    timestamp: new Date(),
    url: typeof window !== 'undefined' ? window.location?.href : 'extension-context',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'extension-context',
    module: currentModuleContext,
    stacks,
    extra,
  };
}

async function sendLogs(logs) {
  try {
    const apiUrl = DEV_SERVER_ENDPOINT + '${endpoint}';
    await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logs }),
    });
  } catch (error) {
    // Only show warning if not silenced
    if (!SILENT_ON_ERROR && typeof console !== 'undefined' && console.warn) {
      console.warn('[Console Forward] Failed to send logs:', error.message);
    }
  }
}

function flushLogs() {
  if (logBuffer.length === 0) return;
  const logsToSend = [...logBuffer];
  logBuffer.length = 0;
  sendLogs(logsToSend);
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
}

function addToBuffer(entry) {
  logBuffer.push(entry);
  if (logBuffer.length >= MAX_BUFFER_SIZE) {
    flushLogs();
    return;
  }
  if (!flushTimeout) {
    flushTimeout = setTimeout(flushLogs, FLUSH_DELAY);
  }
}

// Patch console methods
${levels
  .map(
    (level) => `
console.${level} = function(...args) {
  originalMethods.${level}(...args);
  const entry = createLogEntry("${level}", args);
  addToBuffer(entry);
};`
  )
  .join("")}

// Error forwarding handlers
${
  forwardErrors
    ? `
// Detect execution context
const isWorker = typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
const isServiceWorker = typeof self !== 'undefined' && typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope;
const hasWindow = typeof window !== 'undefined';

// Function to format error details
function formatErrorDetails(error) {
  const details = {
    message: error.message || String(error),
    stack: error.stack || '',
    filename: error.filename || '',
    lineno: error.lineno || 0,
    colno: error.colno || 0,
  };

  // Extract more details if available
  if (error.error && typeof error.error === 'object') {
    details.message = error.error.message || details.message;
    details.stack = error.error.stack || details.stack;
  }

  return details;
}

// Handle unhandled promise rejections
function handleUnhandledRejection(event) {
  const errorDetails = event.reason instanceof Error
    ? formatErrorDetails(event.reason)
    : { message: String(event.reason), stack: '' };

  const context = isServiceWorker ? 'service-worker' : (isWorker ? 'worker' : 'window');
  originalMethods.error('[Unhandled Promise Rejection]', errorDetails.message);

  const entry = createLogEntry('error', [
    '[Unhandled Promise Rejection]',
    errorDetails.message,
    errorDetails.stack ? { stack: errorDetails.stack } : null
  ].filter(Boolean));

  entry.module = currentModuleContext + ':' + context;
  addToBuffer(entry);

  // Prevent default browser handling if in window context
  if (hasWindow && event.preventDefault) {
    event.preventDefault();
  }
}

// Handle uncaught exceptions
function handleUncaughtException(event) {
  const errorDetails = formatErrorDetails(event);
  const context = isServiceWorker ? 'service-worker' : (isWorker ? 'worker' : 'window');

  originalMethods.error('[Uncaught Exception]', errorDetails.message);

  const entry = createLogEntry('error', [
    '[Uncaught Exception]',
    errorDetails.message,
    errorDetails.stack ? { stack: errorDetails.stack } : null,
    errorDetails.filename ? 'at ' + errorDetails.filename + ':' + errorDetails.lineno + ':' + errorDetails.colno : null
  ].filter(Boolean));

  entry.module = currentModuleContext + ':' + context;
  addToBuffer(entry);

  // Prevent default browser error handling if in window context
  if (hasWindow && event.preventDefault) {
    event.preventDefault();
  }
}

// Register error handlers based on context
if (hasWindow) {
  // Window context
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  window.addEventListener('error', handleUncaughtException);
} else if (isWorker || isServiceWorker) {
  // Worker/Service Worker context
  self.addEventListener('unhandledrejection', handleUnhandledRejection);
  self.addEventListener('error', handleUncaughtException);
}
`
    : ""
}

// Cleanup handlers
if (typeof window !== 'undefined') {
  window.addEventListener("beforeunload", flushLogs);
}
setInterval(flushLogs, 10000);

export default { flushLogs };
        `;
      }
    },

    transform(code, id) {
      // Skip if not enabled or no inject patterns
      if (!enabled || injectPatterns.length === 0) {
        return;
      }

      // Skip HTML files - they are handled by transformIndexHtml
      if (id.endsWith('.html')) {
        return;
      }

      // First check if file should be excluded
      if (
        excludePatterns.length > 0 &&
        micromatch.isMatch(id, excludePatterns)
      ) {
        return;
      }

      // Check if this file matches injection patterns
      const shouldInject = micromatch.isMatch(id, injectPatterns);

      if (shouldInject) {
        // Check if console forwarding is already injected to prevent double injection
        if (code.includes(forwardModuleId)) {
          return;
        }

        // Extract module context from file path
        const moduleContext = moduleExtractor(id);

        // For JS/TS files, inject imports at the top
        return (
          `import { setModuleContext } from '${forwardModuleId}';\n` +
          `setModuleContext('${moduleContext}');\n` +
          `import '${forwardModuleId}';\n${code}`
        );
      }
    },

    // Handle HTML file transformation
    transformIndexHtml(html, ctx) {
      // Skip if not enabled or no inject patterns
      if (!enabled || injectPatterns.length === 0) {
        return;
      }

      const id = ctx.filename;

      // First check if file should be excluded
      if (
        excludePatterns.length > 0 &&
        micromatch.isMatch(id, excludePatterns)
      ) {
        return;
      }

      // Check if this file matches injection patterns
      const shouldInject = micromatch.isMatch(id, injectPatterns);

      if (shouldInject) {
        // Check if console forwarding is already injected to prevent double injection
        if (html.includes(forwardModuleId)) {
          return;
        }

        // Extract module context from file path
        const moduleContext = moduleExtractor(id);

        // Inject a script tag as early as possible to capture all logs
        const scriptTag = `<script type="module">
import { setModuleContext } from '${forwardModuleId}';
setModuleContext('${moduleContext}');
import '${forwardModuleId}';
</script>`;
        
        // Try to inject after opening head tag (earliest safe position)
        if (html.includes('<head>')) {
          return html.replace('<head>', `<head>\n${scriptTag}`);
        } else if (html.includes('<body>')) {
          // Fallback: inject at the beginning of body
          return html.replace('<body>', `<body>\n${scriptTag}`);
        } else if (html.includes('<html>')) {
          // Fallback: inject right after html tag
          return html.replace('<html>', `<html>\n${scriptTag}`);
        } else {
          // Last resort: prepend at the beginning
          return scriptTag + '\n' + html;
        }
      }
    },

    configureServer(viteServer) {
      server = viteServer;
      assert(server, "server is not defined");

      // Set up URL discovery after server starts
      const { httpServer } = server;
      if (httpServer) {
        httpServer.once("listening", async () => {
          assert(server, "server is not defined");
          const urls = server.resolvedUrls;
          devServerUrl =
            urls?.local?.[0] ||
            `http://localhost:${(httpServer.address() as any)?.port || 5173}`;
          server!.config.logger.info(
            `Console forwarding dev server URL: ${devServerUrl}`
          );
        });
      }

      // Add API endpoint to handle forwarded console logs
      server.middlewares.use(endpoint, (req, res, next) => {
        const request = req as IncomingMessage & { method?: string };
        if (request.method !== "POST") {
          return next();
        }

        let body = "";
        request.setEncoding("utf8");

        request.on("data", (chunk: string) => {
          body += chunk;
        });

        request.on("end", () => {
          try {
            const { logs }: ClientLogRequest = JSON.parse(body);

            // Forward each log to the Vite dev server console using dynamic loggers
            logs.forEach((log) => {
              const logger = getOrCreateLogger(log.module || "unknown");
              const location = log.url ? ` (${log.url})` : "";
              let message = `[${log.level}] ${log.message}${location}`;

              // Add stack traces if available
              if (log.stacks && log.stacks.length > 0) {
                message +=
                  "\n" +
                  log.stacks
                    .map((stack) =>
                      stack
                        .split("\n")
                        .map((line) => `    ${line}`)
                        .join("\n")
                    )
                    .join("\n");
              }

              // Add extra data if available
              if (log.extra && log.extra.length > 0) {
                message +=
                  "\n    Extra data: " +
                  JSON.stringify(log.extra, null, 2)
                    .split("\n")
                    .map((line) => `    ${line}`)
                    .join("\n");
              }

              // Use the appropriate logger for consistent formatting
              const logOptions = { timestamp: true };
              switch (log.level) {
                case "error": {
                  const error =
                    log.stacks && log.stacks.length > 0
                      ? new Error(log.stacks.join("\n"))
                      : null;
                  logger.error(message, { ...logOptions, error });
                  break;
                }
                case "warn":
                  logger.warn(message, logOptions);
                  break;
                case "info":
                  logger.info(message, logOptions);
                  break;
                case "debug":
                  logger.info(message, logOptions);
                  break;
                default:
                  logger.info(message, logOptions);
              }
            });

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
          } catch (error) {
            assert(server, "server is not defined");
            server.config.logger.error("Error processing client logs:", {
              timestamp: true,
              error: error as Error,
            });
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
          }
        });
      });
    },
  };
}
