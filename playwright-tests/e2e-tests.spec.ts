import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173'; // Frontend URL
const API_URL = 'http://localhost:5000/api'; // Backend URL

// Test credentials
const TEST_USER = {
  email: 'abaza@mjd.com',
  password: 'abaza123',
  name: 'Ahmed Abaza'
};

// Test data
const TEST_EXCEL_FILE = 'C:\\Users\\abaza\\Downloads\\TESTFILE.xlsx';
const PRICE_LIST_FILE = 'C:\\Users\\abaza\\Downloads\\MJD-PRICELIST.xlsx';

test.describe('BOQ Matching System - Comprehensive E2E Tests', () => {
  let page: Page;
  let authToken: string;

  test.beforeAll(async ({ browser }) => {
    // Create a new browser context
    const context = await browser.newContext();
    page = await context.newPage();
    
    // Login and get auth token
    const loginResponse = await page.request.post(`${API_URL}/auth/login`, {
      data: TEST_USER
    });
    
    const loginData = await loginResponse.json();
    authToken = loginData.accessToken;
    
    // Set auth token in localStorage
    await page.goto(BASE_URL);
    await page.evaluate((token) => {
      localStorage.setItem('accessToken', token);
    }, authToken);
  });

  test.describe('Authentication Tests', () => {
    test('Should login successfully', async () => {
      await page.goto(`${BASE_URL}/login`);
      
      await page.fill('input[type="email"]', TEST_USER.email);
      await page.fill('input[type="password"]', TEST_USER.password);
      await page.click('button[type="submit"]');
      
      await expect(page).toHaveURL(`${BASE_URL}/dashboard`);
      await expect(page.locator('text=' + TEST_USER.name)).toBeVisible();
    });

    test('Should handle invalid credentials', async () => {
      await page.goto(`${BASE_URL}/login`);
      
      await page.fill('input[type="email"]', 'invalid@email.com');
      await page.fill('input[type="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      
      await expect(page.locator('text=/Invalid credentials|Authentication failed/i')).toBeVisible();
    });

    test('Should logout successfully', async () => {
      await page.goto(`${BASE_URL}/dashboard`);
      await page.click('button:has-text("Logout")');
      
      await expect(page).toHaveURL(`${BASE_URL}/login`);
    });
  });

  test.describe('File Upload and Processing', () => {
    test('Should upload BOQ file and start processing', async () => {
      await page.goto(`${BASE_URL}/upload`);
      
      // Upload file
      const fileInput = await page.locator('input[type="file"]');
      await fileInput.setInputFiles(TEST_EXCEL_FILE);
      
      // Select matching method
      await page.selectOption('select[name="matchingMethod"]', 'LOCAL');
      
      // Enter project name
      await page.fill('input[name="projectName"]', 'E2E Test Project');
      
      // Submit
      await page.click('button:has-text("Upload and Process")');
      
      // Wait for job to be created
      await expect(page.locator('text=/Job created|Processing started/i')).toBeVisible({ timeout: 10000 });
      
      // Verify job appears in list
      await page.goto(`${BASE_URL}/jobs`);
      await expect(page.locator('text=E2E Test Project')).toBeVisible();
    });

    test('Should show live progress during processing', async () => {
      await page.goto(`${BASE_URL}/jobs`);
      
      // Click on a job to view details
      await page.click('text=E2E Test Project');
      
      // Check for progress indicators
      await expect(page.locator('[role="progressbar"]')).toBeVisible();
      await expect(page.locator('text=/Processing|In Progress/i')).toBeVisible();
      
      // Wait for completion (with timeout)
      await expect(page.locator('text=/Completed|Finished/i')).toBeVisible({ timeout: 60000 });
    });

    test('Should handle different matching methods', async () => {
      const methods = ['LOCAL', 'COHERE', 'OPENAI', 'COHERE_RERANK', 'QWEN', 'QWEN_RERANK'];
      
      for (const method of methods.slice(0, 2)) { // Test first 2 methods to avoid rate limits
        await page.goto(`${BASE_URL}/upload`);
        
        const fileInput = await page.locator('input[type="file"]');
        await fileInput.setInputFiles(TEST_EXCEL_FILE);
        
        await page.selectOption('select[name="matchingMethod"]', method);
        await page.fill('input[name="projectName"]', `Test ${method}`);
        await page.click('button:has-text("Upload and Process")');
        
        await expect(page.locator('text=/Job created|Processing started/i')).toBeVisible({ timeout: 10000 });
      }
    });
  });

  test.describe('Price List Management', () => {
    test('Should upload and map price list', async () => {
      await page.goto(`${BASE_URL}/price-lists`);
      
      // Open upload modal
      await page.click('button:has-text("Upload Price List")');
      
      // Upload file
      const fileInput = await page.locator('input[type="file"]');
      await fileInput.setInputFiles(PRICE_LIST_FILE);
      
      // Enter price list name
      await page.fill('input[name="priceListName"]', 'MJD Master Price List - E2E Test');
      
      // Submit
      await page.click('button:has-text("Upload")');
      
      // Wait for processing
      await expect(page.locator('text=/Mapped successfully|Upload complete/i')).toBeVisible({ timeout: 30000 });
    });

    test('Should display mapping statistics', async () => {
      await page.goto(`${BASE_URL}/price-lists`);
      
      // Click on a price list
      await page.click('text=MJD Master Price List');
      
      // Check for statistics
      await expect(page.locator('text=Total Mappings')).toBeVisible();
      await expect(page.locator('text=Verified')).toBeVisible();
      await expect(page.locator('text=Confidence Distribution')).toBeVisible();
    });

    test('Should allow mapping verification', async () => {
      await page.goto(`${BASE_URL}/price-lists`);
      
      // Open mapping modal
      await page.click('text=MJD Master Price List');
      await page.click('button:has-text("Review Mappings")');
      
      // Go to review tab
      await page.click('text=Review');
      
      // Verify a mapping
      const firstUnverifiedMapping = page.locator('[data-verified="false"]').first();
      if (await firstUnverifiedMapping.count() > 0) {
        await firstUnverifiedMapping.locator('button:has-text("Verify")').click();
        await expect(page.locator('text=/Verified successfully|Mapping updated/i')).toBeVisible();
      }
    });

    test('Should sync rates from Excel', async () => {
      await page.goto(`${BASE_URL}/price-lists`);
      
      await page.click('text=MJD Master Price List');
      await page.click('tab:has-text("Sync")');
      
      // Trigger sync
      await page.click('button:has-text("Sync from Excel")');
      
      await expect(page.locator('text=/Sync completed|Rates updated/i')).toBeVisible({ timeout: 30000 });
    });

    test('Should export to Excel', async () => {
      await page.goto(`${BASE_URL}/price-lists`);
      
      await page.click('text=MJD Master Price List');
      await page.click('tab:has-text("Sync")');
      
      // Start download
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('button:has-text("Export to Excel")')
      ]);
      
      // Verify download
      expect(download.suggestedFilename()).toContain('MJD-PRICELIST');
      expect(download.suggestedFilename()).toContain('.xlsx');
    });
  });

  test.describe('Search and Filter Functionality', () => {
    test('Should search price items', async () => {
      await page.goto(`${BASE_URL}/price-list`);
      
      // Search for specific item
      await page.fill('input[placeholder*="Search"]', 'concrete');
      await page.press('input[placeholder*="Search"]', 'Enter');
      
      // Verify results
      await expect(page.locator('text=/concrete/i')).toBeVisible();
      await expect(page.locator('[data-testid="price-item"]')).toHaveCount(await page.locator('[data-testid="price-item"]:has-text(/concrete/i)').count());
    });

    test('Should filter by category', async () => {
      await page.goto(`${BASE_URL}/price-list`);
      
      // Select category
      await page.selectOption('select[name="category"]', 'Groundworks');
      
      // Verify filtered results
      await expect(page.locator('text=Groundworks')).toBeVisible();
    });

    test('Should filter by confidence level', async () => {
      await page.goto(`${BASE_URL}/jobs`);
      
      await page.click('text=E2E Test Project');
      
      // Filter by high confidence
      await page.selectOption('select[name="confidence"]', 'high');
      
      // Verify filtered results
      const items = await page.locator('[data-confidence="high"]').count();
      expect(items).toBeGreaterThan(0);
    });
  });

  test.describe('Real-time Updates', () => {
    test('Should show real-time job progress', async () => {
      // Start a new job
      await page.goto(`${BASE_URL}/upload`);
      
      const fileInput = await page.locator('input[type="file"]');
      await fileInput.setInputFiles(TEST_EXCEL_FILE);
      
      await page.selectOption('select[name="matchingMethod"]', 'LOCAL');
      await page.fill('input[name="projectName"]', 'Real-time Test');
      await page.click('button:has-text("Upload and Process")');
      
      // Navigate to job details
      await page.goto(`${BASE_URL}/jobs`);
      await page.click('text=Real-time Test');
      
      // Check for live updates
      const initialProgress = await page.locator('[role="progressbar"]').getAttribute('aria-valuenow');
      
      // Wait for progress change
      await page.waitForFunction(
        (initial) => {
          const current = document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow');
          return current !== initial;
        },
        initialProgress,
        { timeout: 30000 }
      );
      
      const updatedProgress = await page.locator('[role="progressbar"]').getAttribute('aria-valuenow');
      expect(Number(updatedProgress)).toBeGreaterThan(Number(initialProgress));
    });

    test('Should show live logs', async () => {
      await page.goto(`${BASE_URL}/jobs`);
      await page.click('text=Real-time Test');
      
      // Check for log entries
      await expect(page.locator('[data-testid="log-entry"]')).toHaveCount(count => count > 0);
      
      // Wait for new log entry
      const initialLogCount = await page.locator('[data-testid="log-entry"]').count();
      
      await page.waitForFunction(
        (initial) => {
          const current = document.querySelectorAll('[data-testid="log-entry"]').length;
          return current > initial;
        },
        initialLogCount,
        { timeout: 30000 }
      );
    });
  });

  test.describe('Error Handling', () => {
    test('Should handle network errors gracefully', async () => {
      // Simulate network error
      await page.route('**/api/**', route => route.abort());
      
      await page.goto(`${BASE_URL}/price-list`);
      
      await expect(page.locator('text=/Error|Failed to load|Network error/i')).toBeVisible();
      
      // Restore network
      await page.unroute('**/api/**');
    });

    test('Should handle invalid file formats', async () => {
      await page.goto(`${BASE_URL}/upload`);
      
      // Try to upload invalid file
      const fileInput = await page.locator('input[type="file"]');
      await fileInput.setInputFiles('package.json'); // Wrong file type
      
      await expect(page.locator('text=/Invalid file|Only Excel files/i')).toBeVisible();
    });

    test('Should handle session expiry', async () => {
      // Clear auth token
      await page.evaluate(() => {
        localStorage.removeItem('accessToken');
      });
      
      // Try to access protected route
      await page.goto(`${BASE_URL}/dashboard`);
      
      // Should redirect to login
      await expect(page).toHaveURL(`${BASE_URL}/login`);
    });
  });

  test.describe('Performance Tests', () => {
    test('Should load dashboard within 3 seconds', async () => {
      const startTime = Date.now();
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;
      
      expect(loadTime).toBeLessThan(3000);
    });

    test('Should handle large file uploads', async () => {
      await page.goto(`${BASE_URL}/upload`);
      
      // Set timeout for large file
      page.setDefaultTimeout(120000);
      
      const fileInput = await page.locator('input[type="file"]');
      await fileInput.setInputFiles(PRICE_LIST_FILE); // Large file with 9000+ items
      
      await page.selectOption('select[name="matchingMethod"]', 'LOCAL');
      await page.fill('input[name="projectName"]', 'Large File Test');
      await page.click('button:has-text("Upload and Process")');
      
      await expect(page.locator('text=/Job created|Processing started/i')).toBeVisible({ timeout: 60000 });
    });
  });

  test.describe('Accessibility Tests', () => {
    test('Should have proper ARIA labels', async () => {
      await page.goto(`${BASE_URL}/dashboard`);
      
      // Check for ARIA labels
      await expect(page.locator('[aria-label]')).toHaveCount(count => count > 0);
      await expect(page.locator('[role="button"]')).toHaveCount(count => count > 0);
      await expect(page.locator('[role="navigation"]')).toBeVisible();
    });

    test('Should be keyboard navigable', async () => {
      await page.goto(`${BASE_URL}/dashboard`);
      
      // Tab through elements
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus')).toBeVisible();
      
      await page.keyboard.press('Tab');
      await expect(page.locator(':focus')).toBeVisible();
      
      // Activate button with Enter
      await page.keyboard.press('Enter');
    });
  });

  test.afterAll(async () => {
    await page.close();
  });
});

test.describe('API Integration Tests', () => {
  test('Should handle concurrent job processing', async ({ request }) => {
    const jobs = [];
    
    // Create multiple jobs concurrently
    for (let i = 0; i < 3; i++) {
      jobs.push(
        request.post(`${API_URL}/price-matching/upload`, {
          headers: { Authorization: `Bearer ${authToken}` },
          multipart: {
            file: {
              name: 'test.xlsx',
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              buffer: Buffer.from('test data')
            },
            matchingMethod: 'LOCAL',
            projectName: `Concurrent Test ${i}`
          }
        })
      );
    }
    
    const responses = await Promise.all(jobs);
    
    for (const response of responses) {
      expect(response.status()).toBe(200);
    }
  });

  test('Should respect rate limits', async ({ request }) => {
    const requests = [];
    
    // Send many requests quickly
    for (let i = 0; i < 20; i++) {
      requests.push(
        request.get(`${API_URL}/price-list`, {
          headers: { Authorization: `Bearer ${authToken}` }
        })
      );
    }
    
    const responses = await Promise.all(requests);
    
    // Check if any were rate limited
    const rateLimited = responses.filter(r => r.status() === 429);
    expect(rateLimited.length).toBeLessThanOrEqual(10); // Some rate limiting is OK
  });
});