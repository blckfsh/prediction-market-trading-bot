const normalizeDepth = (levels: number[][]): [number, number][] =>
  (levels ?? [])
    .filter((level) => Array.isArray(level) && level.length >= 2)
    .map(([price, quantity]) => [price, quantity] as [number, number]);

const getComplement = (price: number, decimalPrecision: number = 2) => {
  const factor = 10 ** decimalPrecision;
  return (factor - Math.round(price * factor)) / factor;
};

export { normalizeDepth, getComplement };
