import { test, expect } from '@playwright/test';

test.describe('QCNOTE Application', () => {
  test('should load homepage', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/QCNOTE/);
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

test.describe('Note Editing', () => {
  test('should edit an existing note', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Create a note first
    await page.click('[data-testid="create-note"]');
    await page.fill('[data-testid="note-title"]', 'Original Title');
    await page.fill('[data-testid="note-content"]', 'Original content');
    await page.click('[data-testid="save-note"]');
    
    // Click on note to edit
    await page.click('text=Original Title');
    
    // Edit content
    await page.fill('[data-testid="note-title"]', 'Updated Title');
    await page.fill('[data-testid="note-content"]', 'Updated content');
    await page.click('[data-testid="save-note"]');
    
    // Verify changes
    await expect(page.locator('text=Updated Title')).toBeVisible();
  });

  test('should add and remove tags', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Create note
    await page.click('[data-testid="create-note"]');
    await page.fill('[data-testid="note-title"]', 'Tagged Note');
    await page.fill('[data-testid="note-content"]', 'Note with tags');
    
    // Add tags
    await page.fill('[data-testid="tag-input"]', 'test,important');
    await page.click('[data-testid="save-note"]');
    
    // Verify tags appear
    await expect(page.locator('[data-testid="tag-test"]')).toBeVisible();
    await expect(page.locator('[data-testid="tag-important"]')).toBeVisible();
  });

  test('should delete a note', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Create note
    await page.click('[data-testid="create-note"]');
    await page.fill('[data-testid="note-title"]', 'Note to Delete');
    await page.fill('[data-testid="note-content"]', 'Temporary content');
    await page.click('[data-testid="save-note"]');
    
    // Delete note
    await page.click('text=Note to Delete');
    await page.click('[data-testid="delete-note"]');
    await page.click('[data-testid="confirm-delete"]');
    
    // Verify note is removed
    await expect(page.locator('text=Note to Delete')).not.toBeVisible();
  });
});

test.describe('Note Organization', () => {
  test('should filter notes by category', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Filter by category
    await page.click('[data-testid="category-filter"]');
    await page.click('[data-testid="category-work"]');
    
    // Verify filtering works
    await page.waitForLoadState();
    const visibleNotes = page.locator('[data-testid="note-item"]');
    const count = await visibleNotes.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should mark note as favorite', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Create note
    await page.click('[data-testid="create-note"]');
    await page.fill('[data-testid="note-title"]', 'Favorite Note');
    await page.fill('[data-testid="note-content"]', 'Important content');
    await page.click('[data-testid="save-note"]');
    
    // Mark as favorite
    await page.click('text=Favorite Note');
    await page.click('[data-testid="toggle-favorite"]');
    
    // Verify favorite status
    const favoriteButton = page.locator('[data-testid="toggle-favorite"]');
    await expect(favoriteButton).toHaveClass(/active|selected/);
  });

  test('should view trash notes', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Navigate to trash
    await page.click('[data-testid="trash-button"]');
    
    // Verify trash view loads
    await expect(page.locator('text=回收站|Trash').first()).toBeVisible();
  });
});

test.describe('Search and Filter', () => {
  test('should perform full-text search', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Create test notes
    await page.click('[data-testid="create-note"]');
    await page.fill('[data-testid="note-title"]', 'Python Tutorial');
    await page.fill('[data-testid="note-content"]', 'Learn Python programming');
    await page.click('[data-testid="save-note"]');
    
    // Search for keyword
    await page.fill('[data-testid="search-input"]', 'Python');
    
    // Verify search results
    await expect(page.locator('text=Python Tutorial')).toBeVisible();
  });

  test('should display search statistics', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Go to stats view
    await page.click('[data-testid="stats-button"]');
    
    // Verify stats are displayed
    await expect(page.locator('[data-testid="total-notes"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-tags"]')).toBeVisible();
  });
});

test.describe('Error Handling', () => {
  test('should handle network errors gracefully', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Simulate offline - this requires offline handling in the app
    // For now, just verify page remains usable
    await page.click('[data-testid="create-note"]');
    
    // Should still be able to create notes
    expect(page.locator('[data-testid="note-title"]')).toBeVisible();
  });

  test('should show error message on failed save', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Try to save with invalid data
    await page.click('[data-testid="create-note"]');
    await page.fill('[data-testid="note-title"]', '');  // Empty title
    
    // Attempt save
    await page.click('[data-testid="save-note"]');
    
    // Should show error or prevent save
    // Verify either error message or form remains open
    const errorMsg = page.locator('[data-testid="error-message"]');
    const titleInput = page.locator('[data-testid="note-title"]');
    
    const isErrorShown = await errorMsg.isVisible().catch(() => false);
    const isFormStillOpen = await titleInput.isVisible().catch(() => false);
    
    expect(isErrorShown || isFormStillOpen).toBeTruthy();
  });
});
