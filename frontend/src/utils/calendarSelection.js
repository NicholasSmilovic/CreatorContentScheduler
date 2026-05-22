const SLOT_DURATION_MS = 30 * 60 * 1000;

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function dayBounds(value) {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function rangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

export function buildSelectionRange(start, end) {
  const rangeStart = toDate(start);
  let rangeEnd = end ? toDate(end) : new Date(rangeStart.getTime() + SLOT_DURATION_MS);
  if (rangeEnd <= rangeStart) {
    rangeEnd = new Date(rangeStart.getTime() + SLOT_DURATION_MS);
  }
  return { start: rangeStart, end: rangeEnd };
}

export function eventSelectionRange(event) {
  return buildSelectionRange(event.start, event.end);
}

export function calendarDaySelectionProps(day, selectedRange) {
  if (!selectedRange) return {};
  const dayRange = dayBounds(day);
  if (!rangesOverlap(dayRange.start, dayRange.end, selectedRange.start, selectedRange.end)) return {};
  return { className: "calendar-selected-day" };
}

export function calendarSlotSelectionProps(slotStart, selectedRange) {
  if (!selectedRange) return {};
  const start = toDate(slotStart);
  const end = new Date(start.getTime() + SLOT_DURATION_MS);
  if (!rangesOverlap(start, end, selectedRange.start, selectedRange.end)) return {};
  return { className: "calendar-selected-slot" };
}
