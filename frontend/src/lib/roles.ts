import type { UserRole } from '../types';

/** Customers and building managers book and follow jobs the same way; managers do it for whole buildings. */
export const books = (role?: UserRole | null) => role === 'customer' || role === 'manager';
