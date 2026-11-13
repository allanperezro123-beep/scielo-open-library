import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export { pdfjsLib };

export function buildPdfProxyUrl(rawUrl: string): string {
  const clean = rawUrl.replace(/^http:\/\//i, 'https://');
  return `/api/pdf-proxy?url=${encodeURIComponent(clean)}`;
}

export function buildCoverProxyUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  const clean = rawUrl.replace(/^http:\/\//i, 'https://');
  return `/api/pdf-proxy?url=${encodeURIComponent(clean)}`;
}

/**
 * Concurrency-limited queue for lazily rendering Page 1 thumbnails via PDF.js
 * using progressive byte-range requests without overwhelming the browser.
 */
class ThumbnailQueue {
  private active = 0;
  private readonly maxConcurrent = 2;
  private queue: Array<() => void> = [];

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.active++;
        try {
          resolve(await task());
        } catch (err) {
          reject(err);
        } finally {
          this.active--;
          const next = this.queue.shift();
          if (next) next();
        }
      };

      if (this.active < this.maxConcurrent) {
        void run();
      } else {
        this.queue.push(() => void run());
      }
    });
  }
}

export const pdfThumbnailQueue = new ThumbnailQueue();
