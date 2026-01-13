export const normalizeDepth = (levels: number[][]): [number, number][] =>
  (levels ?? [])
    .filter((level) => Array.isArray(level) && level.length >= 2)
    .map(([price, quantity]) => [price, quantity] as [number, number]);
