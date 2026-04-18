/**
 * Factory helpers for diagram entity IDs. Centralising the `el-${ts}-${rand}`
 * pattern in one place means we can change collision resistance or the
 * prefix scheme without hunting through call sites.
 *
 * IDs are: prefix + "-" + Date.now() + "-" + 5 base-36 chars (~7.8 bits entropy
 * beyond the timestamp). Collision risk is negligible for interactive use;
 * if we ever need cryptographic uniqueness, swap the random segment for
 * `crypto.randomUUID().slice(0, 8)`.
 */

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/** Fresh ID for a newly-created element/node (e.g. `el-1744725318-a7x2k`). */
export function createElementId(): string {
  return `el-${Date.now()}-${randomSuffix()}`;
}

/** Fresh ID for a newly-created layer (e.g. `ly-1744725318-a7x2k`). */
export function createLayerId(): string {
  return `ly-${Date.now()}-${randomSuffix()}`;
}

/** Fresh ID for a newly-created condition node (e.g. `el-cond-1744725318-a7x2k`). */
export function createConditionId(): string {
  return `el-cond-${Date.now()}-${randomSuffix()}`;
}
