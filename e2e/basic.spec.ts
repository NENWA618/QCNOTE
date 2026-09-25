import { test, expect } from '@playwright/test';

test.describe('QCNOTE Application', () => {
  test('should load homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/QCNOTE/);
    await expect(page.locator('h1')).toHaveText('QCNOTE');
  });

  test('should navigate to dashboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: '开始记录' }).click();
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('should navigate to privacy page', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: '隐私政策' }).click();
    await expect(page).toHaveURL(/.*privacy/);
  });

  test('should navigate to terms page', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: '使用条款' }).click();
    await expect(page).toHaveURL(/.*terms/);
  });
});

test.describe('Dashboard', () => {
  test('should show the note management view', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: '笔记管理' })).toBeVisible();
    await expect(page.getByRole('button', { name: /新建笔记/ })).toBeVisible();
    await expect(page.getByPlaceholder('搜索笔记...')).toBeVisible();
  });

  test('should open the editor when creating a note', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /新建笔记/ }).click();

    await expect(page.getByPlaceholder('笔记标题')).toBeVisible();
    await expect(page.getByPlaceholder(/开始记录您的想法/)).toBeVisible();
    await expect(page.getByPlaceholder(/标签1/)).toBeVisible();
  });

  test('should accept title, content and tags in the editor', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /新建笔记/ }).click();

    const title = page.getByPlaceholder('笔记标题');
    const content = page.getByPlaceholder(/开始记录您的想法/);
    const tags = page.getByPlaceholder(/标签1/);

    await title.fill('Test Note');
    await content.fill('This is a test note content.');
    await tags.fill('test, important');

    await expect(title).toHaveValue('Test Note');
    await expect(content).toHaveValue('This is a test note content.');
    await expect(tags).toHaveValue('test, important');
  });

  test('should switch between dashboard views', async ({ page }) => {
    await page.goto('/dashboard');

    for (const name of [/日历/, /时间线/, /列表/]) {
      const button = page.getByRole('button', { name });
      await button.click();
      await expect(button).toBeVisible();
    }
  });

  test('should open the trash view', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: '更多' }).click();
    await page.getByRole('menuitem', { name: /回收站/ }).click();
    await expect(page.getByText('回收站是空的')).toBeVisible();
  });

  test('should keep the page usable when typing in the search box', async ({ page }) => {
    await page.goto('/dashboard');
    const search = page.getByPlaceholder('搜索笔记...');
    await search.fill('test');
    await expect(search).toHaveValue('test');
  });
});
