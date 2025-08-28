import { spawn, ChildProcess } from 'child_process';
import { Page } from '@playwright/test';

export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  text: string;
  timestamp: number;
  module?: string;
}

export interface ErrorMessage {
  message: string;
  stack?: string;
  timestamp: number;
  context?: string;
}

export class ConsoleCapture {
  private messages: ConsoleMessage[] = [];
  private errors: ErrorMessage[] = [];
  private serverProcess: ChildProcess | null = null;
  private serverOutput: string[] = [];

  constructor() {
    this.messages = [];
    this.errors = [];
    this.serverOutput = [];
  }

  async startServer(command: string = 'npm run dev'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn(command, { shell: true });

      this.serverProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        this.serverOutput.push(output);
        console.log('[Server]', output);
        
        // Resolve when server is ready
        if (output.includes('ready in') || output.includes('Local:')) {
          setTimeout(resolve, 1000); // Give it a moment to fully initialize
        }
      });

      this.serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        this.serverOutput.push(output);
        console.error('[Server Error]', output);
      });

      this.serverProcess.on('error', reject);

      // Timeout if server doesn't start
      setTimeout(() => reject(new Error('Server failed to start')), 30000);
    });
  }

  async stopServer(): Promise<void> {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  attachToPage(page: Page): void {
    // Capture browser console messages
    page.on('console', (msg) => {
      const type = msg.type() as ConsoleMessage['type'];
      this.messages.push({
        type,
        text: msg.text(),
        timestamp: Date.now(),
      });
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      this.errors.push({
        message: error.message,
        stack: error.stack,
        timestamp: Date.now(),
        context: 'page',
      });
    });

    // Capture uncaught exceptions
    page.on('crash', () => {
      this.errors.push({
        message: 'Page crashed',
        timestamp: Date.now(),
        context: 'crash',
      });
    });
  }

  getMessages(type?: ConsoleMessage['type']): ConsoleMessage[] {
    if (type) {
      return this.messages.filter(msg => msg.type === type);
    }
    return this.messages;
  }

  getErrors(): ErrorMessage[] {
    return this.errors;
  }

  getServerOutput(): string[] {
    return this.serverOutput;
  }

  findInServerOutput(pattern: string | RegExp): boolean {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return this.serverOutput.some(line => regex.test(line));
  }

  findMessageInServerOutput(text: string, type?: string): boolean {
    // Look for forwarded console messages in server output
    const escapedText = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const typePrefix = type ? `\\[${type}\\]` : '';
    const pattern = new RegExp(`${typePrefix}.*${escapedText}`);
    return this.findInServerOutput(pattern);
  }

  findErrorInServerOutput(errorMessage: string): boolean {
    // Look for forwarded errors in server output
    const escapedMessage = errorMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.findInServerOutput(new RegExp(`(Error|error).*${escapedMessage}`));
  }

  clear(): void {
    this.messages = [];
    this.errors = [];
    this.serverOutput = [];
  }

  async waitForMessage(pattern: string | RegExp, timeout: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

    while (Date.now() - startTime < timeout) {
      if (this.serverOutput.some(line => regex.test(line))) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  }
}

export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function extractModuleContext(message: string): string | null {
  // Extract module context from forwarded messages like [module.js]
  const match = message.match(/\[([^\]]+)\]/);
  return match ? match[1] : null;
}

export function parseForwardedError(message: string): { message: string; stack?: string } | null {
  // Parse forwarded error messages
  const errorMatch = message.match(/Error:\s*(.+?)(?:\n|$)/);
  const stackMatch = message.match(/Stack:\s*([\s\S]+?)(?:\n\n|$)/);
  
  if (errorMatch) {
    return {
      message: errorMatch[1],
      stack: stackMatch ? stackMatch[1] : undefined,
    };
  }
  return null;
}