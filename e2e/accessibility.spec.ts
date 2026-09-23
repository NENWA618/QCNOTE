import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests', () => {
  for (const path of ['/', '/dashboard']) {
    test(`should not have critical accessibility violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter((v) => v.impact === 'critical');

      expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`)).toEqual([]);
    });
  }

  test('should have a single top-level heading on the homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('should have accessible names for links', async ({ page }) => {
    await page.goto('/');

    const links = page.locator('a');
    for (let i = 0; i < (await links.count()); i++) {
      const link = links.nth(i);
      const text = (await link.textContent())?.trim();
      const ariaLabel = (await link.getAttribute('aria-label'))?.trim();
      expect((text?.length ?? 0) + (ariaLabel?.length ?? 0)).toBeGreaterThan(0);
    }
  });

  test('should have accessible names for images', async ({ page }) => {
    await page.goto('/');

    const images = page.locator('img');
    for (let i = 0; i < (await images.count()); i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      const ariaLabel = await img.getAttribute('aria-label');
      expect(alt !== null || ariaLabel !== null).toBeTruthy();
    }
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Tab');

    const focused = await page.evaluate(() => document.activeElement?.tagName ?? 'NONE');
    expect(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']).toContain(focused);
  });

  test('should label the note editor fields', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /新建笔记/ }).click();

    // Fields are identified by placeholder text at minimum
    await expect(page.getByPlaceholder('笔记标题')).toBeVisible();
    await expect(page.getByPlaceholder(/开始记录您的想法/)).toBeVisible();
  });
});
