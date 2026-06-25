import {
  UnsupportedMediaTypeException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { memoryStorage } from "multer";
import {
  ALL_ALLOWED_MIME_TYPES,
  AllowedMimeType,
} from "./constants/allowed-mime-types";
import {
  FILE_SIZE_LIMITS,
  FileSizeCategory,
} from "./constants/file-size-limits";

/** Options when creating a Multer config */
export interface FileUploadOptions {
  /** Which field name in the form-data to accept */
  fieldName?: string;
  /** Accepted MIME types — defaults to all allowed */
  allowedMimeTypes?: AllowedMimeType[];
  /** Size category to apply limit for */
  sizeCategory?: FileSizeCategory;
}

/**
 * Returns a Multer configuration object ready to be used with
 * `@UseInterceptors(FileInterceptor('avatar', multerConfig(...)))`.
 *
 * Files are stored in memory (as Buffer) so they can be processed by
 * Sharp before being streamed to S3 — no disk I/O.
 */
export function multerConfig(options: FileUploadOptions = {}) {
  const {
    allowedMimeTypes = ALL_ALLOWED_MIME_TYPES as unknown as AllowedMimeType[],
    sizeCategory = "default",
  } = options;

  const allowedSet = new Set<string>(allowedMimeTypes);
  const maxFileSize = FILE_SIZE_LIMITS[sizeCategory];

  return {
    storage: memoryStorage(),
    limits: {
      fileSize: maxFileSize,
      files: 1,
    },
    fileFilter: (_req: any, file: any, callback: any) => {
      if (!allowedSet.has(file.mimetype)) {
        return callback(
          new UnsupportedMediaTypeException(
            `File type "${file.mimetype}" is not supported. ` +
              `Allowed types: ${[...allowedSet].join(", ")}`,
          ),
          false,
        );
      }
      callback(null, true);
    },
  };
}

/**
 * Guards against oversized files when you want to validate size
 * independently of Multer (e.g., for already-buffered data).
 */
export function assertFileSize(
  buffer: Buffer,
  sizeCategory: FileSizeCategory,
  label = "file",
): void {
  const limit = FILE_SIZE_LIMITS[sizeCategory];
  if (buffer.length > limit) {
    throw new PayloadTooLargeException(
      `${label} exceeds the maximum allowed size of ${Math.round(limit / 1024 / 1024)} MB.`,
    );
  }
}
