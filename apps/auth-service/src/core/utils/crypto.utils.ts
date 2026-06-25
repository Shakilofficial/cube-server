import * as bcrypt from "bcrypt";
import { createHash } from "crypto";

/**
 * Hashes a plaintext password using bcrypt.
 */
export async function hashPassword(
  password: string,
  rounds = 12,
): Promise<string> {
  return bcrypt.hash(password, rounds);
}

/**
 * Compares a plaintext password against a bcrypt hash.
 */
export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Computes a SHA-256 hash of a string, returning the hex digest.
 */
export function hashSHA256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
