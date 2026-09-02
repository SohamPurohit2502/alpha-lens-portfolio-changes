import config from "../../refresh-config.json";
import fallback from "../../portfolio-data.json";

type Candidate = (typeof config.candidates)[number];
type HistoryPoint = { date: Date; nav: number };
const horizons = { "1d": 1, "7d": 7, "15d": 15, "30d": 30, "1m": 30, "3m": 91, "6m": 183, "1y": 365, "2y": 731, "3y": 1096, "5y": 1826 } as const;
const sharpeHorizons = ["1m", "3m", "6m", "1y", "3y"] as const;
const exitLoads: Record<number, string> = {
  119364: "1% >10% units, within 1 year",
  119727: "1% within 1 year",
  133386: "Nil · 3-year lock-in",
  135805: "0.25% within 30 days",
  142388: "2% within 180 days",
  145678: "1% >10% units, within 1 year",
  147704: "1% within 1 year",
  148481: "1% >10% units, within 1 year",
  149166: "1% >20% units, within 1 year",
  151036: "1% >10% units, within 1 year",
  151379: "0.50% within 3 months",
  152018: "1% >12% units, within 1 year",
  152082: "1% within 30 days",
  152206: "0.50% within 1 month",
  152607: "0.50% within 30 days",
};

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const stdev = (values: number[]) => {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
};

function parseHistory(payload: { data?: Array<{ date: string; nav: string }> }) {
  return (payload.data ?? []).map((point) => {
    const [day, month, year] = point.date.split("-").map(Number);
    return { date: new Date(Date.UTC(year, month - 1, day)), nav: Number(point.nav) };
  }).filter((point) => Number.isFinite(point.nav) && point.nav > 0).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function nearestBefore(series: HistoryPoint[], target: Date) {
  for (let index = series.length - 1; index >= 0; index--) if (series[index].date <= target) return series[index];
  return null;
}

function nearestOnOrAfter(series: HistoryPoint[], target: Date) {
  return series.find((point) => point.date >= target) ?? null;
}

function pointToPoint(series: HistoryPoint[], startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T23:59:59Z`);
  const startPoint = nearestOnOrAfter(series, start);
  const endPoint = nearestBefore(series, end);
  if (!startPoint || !endPoint || startPoint.date >= endPoint.date) return null;
  const years = (endPoint.date.getTime() - startPoint.date.getTime()) / (365.25 * 86400000);
  const absolute = endPoint.nav / startPoint.nav - 1;
  const method = years < 1 ? "Absolute" : "CAGR";
  return {
    value: method === "Absolute" ? absolute : (endPoint.nav / startPoint.nav) ** (1 / years) - 1,
    method,
    start_nav_date: startPoint.date.toISOString().slice(0, 10),
    end_nav_date: endPoint.date.toISOString().slice(0, 10),
    start_nav: startPoint.nav,
    end_nav: endPoint.nav,
  };
}

function calculateCandidate(candidate: Candidate, series: HistoryPoint[]) {
  if (series.length < 30) return null;
  const latest = series.at(-1)!;
  const returns: Record<string, number | null> = {};
  for (const [label, days] of Object.entries(horizons)) {
    const target = new Date(latest.date.getTime() - days * 86400000);
    const prior = nearestBefore(series, target);
    if (!prior) { returns[label] = null; continue; }
    let value = latest.nav / prior.nav - 1;
    if (label === "1y" || label === "2y" || label === "3y" || label === "5y") {
      const years = (latest.date.getTime() - prior.date.getTime()) / (365.25 * 86400000);
      value = years > 0 ? (latest.nav / prior.nav) ** (1 / years) - 1 : value;
    }
    returns[label] = value;
  }

  const daily = series.slice(1).map((point, index) => ({
    date: point.date,
    value: point.nav / series[index].nav - 1,
  }));
  const sharpe: Record<string, number | null> = {};
  const rfDaily = (1 + config.risk_free_rate) ** (1 / 252) - 1;
  for (const label of sharpeHorizons) {
    const cutoff = latest.date.getTime() - horizons[label] * 86400000;
    const values = daily.filter((point) => point.date.getTime() > cutoff).map((point) => point.value);
    const deviation = stdev(values);
    const average = median(values);
    sharpe[label] = deviation && average != null ? ((average - rfDaily) / deviation) * Math.sqrt(252) : null;
  }

  const peerAlpha: Record<string, number | null> = {};
  for (const label of Object.keys(horizons)) {
    const value = returns[label];
    const peer = candidate.peer_median_returns[label as keyof typeof candidate.peer_median_returns] ?? null;
    peerAlpha[label] = value != null && peer != null ? value - peer : null;
  }
  const sharpeExcess: Record<string, number | null> = {};
  for (const label of sharpeHorizons) {
    const value = sharpe[label];
    const peer = candidate.peer_median_sharpe[label] ?? null;
    sharpeExcess[label] = value != null && peer != null ? value - peer : null;
  }

  const eligibleAlpha = Object.values(peerAlpha).filter((value) => value != null).length;
  const positiveAlpha = Object.values(peerAlpha).filter((value) => value != null && value > 0).length;
  const eligibleSharpe = Object.values(sharpeExcess).filter((value) => value != null).length;
  const sharpeWins = Object.values(sharpeExcess).filter((value) => value != null && value > 0).length;
  const longest = peerAlpha["3y"] != null ? peerAlpha["3y"] : peerAlpha["1y"];
  const alphaRate = eligibleAlpha ? positiveAlpha / eligibleAlpha : 0;
  const sharpeRate = eligibleSharpe ? sharpeWins / eligibleSharpe : 0;
  const qualifies = eligibleAlpha >= 4 && eligibleSharpe >= 3 && alphaRate >= 0.7 && sharpeRate >= 0.7 && (longest ?? -1) > 0;
  const score = alphaRate * 45 + sharpeRate * 30 + (longest ?? 0) * 200 + (peerAlpha["6m"] ?? 0) * 80;

  return {
    scheme_code: candidate.scheme_code,
    short_name: candidate.short_name,
    scheme: candidate.scheme_name,
    category: candidate.category,
    asset_class: "Equity",
    exit_load: exitLoads[candidate.scheme_code] ?? "Refer latest AMC disclosure",
    cohort: returns["3y"] == null ? "Emerging leader" : "Established leader",
    confidence: candidate.confidence,
    returns,
    peer_alpha: peerAlpha,
    sharpe,
    sharpe_excess: sharpeExcess,
    eligible_windows: eligibleAlpha,
    positive_alpha_windows: positiveAlpha,
    eligible_sharpe_windows: eligibleSharpe,
    sharpe_wins: sharpeWins,
    qualifies,
    screen_score: score,
    latest_nav_date: latest.date.toISOString().slice(0, 10),
  };
}

async function fetchCandidate(candidate: Candidate) {
  const response = await fetch(`https://api.mfapi.in/mf/${candidate.scheme_code}`, {
    headers: { "Accept": "application/json", "User-Agent": "Alpha Lens portfolio research" },
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`NAV ${candidate.scheme_code}: ${response.status}`);
  return calculateCandidate(candidate, parseHistory(await response.json()));
}

const numberOrNull = (value: unknown) => {
  const parsed = Number(value);
  return value == null || value === "" || !Number.isFinite(parsed) ? null : parsed;
};

async function fetchPortfolio(fund: ReturnType<typeof calculateCandidate> & { rank: number }) {
  if (!fund) return null;
  const candidate = config.candidates.find((item) => item.scheme_code === fund.scheme_code)!;
  const source = `https://www.rupeevest.com/home/get_mf_portfolio_tracker?schemecode=${candidate.rupeevest_code}`;
  const response = await fetch(source, {
    headers: {
      "Accept": "application/json",
      "Referer": "https://www.rupeevest.com/Mutual-Fund-Portfolio-Tracker",
      "User-Agent": "Mozilla/5.0 Alpha Lens portfolio research",
      "X-Requested-With": "XMLHttpRequest",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Portfolio ${fund.scheme_code}: ${response.status}`);
  const payload = await response.json() as {
    month_name?: string[];
    stock_data?: Array<Array<Record<string, unknown>>>;
    stock_mapping?: Record<string, string>;
    MonthwiseAUM?: Array<{ aum?: string | number }>;
  };
  const months = (payload.month_name ?? []).slice(0, 4);
  const stocks = (payload.stock_data ?? []).slice(0, months.length);
  if (months.length < 2 || !stocks.length) throw new Error(`Portfolio ${fund.scheme_code}: insufficient months`);
  const mapping = Object.fromEntries(Object.entries(payload.stock_mapping ?? {}).map(([key, value]) => [String(key), value]));
  const holdings = new Map<string, { security: string; weights: Array<number | null> }>();
  stocks.forEach((rows, monthIndex) => rows.forEach((row) => {
    const code = String(row.fincode ?? row.sr_no ?? row.company_name);
    const holding = holdings.get(code) ?? { security: mapping[code] ?? String(row.company_name ?? code), weights: Array(months.length).fill(null) };
    holding.weights[monthIndex] = numberOrNull(row.percent_aum);
    holdings.set(code, holding);
  }));

  const rows = [...holdings.values()].flatMap((holding) => {
    const latest = holding.weights[0];
    const oldest = holding.weights.at(-1) ?? null;
    let changeType = "";
    let delta: number | null = null;
    if (latest != null && oldest == null && latest >= 0.5) changeType = "New position";
    else if (latest == null && oldest != null && oldest >= 0.5) changeType = "Exited position";
    else if (latest != null && oldest != null) {
      delta = latest - oldest;
      if (delta >= 0.5) changeType = "Weight increased";
      else if (delta <= -0.5) changeType = "Weight reduced";
    }
    if (!changeType) return [];
    return [{
      scheme_code: fund.scheme_code,
      scheme: fund.short_name,
      cohort: fund.cohort,
      change_type: changeType,
      security: holding.security,
      month_weights: Object.fromEntries(months.map((month, index) => [month, holding.weights[index]])),
      delta_pp: delta,
      significance: changeType.includes("position") ? "New/exit weight >=0.50% of portfolio" : "Absolute weight movement >=0.50 percentage points",
    }];
  });
  return { months, rows, source, aum: numberOrNull(payload.MonthwiseAUM?.[0]?.aum) };
}

function fallbackRows(schemeCode: number) {
  const fund = fallback.funds.find((item) => item.scheme_code === schemeCode);
  const months = fund?.portfolio_months ?? ["Jul-26", "Jun-26", "May-26", "Apr-26"];
  return fallback.portfolio_rows.filter((row) => row.scheme_code === schemeCode).map((row) => ({
    scheme_code: row.scheme_code,
    scheme: row.scheme,
    cohort: row.cohort,
    change_type: row.change_type,
    security: row.security,
    month_weights: Object.fromEntries(months.map((month, index) => [month, [row.jul_weight, row.jun_weight, row.may_weight, row.apr_weight][index] ?? null])),
    delta_pp: row.delta_pp,
    significance: row.significance,
  }));
}

export async function POST(request?: Request) {
  let body: { mode?: string; start_date?: string; end_date?: string; scheme_codes?: number[] } = {};
  if (request) {
    try { body = await request.json(); } catch { body = {}; }
  }
  if (body.mode === "point_to_point") {
    const startDate = body.start_date ?? "";
    const endDate = body.end_date ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate >= endDate) {
      return Response.json({ error: "Choose a valid start date before the end date." }, { status: 400 });
    }
    const requested = new Set((body.scheme_codes ?? []).map(Number));
    const candidates = config.candidates.filter((candidate) => !requested.size || requested.has(candidate.scheme_code));
    const results = await Promise.allSettled(candidates.map(async (candidate) => {
      const response = await fetch(`https://api.mfapi.in/mf/${candidate.scheme_code}`, {
        headers: { "Accept": "application/json", "User-Agent": "Alpha Lens point-to-point research" },
        cache: "no-store", signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error(`NAV ${candidate.scheme_code}: ${response.status}`);
      return { scheme_code: candidate.scheme_code, ...pointToPoint(parseHistory(await response.json()), startDate, endDate) };
    }));
    const values = results.flatMap((result) => result.status === "fulfilled" && result.value.value != null ? [result.value] : []);
    if (!values.length) return Response.json({ error: "No NAV history is available for that date range." }, { status: 422 });
    return Response.json({ start_date: startDate, end_date: endDate, method: values[0].method, values }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }
  const results = await Promise.allSettled(config.candidates.map(fetchCandidate));
  const analyzed = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  if (analyzed.length < 6) return Response.json({ error: "Live NAV sources are temporarily unavailable. The existing data remains active." }, { status: 502 });

  const selected = analyzed.filter((fund) => fund.qualifies)
    .sort((a, b) => b.screen_score - a.screen_score)
    .slice(0, 12)
    .map((fund, index) => ({ ...fund, rank: index + 1, portfolio_source: "", portfolio_months: [] as string[], aum: null as number | null }));
  const portfolioResults = await Promise.allSettled(selected.map(fetchPortfolio));
  const portfolioRows: Array<Record<string, unknown>> = [];
  const monthSet = new Set<string>();
  let livePortfolioFunds = 0;
  portfolioResults.forEach((result, index) => {
    const fund = selected[index];
    if (result.status === "fulfilled" && result.value) {
      livePortfolioFunds++;
      result.value.months.forEach((month) => monthSet.add(month));
      portfolioRows.push(...result.value.rows);
      fund.portfolio_source = result.value.source;
      fund.portfolio_months = result.value.months;
      fund.aum = result.value.aum;
    } else {
      const fallbackFund = fallback.funds.find((item) => item.scheme_code === fund.scheme_code);
      (fallbackFund?.portfolio_months ?? []).forEach((month) => monthSet.add(month));
      portfolioRows.push(...fallbackRows(fund.scheme_code));
      fund.portfolio_source = fallbackFund?.portfolio_source ?? "Cached portfolio disclosure";
      fund.portfolio_months = fallbackFund?.portfolio_months ?? [];
      fund.aum = Array.isArray(fallbackFund?.aum) ? fallbackFund.aum[0] : null;
    }
  });

  const monthNumber = (label: string) => {
    const [month, year] = label.split("-");
    return (Number(year) + 2000) * 12 + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(month);
  };
  const portfolioMonths = [...monthSet].sort((a, b) => monthNumber(b) - monthNumber(a)).slice(0, 4);
  const latestDate = selected.map((fund) => fund.latest_nav_date).sort().at(-1) ?? new Date().toISOString().slice(0, 10);

  return Response.json({
    as_of: latestDate,
    refreshed_at: new Date().toISOString(),
    funds: selected,
    portfolio_rows: portfolioRows,
    portfolio_months: portfolioMonths,
    refresh_scope: {
      full_universe_baseline: config.full_universe_count,
      analyzed_baseline: config.analyzed_count,
      baseline_as_of: config.baseline_as_of,
      live_candidates_analyzed: analyzed.length,
      candidate_pool: config.candidate_pool_count,
      live_portfolio_funds: livePortfolioFunds,
      selected_funds: selected.length,
      note: "Refresh revalidates the pre-screened candidate pool against the latest NAV history and the last full-universe category medians, then reloads available portfolio disclosures.",
    },
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
