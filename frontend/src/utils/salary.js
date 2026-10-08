// Shared helper for turning a single monthly figure into Weekly / Monthly /
// Yearly numbers, so the three periods can never drift out of sync with
// each other. Originally lived inline in DispatcherFormModal for basic
// salary only — pulled out here so fuel allowance can reuse the exact same
// derivation instead of duplicating it.
export const WEEKS_PER_MONTH = 52 / 12; // ≈ 4.33

export function deriveMonthlyFigures(monthly) {
  const m = Number(monthly) || 0;
  return {
    Weekly: Math.round(m / WEEKS_PER_MONTH),
    Monthly: m,
    Yearly: m * 12,
  };
}
