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

// User role schema
export const userRoleSchema = z.enum(['user', 'moderator', 'admin']);
