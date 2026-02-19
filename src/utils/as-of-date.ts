const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value: string): boolean {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) {
    return false;
  }
  const iso = new Date(parsed).toISOString().slice(0, 10);
  return iso === value;
}

export function normalizeAsOfDate(value: string | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (!ISO_DATE_PATTERN.test(trimmed) || !isValidCalendarDate(trimmed)) {
    throw new Error('as_of_date must be an ISO date in YYYY-MM-DD format');
  }

  return trimmed;
}
