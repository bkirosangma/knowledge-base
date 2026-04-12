export const GRID_SIZE = 10;

export function snapToGrid(v: number, size = GRID_SIZE): number {
  return Math.round(v / size) * size;
}
