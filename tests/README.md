# Console Forward Plugin Test Suite

This directory contains comprehensive Playwright tests for the Vite Console Forward Plugin.

## Test Structure

- `console-forward.spec.ts` - Main test suite covering all plugin features
- `server-output.spec.ts` - Tests specifically for server terminal output capture
- `test-utils.ts` - Utility functions and classes for test support

## Test Coverage

### Basic Console Methods
- ✅ console.log()
- ✅ console.warn()
- ✅ console.error()
- ✅ console.info()
- ✅ console.debug()
- ✅ console.trace()

### Error Forwarding
- ✅ Uncaught exceptions
- ✅ Promise rejections
- ✅ TypeError
- ✅ RangeError
- ✅ ReferenceError
- ✅ Async function errors
- ✅ Timeout errors
- ✅ Event handler errors

### Complex Scenarios
- ✅ Nested try-catch blocks
- ✅ Multiple arguments
- ✅ Complex objects
- ✅ Circular references
- ✅ Deep object nesting
- ✅ Large payloads

### Module Context Tracking
- ✅ Inline scripts
- ✅ Module scripts
- ✅ Dynamic imports
- ✅ Eval context
- ✅ Function constructor
- ✅ Web Workers (when supported)

### Performance Tests
- ✅ Rapid logging (100 messages)
- ✅ Large payloads (1000 items)
- ✅ Deep nesting (50 levels)
- ✅ Multiple errors (10 sequential)
- ✅ Memory intensive operations
- ✅ Benchmark (1000 iterations)

## Running Tests

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests in headed mode (see browser)
npm run test:headed

# Debug tests
npm run test:debug

# View test report
npm run test:report
```

## Test Configuration

Tests run against the local dev server on http://localhost:5173. The Playwright configuration:
- Runs tests in Chromium, Firefox, and WebKit
- Automatically starts the dev server
- Captures screenshots on failure
- Records videos on failure
- Generates trace files for debugging

## Writing New Tests

1. Add tests to existing spec files or create new ones
2. Use the `ConsoleCapture` utility for capturing console output
3. Follow the existing pattern of:
   - Set up the capture
   - Navigate to the test page
   - Perform actions
   - Assert on captured output

Example:
```typescript
test('should forward custom messages', async ({ page }) => {
  const capture = new ConsoleCapture();
  capture.attachToPage(page);
  
  await page.goto('/');
  await page.click('button:text("Test Button")');
  await delay(500);
  
  const logs = capture.getMessages('log');
  expect(logs.some(m => m.text.includes('Expected message'))).toBeTruthy();
});
```

## CI/CD Integration

These tests can be integrated into CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Install dependencies
  run: npm ci
  
- name: Install Playwright browsers
  run: npx playwright install
  
- name: Run tests
  run: npm test
  
- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Troubleshooting

### Tests fail to start
- Ensure port 5173 is available
- Check that dependencies are installed: `npm install`
- Install Playwright browsers: `npx playwright install`

### Server doesn't start
- Check for port conflicts
- Ensure Vite configuration is correct
- Try running `npm run dev` manually first

### Console messages not captured
- Check that the plugin is enabled in vite.config.ts
- Verify error forwarding is enabled (forwardErrors: true)
- Check browser console for errors

### Flaky tests
- Increase delay times for async operations
- Use proper wait conditions instead of fixed delays
- Check for race conditions in error handling