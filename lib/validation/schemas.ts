import { z } from 'zod';

// Admin stats query schema (for future pagination)
export const adminStatsQuerySchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
});

// General admin request validation
export const adminRequestSchema = z.object({
  // Add common validations if needed
});

// Forum post creation schema
export const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  categoryId: z.string().uuid(),
});

// User role schema
export const userRoleSchema = z.enum(['user', 'moderator', 'admin']);