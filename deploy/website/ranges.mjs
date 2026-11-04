// A malformed/unsupported range is ignored; an unsatisfiable byte range yields 416.
export function parseRange(value, size) {
  if (typeof value !== "string" || !/^bytes=\d*-\d*$/.test(value)) return null;
  const [first, last] = value.slice(6).split("-");
  if (!first && !last) return null;
  if (size === 0) return "invalid";
  if (!first) {
    const length = Number(last);
    if (!Number.isSafeInteger(length) || length <= 0) return "invalid";
    return { start: Math.max(size - length, 0), end: size - 1 };
  }
  const start = Number(first);
  const end = last ? Number(last) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
    start >= size || end < start) return "invalid";
  return { start, end: Math.min(end, size - 1) };
}
