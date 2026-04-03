import { test, expect } from '@playwright/test';

test.describe('NOTE Application', () => {
  test('should load homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/NOTE/);
  });

  test('should navigate to dashboard', async ({ page }) => {
    await page.goto('/');
    await page.click('text=进入应用');
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('should create a new note', async ({ page }) => {
    await page.goto('/dashboard');

    // Click create note button
    await page.click('[data-testid="create-note"]');

    // Fill note title and content
    await page.fill('[data-testid="note-title"]', 'Test Note');
    await page.fill('[data-testid="note-content"]', 'This is a test note content.');

    // Save note
    await page.click('[data-testid="save-note"]');

    // Verify note appears in list
    await expect(page.locator('text=Test Note')).toBeVisible();
  });

  test('should search notes', async ({ page }) => {
    await page.goto('/dashboard');

    // Type in search box
    await page.fill('[data-testid="search-input"]', 'test');

    // Verify search results
    await expect(page.locator('text=Test Note')).toBeVisible();
  });

  test('should navigate to privacy page', async ({ page }) => {
    await page.goto('/');
    await page.click('text=隐私政策');
    await expect(page).toHaveURL(/.*privacy/);
  });

  test('should navigate to terms page', async ({ page }) => {
    await page.goto('/');
    await page.click('text=使用条款');
    await expect(page).toHaveURL(/.*terms/);
  });
});
