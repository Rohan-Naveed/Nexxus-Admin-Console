export function fmtDate(isoDate) {
  if (!isoDate) return "—";
  const date = new Date(isoDate + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function fmtMoney(amount, currency, usdPerPkr) {
  if (currency === "USD" && !(usdPerPkr > 0)) return "—";

  const value = currency === "USD" ? amount * usdPerPkr : amount;
  const decimals = currency === "USD" ? 2 : 0;
  const symbol = currency === "USD" ? "$" : "₨";

  return (
    symbol +
    value.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}
