import { createLogger } from "vite";
import type { Plugin, ViteDevServer, ResolvedConfig } from "vite";
import type { IncomingMessage } from "http";
import assert from "assert";

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
   * Auto-inject into specific file patterns (for extensions)
   */
  injectPatterns?: string[];
  /**
   * Custom function to extract module name from file path
   */
  moduleExtractor?: (filePath: string) => string;
  /**
   * Silent on error - don't show console warnings when server is down (default: true)
   */
  silentOnError?: boolean;
}

// Default module extractor
function defaultModuleExtractor(id: string): string {
  const parts = id.split('/');
  
  // Try to find meaningful directory structure
  const srcIndex = parts.findIndex(part => part === 'src');
  if (srcIndex >= 0 && srcIndex < parts.length - 2) {
    // Use the directory after src
    return parts[srcIndex + 1];
  }
  
  // Fall back to parent directory name
  const parentDir = parts[parts.length - 2];
  if (parentDir && parentDir !== '.' && parentDir !== '..') {
    return parentDir;
  }
  
  // Final fallback to filename without extension
  const filename = parts[parts.length - 1];
  return filename ? filename.split('.')[0] : 'unknown';
}

export function consoleForwardPlugin(
  options: ConsoleForwardOptions = {}
): Plugin {
  const {
    enabled = true,
    endpoint = "/api/debug/client-logs",
    levels = ["log", "warn", "error", "info", "debug"],
    injectPatterns = [],
    moduleExtractor = defaultModuleExtractor,
    silentOnError = true,
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
      loggerCache.set(moduleName, createLogger("info", { 
        prefix: `[${moduleName}]` 
      }));
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

      // Check if this file should have console forwarding injected
      const shouldInject = injectPatterns.some((pattern) =>
        id.includes(pattern)
      );

      if (shouldInject) {
        // Extract module context from file path
        const moduleContext = moduleExtractor(id);
        
        // Inject module context setter and import at the top of the file
        return `import { setModuleContext } from '${forwardModuleId}';\n` +
               `setModuleContext('${moduleContext}');\n` +
               `import '${forwardModuleId}';\n${code}`;
      }
    },

    // Note: transformIndexHtml disabled for browser extensions to avoid CSP issues
    // The transform hook handles script injection directly into JS/TS files
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
          server!.config.logger.info(`Console forwarding dev server URL: ${devServerUrl}`);
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
              const logger = getOrCreateLogger(log.module || 'unknown');
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
