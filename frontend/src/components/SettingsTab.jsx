import { useEffect, useState } from "react";
import { Save } from "lucide-react";

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function sortRates(rates) {
  return [...rates].sort(
    (a, b) => b.periodYear - a.periodYear || b.periodMonth - a.periodMonth,
  );
}

function mergeRate(rates, savedRate) {
  return sortRates([
    ...rates.filter(
      (rate) =>
        rate.periodYear !== savedRate.periodYear ||
        rate.periodMonth !== savedRate.periodMonth,
    ),
    savedRate,
  ]);
}

function formatPeriod(rate) {
  return new Date(rate.periodYear, rate.periodMonth - 1, 1).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
}

function formatUpdatedAt(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function RateHistory({ rates, valueKey, valueLabel, formatValue }) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th className="table-head">Effective month</th>
            <th className="table-head">{valueLabel}</th>
            <th className="table-head">Last updated</th>
          </tr>
        </thead>
        <tbody>
          {rates.length ? (
            rates.map((rate) => (
              <tr key={`${rate.periodYear}-${rate.periodMonth}`}>
                <td className="table-cell table-cell-strong">
                  {formatPeriod(rate)}
                </td>
                <td className="table-cell">{formatValue(rate[valueKey])}</td>
                <td className="table-cell">
                  {formatUpdatedAt(rate.updatedAt)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="table-cell" colSpan={3}>
                No rates have been configured.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function SettingsTab({
  rateService,
  onUsdRateChange,
  onTaxRateChange,
  onTrackingPropertiesChange,
}) {
  const [usdRates, setUsdRates] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [usdPeriod, setUsdPeriod] = useState(currentMonthKey);
  const [taxPeriod, setTaxPeriod] = useState(currentMonthKey);
  const [usdRateInput, setUsdRateInput] = useState("");
  const [taxRateInput, setTaxRateInput] = useState("");
  const [trackingGrossPercentage, setTrackingGrossPercentage] = useState("");
  const [trackingFeePercentage, setTrackingFeePercentage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [usdError, setUsdError] = useState("");
  const [taxError, setTaxError] = useState("");
  const [usdSaved, setUsdSaved] = useState("");
  const [taxSaved, setTaxSaved] = useState("");
  const [trackingError, setTrackingError] = useState("");
  const [trackingSaved, setTrackingSaved] = useState("");

  useEffect(() => {
    let active = true;

    async function loadRates() {
      setLoading(true);
      setLoadError("");
      try {
        const [nextUsdRates, nextTaxRates, trackingProperties] =
          await Promise.all([
            rateService.fetchUsdRates(),
            rateService.fetchTaxRates(),
            rateService.fetchTrackingProperties(),
          ]);
        if (!active) return;
        setUsdRates(sortRates(nextUsdRates));
        setTrackingGrossPercentage(String(trackingProperties.grossPercentage));
        setTrackingFeePercentage(String(trackingProperties.trackingPercentage));
        setTaxRates(sortRates(nextTaxRates));
      } catch (error) {
        if (!active) return;
        setLoadError(error.message || "Could not load saved rates.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadRates();
    return () => {
      active = false;
    };
  }, [rateService]);

  async function saveUsdRate(event) {
    event.preventDefault();
    setSaving("usd");
    setUsdError("");
    setUsdSaved("");
    const [periodYear, periodMonth] = usdPeriod.split("-").map(Number);

    try {
      const savedRate = await rateService.saveUsdRate({
        periodYear,
        periodMonth,
        ratePkrPerUsd: Number(usdRateInput),
      });
      const nextRates = mergeRate(usdRates, savedRate);
      setUsdRates(nextRates);
      onUsdRateChange(
        nextRates[0]?.ratePkrPerUsd ? 1 / nextRates[0].ratePkrPerUsd : null,
      );
      setUsdSaved(`Saved for ${formatPeriod(savedRate)}.`);
      setUsdRateInput("");
    } catch (error) {
      setUsdError(error.message || "Could not save the USD exchange rate.");
    } finally {
      setSaving(null);
    }
  }

  async function saveTaxRate(event) {
    event.preventDefault();
    setSaving("tax");
    setTaxError("");
    setTaxSaved("");
    const [periodYear, periodMonth] = taxPeriod.split("-").map(Number);

    try {
      const savedRate = await rateService.saveTaxRate({
        periodYear,
        periodMonth,
        taxPercent: Number(taxRateInput),
      });
      const nextRates = mergeRate(taxRates, savedRate);
      setTaxRates(nextRates);
      onTaxRateChange(nextRates[0]?.taxPercent ?? null);
      setTaxSaved(`Saved for ${formatPeriod(savedRate)}.`);
      setTaxRateInput("");
    } catch (error) {
      setTaxError(error.message || "Could not save the tax rate.");
    } finally {
      setSaving(null);
    }
  }

  async function saveTrackingPercentages(event) {
    event.preventDefault();
    setSaving("tracking");
    setTrackingError("");
    setTrackingSaved("");
    try {
      const savedProperties = await rateService.saveTrackingProperties({
        grossPercentage: Number(trackingGrossPercentage),
        trackingPercentage: Number(trackingFeePercentage),
      });
      setTrackingGrossPercentage(String(savedProperties.grossPercentage));
      setTrackingFeePercentage(String(savedProperties.trackingPercentage));
      onTrackingPropertiesChange(savedProperties);
      setTrackingSaved("Saved. New syncs will use these percentages.");
    } catch (error) {
      setTrackingError(error.message || "Could not save tracking percentages.");
    } finally {
      setSaving(null);
    }
  }

  const currentUsdRate = usdRates[0];
  const currentTaxRate = taxRates[0];

  return (
    <div className="content-stack">
      {loadError && <div className="load-error-banner">{loadError}</div>}

      <section className="panel">
        <div className="section-head">
          <div>
            <h2 className="panel-title settings-card-title">
              USD / PKR exchange rate
            </h2>
            <div className="panel-sub">
              Set the PKR value of one US dollar for an effective month.
            </div>
          </div>
          <div className="soft-pill">
            {currentUsdRate
              ? `Latest: 1 USD = ${currentUsdRate.ratePkrPerUsd} PKR`
              : "No rate configured"}
          </div>
        </div>

        <form className="content-stack" onSubmit={saveUsdRate}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="usd-rate-period">
                Effective month
              </label>
              <input
                id="usd-rate-period"
                type="month"
                className="form-input"
                value={usdPeriod}
                onChange={(event) => setUsdPeriod(event.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="usd-rate-value">
                PKR per USD
              </label>
              <input
                id="usd-rate-value"
                type="number"
                className="form-input"
                min="0.0001"
                step="0.0001"
                value={usdRateInput}
                onChange={(event) => setUsdRateInput(event.target.value)}
                required
              />
            </div>
          </div>
          {usdError && <div className="form-error">{usdError}</div>}
          {usdSaved && <div className="panel-sub">{usdSaved}</div>}
          <div className="form-actions">
            <button
              type="submit"
              className="primary-btn"
              disabled={loading || saving !== null}
            >
              <Save size={14} />
              {saving === "usd" ? "Saving…" : "Save exchange rate"}
            </button>
          </div>
        </form>

        <RateHistory
          rates={usdRates}
          valueKey="ratePkrPerUsd"
          valueLabel="PKR per USD"
          formatValue={(value) => Number(value).toLocaleString("en-US")}
        />
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2 className="panel-title settings-card-title">Income tax rate</h2>
            <div className="panel-sub">
              Set the tax percentage applied to taxable earnings for an
              effective month.
            </div>
          </div>
          <div className="soft-pill">
            {currentTaxRate
              ? `Latest: ${currentTaxRate.taxPercent}%`
              : "No rate configured"}
          </div>
        </div>

        <form className="content-stack" onSubmit={saveTaxRate}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="tax-rate-period">
                Effective month
              </label>
              <input
                id="tax-rate-period"
                type="month"
                className="form-input"
                value={taxPeriod}
                onChange={(event) => setTaxPeriod(event.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="tax-rate-value">
                Tax percentage
              </label>
              <input
                id="tax-rate-value"
                type="number"
                className="form-input"
                min="0"
                step="0.01"
                value={taxRateInput}
                onChange={(event) => setTaxRateInput(event.target.value)}
                required
              />
            </div>
          </div>
          {taxError && <div className="form-error">{taxError}</div>}
          {taxSaved && <div className="panel-sub">{taxSaved}</div>}
          <div className="form-actions">
            <button
              type="submit"
              className="primary-btn"
              disabled={loading || saving !== null}
            >
              <Save size={14} />
              {saving === "tax" ? "Saving…" : "Save tax rate"}
            </button>
          </div>
        </form>

        <RateHistory
          rates={taxRates}
          valueKey="taxPercent"
          valueLabel="Tax percentage"
          formatValue={(value) => `${Number(value).toLocaleString("en-US")}%`}
        />
      </section>

      <section className="panel">
        <div className="section-head">
          <div>
            <h2 className="panel-title settings-card-title">
              Tracking income percentages
            </h2>
            <div className="panel-sub">
              New syncs snapshot these rates; saved historical weeks are not
              changed.
            </div>
          </div>
        </div>
        <form className="content-stack" onSubmit={saveTrackingPercentages}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="tracking-gross-percentage">
                Dispatcher gross as % of driver revenue
              </label>
              <input
                id="tracking-gross-percentage"
                type="number"
                className="form-input"
                min="0.0001"
                max="100"
                step="0.0001"
                value={trackingGrossPercentage}
                disabled={loading || saving !== null}
                onChange={(event) =>
                  setTrackingGrossPercentage(event.target.value)
                }
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="tracking-fee-percentage">
                Tracking income as % of driver revenue
              </label>
              <input
                id="tracking-fee-percentage"
                type="number"
                className="form-input"
                min="0"
                max="100"
                step="0.0001"
                value={trackingFeePercentage}
                disabled={loading || saving !== null}
                onChange={(event) =>
                  setTrackingFeePercentage(event.target.value)
                }
                required
              />
            </div>
          </div>
          <div className="panel-sub">
            Tracking income = dispatcher gross ÷ gross percentage × tracking
            percentage.
          </div>
          {trackingError && <div className="form-error">{trackingError}</div>}
          {trackingSaved && <div className="panel-sub">{trackingSaved}</div>}
          <div className="form-actions">
            <button
              type="submit"
              className="primary-btn"
              disabled={loading || saving !== null}
            >
              <Save size={14} />
              {saving === "tracking" ? "Saving…" : "Save tracking percentages"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
