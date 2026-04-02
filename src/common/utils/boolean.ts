export function parseBooleanFlag(raw: string | undefined): boolean {
  if (!raw || raw.trim() === '') {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}
