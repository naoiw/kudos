/** Convert JavaScript's Sun=0…Sat=6 to Monday-first Mon=0…Sun=6. */
export function mondayFirstWeekdayIndex(jsWeekday: number): number {
  return (jsWeekday + 6) % 7;
}
