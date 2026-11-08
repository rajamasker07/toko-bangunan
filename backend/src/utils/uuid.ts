import { v7 as uuidv7 } from 'uuid';

/**
 * Generate a time-ordered UUID v7
 * Compliant with RFC 9562
 * Optimal for database indexing and high-write scale.
 */
export function generateUUIDv7(): string {
  return uuidv7();
}
