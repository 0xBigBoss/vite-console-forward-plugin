import { test, expect, Page } from '@playwright/test';
import { ConsoleCapture, delay } from './test-utils';

test.describe('Console Forward Plugin Tests', () => {
  let capture: ConsoleCapture;
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    capture = new ConsoleCapture();
    page = testPage;
    capture.attachToPage(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    capture.clear();
  });

  test.describe('Basic Console Methods', () => {
    test('should forward console.log messages', async () => {
      await page.click('button:text("console.log()")');
      await delay(500);

      const messages = capture.getMessages('log');
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some(m => m.text.includes('Standard log message'))).toBeTruthy();
    });

    test('should forward console.warn messages', async () => {
      await page.click('button:text("console.warn()")');
      await delay(500);

      const warnings = capture.getMessages('warn');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(m => m.text.includes('Warning message'))).toBeTruthy();
    });

    test('should forward console.error messages', async () => {
      await page.click('button:text("console.error()")');
      await delay(500);

      const errors = capture.getMessages('error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(m => m.text.includes('Error message'))).toBeTruthy();
    });

    test('should forward console.info messages', async () => {
      await page.click('button:text("console.info()")');
      await delay(500);

      const infos = capture.getMessages('info');
      expect(infos.length).toBeGreaterThan(0);
      expect(infos.some(m => m.text.includes('Info message'))).toBeTruthy();
    });

    test('should forward console.debug messages', async () => {
      await page.click('button:text("console.debug()")');
      await delay(500);

      const debugs = capture.getMessages('debug');
      expect(debugs.length).toBeGreaterThan(0);
      expect(debugs.some(m => m.text.includes('Debug message'))).toBeTruthy();
    });
  });

  test.describe('Error Forwarding', () => {
    test('should forward uncaught errors', async () => {
      // Click the button that throws an uncaught error
      page.on('pageerror', error => {
        // Expected error, don't fail the test
        console.log('Expected error caught:', error.message);
      });

      await page.click('button:text("Throw Uncaught Error")');
      await delay(500);

      const errors = capture.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('Uncaught error from button click'))).toBeTruthy();
    });

    test('should forward TypeError', async () => {
      page.on('pageerror', error => {
        console.log('Expected TypeError:', error.message);
      });

      await page.click('button:text("Throw TypeError")');
      await delay(500);

      const errors = capture.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('Cannot read')));
    });

    test('should forward RangeError', async () => {
      page.on('pageerror', error => {
        console.log('Expected RangeError:', error.message);
      });

      await page.click('button:text("Throw RangeError")');
      await delay(500);

      const errors = capture.getErrors();
      expect(errors.length).toBeGreaterThan(0);
    });

    test('should forward ReferenceError', async () => {
      page.on('pageerror', error => {
        console.log('Expected ReferenceError:', error.message);
      });

      await page.click('button:text("Throw ReferenceError")');
      await delay(500);

      const errors = capture.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('not defined'))).toBeTruthy();
    });

    test('should forward promise rejections', async () => {
      page.on('pageerror', error => {
        console.log('Expected promise rejection:', error.message);
      });

      await page.click('button:text("Promise Rejection")');
      await delay(500);

      const errors = capture.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('Unhandled promise rejection'))).toBeTruthy();
    });

    test('should forward async errors', async () => {
      page.on('pageerror', error => {
        console.log('Expected async error:', error.message);
      });

      await page.click('button:text("Async Error")');
      await delay(1000); // Async errors need more time

      const errors = capture.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('Error from async function'))).toBeTruthy();
    });
  });

  test.describe('Complex Scenarios', () => {
    test('should handle nested errors', async () => {
      await page.click('button:text("Nested Try-Catch")');
      await delay(500);

      const errors = capture.getMessages('error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(m => m.text.includes('Caught inner'))).toBeTruthy();
      expect(errors.some(m => m.text.includes('Caught outer'))).toBeTruthy();
    });

    test('should handle multiple arguments', async () => {
      await page.click('button:text("Multiple Arguments")');
      await delay(500);

      const logs = capture.getMessages('log');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(m => m.text.includes('Multiple arguments'))).toBeTruthy();
    });

    test('should handle complex objects', async () => {
      await page.click('button:text("Complex Objects")');
      await delay(500);

      const logs = capture.getMessages('log');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(m => m.text.includes('Complex object'))).toBeTruthy();
    });

    test('should handle circular references', async () => {
      await page.click('button:text("Circular Reference")');
      await delay(500);

      const logs = capture.getMessages('log');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(m => m.text.includes('Circular reference'))).toBeTruthy();
    });

    test('should handle timeout errors', async () => {
      page.on('pageerror', error => {
        console.log('Expected timeout error:', error.message);
      });

      await page.click('button:text("Timeout Error")');
      await delay(1500); // Wait for timeout

      const errors = capture.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('Error from setTimeout'))).toBeTruthy();
    });

    test('should handle event handler errors', async () => {
      page.on('pageerror', error => {
        console.log('Expected event error:', error.message);
      });

      await page.click('button:text("Event Handler Error")');
      await delay(500);

      const errors = capture.getErrors();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.message.includes('Error from event handler'))).toBeTruthy();
    });
  });

  test.describe('Module Context', () => {
    test('should track inline script context', async () => {
      await page.click('button:text("Inline Script")');
      await delay(500);

      const logs = capture.getMessages('log');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(m => m.text.includes('inline script context'))).toBeTruthy();
    });

    test('should track module script context', async () => {
      await page.click('button:text("Module Script")');
      await delay(500);

      const logs = capture.getMessages('log');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(m => m.text.includes('module script context'))).toBeTruthy();
    });

    test('should handle dynamic import errors', async () => {
      await page.click('button:text("Dynamic Import")');
      await delay(500);

      const errors = capture.getMessages('error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(m => m.text.includes('Dynamic import error'))).toBeTruthy();
    });

    test('should handle eval context', async () => {
      await page.click('button:text("Eval Context")');
      await delay(500);

      const logs = capture.getMessages('log');
      const errors = capture.getMessages('error');
      
      expect(logs.some(m => m.text.includes('Message from eval context'))).toBeTruthy();
      expect(errors.some(m => m.text.includes('Eval error'))).toBeTruthy();
    });

    test('should handle Function constructor', async () => {
      await page.click('button:text("Function Constructor")');
      await delay(500);

      const logs = capture.getMessages('log');
      const errors = capture.getMessages('error');
      
      expect(logs.some(m => m.text.includes('Message from Function constructor'))).toBeTruthy();
      expect(errors.some(m => m.text.includes('Function constructor error'))).toBeTruthy();
    });
  });

  test.describe('Performance Tests', () => {
    test('should handle rapid logging', async () => {
      await page.click('button:text("Rapid Logging")');
      await delay(2000); // Give time for all logs

      const logs = capture.getMessages('log');
      expect(logs.length).toBeGreaterThan(50); // At least half the logs
      expect(logs.some(m => m.text.includes('Completed 100 logs'))).toBeTruthy();
    });

    test('should handle large payloads', async () => {
      await page.click('button:text("Large Payload")');
      await delay(1000);

      const logs = capture.getMessages('log');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(m => m.text.includes('Large payload'))).toBeTruthy();
    });

    test('should handle deep nesting', async () => {
      await page.click('button:text("Deep Object Nesting")');
      await delay(1000);

      const logs = capture.getMessages('log');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(m => m.text.includes('Deeply nested object'))).toBeTruthy();
    });

    test('should handle many errors', async () => {
      page.on('pageerror', error => {
        console.log('Expected multiple errors:', error.message);
      });

      await page.click('button:text("Many Errors")');
      await delay(2000); // Wait for all errors

      const errors = capture.getErrors();
      expect(errors.length).toBeGreaterThan(5); // At least half the errors
    });

    test('should complete benchmark', async () => {
      await page.click('button:text("Benchmark")');
      await delay(5000); // Give time for benchmark

      const logs = capture.getMessages('log');
      expect(logs.some(m => m.text.includes('Benchmark complete'))).toBeTruthy();
      expect(logs.some(m => m.text.includes('ops/sec'))).toBeTruthy();
    });
  });

  test.describe('UI Controls', () => {
    test('should clear local output', async () => {
      // Generate some logs first
      await page.click('button:text("console.log()")');
      await delay(500);

      // Clear output
      await page.click('button:text("Clear Output")');
      await delay(500);

      // Check for clear message
      const logs = capture.getMessages('log');
      expect(logs.some(m => m.text.includes('Local output cleared'))).toBeTruthy();
    });

    test('should toggle local logging', async () => {
      await page.click('button:text("Toggle Local Logging")');
      await delay(500);

      const logs = capture.getMessages('log');
      expect(logs.some(m => m.text.includes('Local logging'))).toBeTruthy();
    });

    test('should run all tests', async () => {
      await page.click('button:text("Run All Tests")');
      await delay(3000); // Give time for all tests

      const logs = capture.getMessages('log');
      expect(logs.some(m => m.text.includes('Running all tests'))).toBeTruthy();
      expect(logs.some(m => m.text.includes('All tests completed'))).toBeTruthy();
    });
  });

  test.describe('Visual Elements', () => {
    test('should display test page correctly', async () => {
      // Check main heading
      const heading = await page.locator('h1');
      await expect(heading).toContainText('Console Forward Plugin Test Suite');

      // Check plugin status badge
      const badge = await page.locator('#pluginStatus');
      await expect(badge).toContainText('Plugin Active');

      // Check test sections are present
      const sections = await page.locator('.test-section');
      expect(await sections.count()).toBeGreaterThan(4);
    });

    test('should show local output monitor', async () => {
      const outputSection = await page.locator('#localOutput');
      await expect(outputSection).toBeVisible();

      // Generate a log
      await page.click('button:text("console.log()")');
      await delay(500);

      // Check log appears in output
      const logEntries = await page.locator('.log-entry');
      expect(await logEntries.count()).toBeGreaterThan(0);
    });
  });
});