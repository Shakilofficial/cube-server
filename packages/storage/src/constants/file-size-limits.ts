/**
 * Per-category file size limits in bytes.
 * These are enforced at the Multer level — requests exceeding limits are
 * rejected with a 413 before any S3 upload occurs.
 */

export const FILE_SIZE_LIMITS = {
  /** Profile avatar / small images: 5 MB */
  avatar: 5 * 1024 * 1024,

  /** General images: 10 MB */
  image: 10 * 1024 * 1024,

  /** Video clips: 200 MB */
  video: 200 * 1024 * 1024,

  /** Documents (PDF, DOCX …): 25 MB */
  document: 25 * 1024 * 1024,

  /** Audio files: 50 MB */
  audio: 50 * 1024 * 1024,

  /** Fallback / unknown */
  default: 10 * 1024 * 1024,
} as const;

export type FileSizeCategory = keyof typeof FILE_SIZE_LIMITS;
