/**
 * Rough free-tier capacity, used for the "% of free space used" figure on the Admin
 * records page. Approximate on purpose: every record differs.
 *
 * Measured in production on 2026-11-15 (6 records, 7 photos):
 *   - photos averaged ~428 KB (largest 1.2 MB) after in-app resizing
 *   - a record row is ~200 bytes; with its workflow/contact history and indexes,
 *     well under 2 KB
 * Photos dominate by far, so R2 storage is what runs out first.
 */

/** Assumed photos per record for the estimate (the app allows up to 5). */
export const ESTIMATE_PHOTOS_PER_RECORD = 2;
/** Assumed size of one stored photo, rounded up from the measured average. */
export const ESTIMATED_PHOTO_BYTES = 450_000;
/** Assumed database space per record, including its history rows and indexes. */
export const ESTIMATED_RECORD_DB_BYTES = 2_000;

/** Cloudflare free tier: R2 storage (photos). */
export const FREE_R2_BYTES = 10_000_000_000; // 10 GB
/** Cloudflare free tier: maximum size of one D1 database. */
export const FREE_D1_BYTES = 500_000_000; // 500 MB

/**
 * Estimated number of images that fit in the free R2 storage, for the "% of free space"
 * figure on the Admin images page (image count / this). Re-measured 2026-11-15:
 * 7 images, average ~428 KB (107 KB to 1.2 MB), so ESTIMATED_PHOTO_BYTES still holds.
 */
export const ESTIMATED_MAX_IMAGES = Math.floor(FREE_R2_BYTES / ESTIMATED_PHOTO_BYTES);

/** Estimated number of records that fit in the free tier (the tighter of R2 and D1). */
export const ESTIMATED_MAX_RECORDS = Math.floor(
  Math.min(
    FREE_R2_BYTES / (ESTIMATE_PHOTOS_PER_RECORD * ESTIMATED_PHOTO_BYTES),
    FREE_D1_BYTES / ESTIMATED_RECORD_DB_BYTES,
  ),
);
