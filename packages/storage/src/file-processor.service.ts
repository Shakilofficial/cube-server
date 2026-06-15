import { Injectable, Logger, UnsupportedMediaTypeException } from '@nestjs/common';
import sharp from 'sharp';
import { isImageMimeType } from './constants/allowed-mime-types';

export interface ProcessedFile {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  originalSize: number;
  processedSize: number;
  compressionRatio: string;
}

/**
 * Processing presets define Sharp pipeline options for different use cases.
 * Quality values are tuned to be transparent to the human eye while
 * achieving significant file-size reduction.
 */
const IMAGE_PRESETS = {
  avatar: {
    width: 400,
    height: 400,
    fit: 'cover' as const,
    webpQuality: 85,
    jpegQuality: 85,
    pngCompressionLevel: 8,
  },
  image: {
    maxWidth: 2048,
    maxHeight: 2048,
    webpQuality: 82,
    jpegQuality: 82,
    pngCompressionLevel: 8,
  },
  /** Product thumbnail — small (200×200) */
  'thumbnail-sm': {
    width: 200,
    height: 200,
    fit: 'cover' as const,
    webpQuality: 80,
    jpegQuality: 80,
    pngCompressionLevel: 8,
  },
  /** Product thumbnail — medium (400×400) */
  'thumbnail-md': {
    width: 400,
    height: 400,
    fit: 'cover' as const,
    webpQuality: 82,
    jpegQuality: 82,
    pngCompressionLevel: 8,
  },
} as const;

export type ImagePreset = keyof typeof IMAGE_PRESETS;

@Injectable()
export class FileProcessorService {
  private readonly logger = new Logger(FileProcessorService.name);

  /**
   * Process an uploaded file buffer:
   * - Images: compress + resize using Sharp, convert to WebP (best quality/size ratio)
   * - Videos, audio, documents: returned as-is (no server-side re-encoding)
   */
  async process(
    buffer: Buffer,
    mimeType: string,
    originalName: string,
    preset: ImagePreset = 'image',
  ): Promise<ProcessedFile> {
    const originalSize = buffer.length;

    if (isImageMimeType(mimeType)) {
      return this.processImage(buffer, mimeType, originalSize, preset);
    }

    // Non-image files: pass through unchanged
    const extension = this.getExtensionFromMime(mimeType, originalName);
    return {
      buffer,
      mimeType,
      extension,
      originalSize,
      processedSize: originalSize,
      compressionRatio: '1.00x',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async processImage(
    buffer: Buffer,
    _mimeType: string,
    originalSize: number,
    preset: ImagePreset,
  ): Promise<ProcessedFile> {
    try {
      const options = IMAGE_PRESETS[preset];
      let pipeline = sharp(buffer, { failOn: 'truncated' });

      // Rotate based on EXIF orientation metadata (important for mobile shots)
      pipeline = pipeline.rotate();

      if (preset === 'avatar' || preset === 'thumbnail-sm' || preset === 'thumbnail-md') {
        const { width, height, fit } = options as typeof IMAGE_PRESETS['avatar'];
        pipeline = pipeline.resize({ width, height, fit, withoutEnlargement: true });
      } else {
        const { maxWidth, maxHeight } = options as typeof IMAGE_PRESETS['image'];
        pipeline = pipeline.resize({
          width: maxWidth,
          height: maxHeight,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Convert to WebP — best quality-to-size ratio for web delivery
      const webpQuality = (options as any).webpQuality ?? 82;
      const processedBuffer = await pipeline
        .webp({ quality: webpQuality, effort: 4 })
        .toBuffer();

      const ratio = (originalSize / processedBuffer.length).toFixed(2);
      this.logger.debug(
        `Image processed: ${originalSize} → ${processedBuffer.length} bytes (${ratio}x compression)`,
      );

      return {
        buffer: processedBuffer,
        mimeType: 'image/webp',
        extension: 'webp',
        originalSize,
        processedSize: processedBuffer.length,
        compressionRatio: `${ratio}x`,
      };
    } catch (err: any) {
      throw new UnsupportedMediaTypeException(
        `Failed to process image: ${err.message}`,
      );
    }
  }

  private getExtensionFromMime(mimeType: string, originalName: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/avif': 'avif',
      'image/tiff': 'tiff',
      'image/bmp': 'bmp',
      'video/mp4': 'mp4',
      'video/mpeg': 'mpeg',
      'video/quicktime': 'mov',
      'video/webm': 'webm',
      'video/x-msvideo': 'avi',
      'video/3gpp': '3gp',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/aac': 'aac',
      'audio/flac': 'flac',
      'audio/x-m4a': 'm4a',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/plain': 'txt',
      'text/csv': 'csv',
    };

    return mimeToExt[mimeType] ?? originalName.split('.').pop() ?? 'bin';
  }
}
