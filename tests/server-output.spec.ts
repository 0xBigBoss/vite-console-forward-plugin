import { test, expect } from '@playwright/test';
import { spawn } from 'child_process';
import { delay } from './test-utils';

test.describe('Server Output Tests', () => {
  let serverProcess: any;
  let serverOutput: string[] = [];
  let serverReady = false;

  test.beforeAll(async () => {
    // Start the dev server and capture its output
    serverOutput = [];
    serverReady = false;

    serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: process.cwd(),
      shell: true,
    });

    // Capture server output
    serverProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      serverOutput.push(output);
      console.log('[Server Output]:', output);

      if (output.includes('ready in') || output.includes('http://localhost:5173')) {
        serverReady = true;
      }
    });

    serverProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      serverOutput.push(output);
      console.error('[Server Error]:', output);
    });

    // Wait for server to be ready
    let attempts = 0;
    while (!serverReady && attempts < 60) {
      await delay(1000);
      attempts++;
    }

    if (!serverReady) {
      throw new Error('Server failed to start within 60 seconds');
    }

    await delay(2000); // Give extra time for full initialization
  });

  test.afterAll(async () => {
    // Clean up server process
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await delay(1000);
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }
  });

  test('should forward console.log to server terminal', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Clear current output position
    const outputLengthBefore = serverOutput.length;

    // Click console.log button
    await page.click('button:text("console.log()")');
    await delay(1000);

    // Check server output for forwarded message
    const newOutput = serverOutput.slice(outputLengthBefore).join('\n');
    expect(newOutput).toContain('Standard log message');
    expect(newOutput).toContain('[index.html]'); // Module context
  });

  test('should forward console.warn to server terminal', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    const outputLengthBefore = serverOutput.length;

    await page.click('button:text("console.warn()")');
    await delay(1000);

    const newOutput = serverOutput.slice(outputLengthBefore).join('\n');
    expect(newOutput).toContain('Warning message');
    expect(newOutput).toMatch(/warn/i);
  });

  test('should forward console.error to server terminal', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    const outputLengthBefore = serverOutput.length;

    await page.click('button:text("console.error()")');
    await delay(1000);

    const newOutput = serverOutput.slice(outputLengthBefore).join('\n');
    expect(newOutput).toContain('Error message');
    expect(newOutput).toMatch(/error/i);
  });

  test('should forward uncaught errors with stack traces', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    // Handle expected error
    page.on('pageerror', error => {
      console.log('Expected error in browser:', error.message);
    });

    const outputLengthBefore = serverOutput.length;

    await page.click('button:text("Throw Uncaught Error")');
    await delay(1500);

    const newOutput = serverOutput.slice(outputLengthBefore).join('\n');
    expect(newOutput).toContain('Uncaught error from button click');
    expect(newOutput).toMatch(/error/i);
    // Stack trace should be present
    expect(newOutput).toMatch(/at\s+\w+/); // Stack trace pattern
  });

  test('should forward promise rejections', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    page.on('pageerror', error => {
      console.log('Expected promise rejection:', error.message);
    });

    const outputLengthBefore = serverOutput.length;

    await page.click('button:text("Promise Rejection")');
    await delay(1500);

    const newOutput = serverOutput.slice(outputLengthBefore).join('\n');
    expect(newOutput).toContain('Unhandled promise rejection');
  });

  test('should include module context in forwarded messages', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    const outputLengthBefore = serverOutput.length;

    // Test multiple console methods
    await page.click('button:text("console.log()")');
    await delay(500);
    await page.click('button:text("console.warn()")');
    await delay(500);
    await page.click('button:text("console.error()")');
    await delay(500);

    const newOutput = serverOutput.slice(outputLengthBefore).join('\n');
    
    // Should include module context (e.g., [index.html])
    expect(newOutput).toMatch(/\[index\.html\]/);
  });

  test('should handle complex objects in console messages', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    const outputLengthBefore = serverOutput.length;

    await page.click('button:text("Complex Objects")');
    await delay(1000);

    const newOutput = serverOutput.slice(outputLengthBefore).join('\n');
    expect(newOutput).toContain('Complex object');
    // Should show object properties
    expect(newOutput).toMatch(/string.*text/);
    expect(newOutput).toMatch(/number.*42/);
  });

  test('should handle rapid logging without loss', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    const outputLengthBefore = serverOutput.length;

    await page.click('button:text("Rapid Logging")');
    await delay(3000); // Give time for all logs

    const newOutput = serverOutput.slice(outputLengthBefore).join('\n');
    
    // Should contain multiple rapid log entries
    expect(newOutput).toContain('Starting rapid logging test');
    expect(newOutput).toContain('Completed 100 logs');
    
    // Check that at least some of the numbered logs appear
    expect(newOutput).toMatch(/Rapid log #\d+/);
  });

  test('should forward errors from different contexts', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');

    page.on('pageerror', error => {
      console.log('Expected context error:', error.message);
    });

    const outputLengthBefore = serverOutput.length;

    // Test eval context
    await page.click('button:text("Eval Context")');
    await delay(1000);

    const newOutput = serverOutput.slice(outputLengthBefore).join('\n');
    expect(newOutput).toContain('Message from eval context');
    expect(newOutput).toContain('Eval error');
  });

  test('should show initialization message on load', async ({ page }) => {
    // Check that the plugin shows initial messages
    const fullOutput = serverOutput.join('\n');
    
    // Should see Vite server messages
    expect(fullOutput).toMatch(/VITE.*ready/i);
    
    // Navigate to page
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    await delay(1000);

    // Should see the auto-test messages from page load
    const recentOutput = serverOutput.slice(-20).join('\n');
    expect(recentOutput).toContain('Console Forward Plugin Test Suite loaded successfully');
  });
});