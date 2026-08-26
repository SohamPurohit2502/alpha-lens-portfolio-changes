"use client";

import { useMemo, useState } from "react";
import data from "./portfolio-data.json";

type MoveRow = (typeof data.portfolio_rows)[number];
const moveTypes = ["All moves", "New position", "Exited position", "Weight increased", "Weight reduced"] as const;

const moveMeta: Record<string, { short: string; symbol: string }> = {
  "New position": { short: "New", symbol: "+" },
  "Exited position": { short: "Exit", symbol: "×" },
  "Weight increased": { short: "Added", symbol: "↑" },
  "Weight reduced": { short: "Reduced", symbol: "↓" },
};

const moveMagnitude = (row: MoveRow) =>
  Math.abs(row.delta_pp ?? row.jul_weight ?? row.apr_weight ?? 0);

const fmt = (value: number | null) => value == null ? "—" : `${value.toFixed(2)}%`;

export default function Home() {
  const [fund, setFund] = useState("All funds");
  const [moveType, setMoveType] = useState<(typeof moveTypes)[number]>("All moves");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("magnitude");
  const [visible, setVisible] = useState(40);

  const fundByCode = useMemo(
    () => Object.fromEntries(data.funds.map((item) => [item.scheme_code, item])),
    [],
  );

  const counts = useMemo(
    () => Object.fromEntries(
      moveTypes.slice(1).map((type) => [type, data.portfolio_rows.filter((row) => row.change_type === type).length]),
    ),
    [],
  );

  const fundSummary = useMemo(() => data.funds.map((item) => {
    const rows = data.portfolio_rows.filter((row) => row.scheme_code === item.scheme_code);
    return {
      ...item,
      total: rows.length,
      additions: rows.filter((row) => row.change_type === "New position" || row.change_type === "Weight increased").length,
      reductions: rows.filter((row) => row.change_type === "Exited position" || row.change_type === "Weight reduced").length,
    };
  }).sort((a, b) => b.total - a.total), []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows = data.portfolio_rows.filter((row) => {
      const fundName = fundByCode[row.scheme_code]?.short_name ?? row.scheme;
      return (fund === "All funds" || fundName === fund)
        && (moveType === "All moves" || row.change_type === moveType)
        && (!normalized || `${row.security} ${fundName}`.toLowerCase().includes(normalized));
    });
    return rows.sort((a, b) => sort === "security"
      ? a.security.localeCompare(b.security)
      : moveMagnitude(b) - moveMagnitude(a));
  }, [fund, moveType, query, sort, fundByCode]);

  const topMoves = useMemo(
    () => [...data.portfolio_rows].sort((a, b) => moveMagnitude(b) - moveMagnitude(a)).slice(0, 6),
    [],
  );

  const chooseFund = (name: string) => {
    setFund(name);
    setVisible(40);
    document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Alpha Lens home">
          <span className="brand-mark">A</span><span>ALPHA LENS</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#funds">Funds</a><a href="#signals">Signals</a><a href="#explorer">Explorer</a>
        </nav>
        <span className="as-of">APR — JUL 2026</span>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">ACTIVE EQUITY · PORTFOLIO INTELLIGENCE</p>
          <h1>Where fund managers<br />are changing their minds.</h1>
          <p className="hero-copy">
            Material stock additions, exits and conviction shifts across a selected set of actively managed equity funds—without the daily market noise.
          </p>
          <a className="hero-link" href="#explorer">Explore every move <span>↘</span></a>
        </div>
        <div className="hero-number">
          <strong>{data.portfolio_rows.length}</strong>
          <span>material stock moves</span>
          <small>12 funds · 4 disclosure months</small>
        </div>
      </section>

      <section className="pulse" aria-label="Portfolio change summary">
        {moveTypes.slice(1).map((type) => (
          <button className={`pulse-card ${type.toLowerCase().replaceAll(" ", "-")}`} key={type} onClick={() => { setMoveType(type); document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth" }); }}>
            <span>{type}</span><strong>{counts[type]}</strong><small>View moves ↗</small>
          </button>
        ))}
      </section>

      <section className="fund-section" id="funds">
        <div className="section-intro split-intro">
          <div><p className="eyebrow">FUND ACTIVITY</p><h2>Who moved the most?</h2></div>
          <p>Activity count is not a performance score. It shows how many holdings crossed the materiality threshold between April and July.</p>
        </div>
        <div className="fund-grid">
          {fundSummary.map((item, index) => (
            <button className="fund-card" key={item.scheme_code} onClick={() => chooseFund(item.short_name)}>
              <div className="fund-card-top"><span>{String(index + 1).padStart(2, "0")}</span><span>{item.cohort.replace(" leader", "")}</span></div>
              <h3>{item.short_name}</h3>
              <div className="activity-meter" aria-label={`${item.total} material moves`}><i style={{ width: `${(item.total / fundSummary[0].total) * 100}%` }} /></div>
              <div className="fund-stats">
                <strong>{item.total}<small> total</small></strong>
                <span><b>{item.additions}</b> add / <b>{item.reductions}</b> reduce</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="signals" id="signals">
        <div className="section-intro split-intro light">
          <div><p className="eyebrow">LARGEST SIGNALS</p><h2>The biggest conviction shifts.</h2></div>
          <p>Ranked by the absolute April-to-July weight change, or by opening/closing weight for new and exited positions.</p>
        </div>
        <div className="signal-grid">
          {topMoves.map((row, index) => {
            const meta = moveMeta[row.change_type];
            return (
              <article className={`signal-card ${row.change_type.toLowerCase().replaceAll(" ", "-")}`} key={`${row.scheme_code}-${row.security}`}>
                <div className="signal-rank">{String(index + 1).padStart(2, "0")}</div>
                <div className="signal-symbol">{meta.symbol}</div>
                <span className="signal-type">{row.change_type}</span>
                <h3>{row.security}</h3>
                <p>{fundByCode[row.scheme_code]?.short_name ?? row.scheme}</p>
                <div className="signal-values"><span>Apr <b>{fmt(row.apr_weight)}</b></span><span>Jul <b>{fmt(row.jul_weight)}</b></span></div>
                <strong className="signal-magnitude">{moveMagnitude(row).toFixed(2)}<small>{row.delta_pp == null ? "% wt" : "pp"}</small></strong>
              </article>
            );
          })}
        </div>
      </section>

      <section className="explorer" id="explorer">
        <div className="section-intro split-intro">
          <div><p className="eyebrow">MOVE EXPLORER</p><h2>Inspect every material change.</h2></div>
          <p>New or exited holdings are included at ≥0.50% portfolio weight. Existing holdings are included when their weight moved by ≥0.50 percentage points.</p>
        </div>

        <div className="filter-panel">
          <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setVisible(40); }} placeholder="Search a stock or fund" aria-label="Search stocks and funds" /></label>
          <label><span className="control-label">Fund</span><select value={fund} onChange={(event) => { setFund(event.target.value); setVisible(40); }}><option>All funds</option>{data.funds.map((item) => <option key={item.scheme_code}>{item.short_name}</option>)}</select></label>
          <label><span className="control-label">Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="magnitude">Largest change</option><option value="security">Stock A–Z</option></select></label>
        </div>

        <div className="type-tabs" role="group" aria-label="Filter by move type">
          {moveTypes.map((type) => <button className={moveType === type ? "active" : ""} key={type} onClick={() => { setMoveType(type); setVisible(40); }}>{type}<span>{type === "All moves" ? data.portfolio_rows.length : counts[type]}</span></button>)}
        </div>

        <div className="result-meta"><strong>{filtered.length}</strong> matching moves <button onClick={() => { setFund("All funds"); setMoveType("All moves"); setQuery(""); }}>Reset filters</button></div>

        <div className="moves-table" role="table" aria-label="Material portfolio changes">
          <div className="table-head" role="row"><span>Security / Fund</span><span>Move</span><span>4-month path</span><span>Apr</span><span>Jul</span><span>Δ pp</span></div>
          {filtered.slice(0, visible).map((row, index) => {
            const weights = [row.apr_weight, row.may_weight, row.jun_weight, row.jul_weight];
            const max = Math.max(...weights.map((value) => value ?? 0), 0.01);
            const meta = moveMeta[row.change_type];
            return (
              <article className="data-row" role="row" key={`${row.scheme_code}-${row.security}-${index}`}>
                <div className="security-cell"><strong>{row.security}</strong><span>{fundByCode[row.scheme_code]?.short_name ?? row.scheme}</span></div>
                <span className={`type-pill ${row.change_type.toLowerCase().replaceAll(" ", "-")}`}><b>{meta.symbol}</b>{meta.short}</span>
                <div className="trajectory" aria-label={`April ${fmt(row.apr_weight)}, May ${fmt(row.may_weight)}, June ${fmt(row.jun_weight)}, July ${fmt(row.jul_weight)}`}>
                  {weights.map((value, month) => <i key={month} style={{ height: value == null ? "3px" : `${Math.max(12, (value / max) * 42)}px` }} />)}
                </div>
                <span className="number-cell">{fmt(row.apr_weight)}</span><span className="number-cell">{fmt(row.jul_weight)}</span>
                <strong className={`delta ${row.delta_pp == null ? "neutral" : row.delta_pp >= 0 ? "positive" : "negative"}`}>{row.delta_pp == null ? "—" : `${row.delta_pp > 0 ? "+" : ""}${row.delta_pp.toFixed(2)}`}</strong>
              </article>
            );
          })}
        </div>
        {visible < filtered.length && <button className="load-more" onClick={() => setVisible((value) => value + 40)}>Show 40 more <span>{filtered.length - visible} remaining</span></button>}
      </section>

      <footer>
        <div className="footer-brand"><span className="brand-mark">A</span><strong>ALPHA LENS</strong></div>
        <p>Portfolio comparisons use April–July 2026 disclosure data. Weight changes may reflect trading and market-price movement. Validate conclusions with AMC disclosures.</p>
        <p className="disclaimer">Research screen only · Not investment advice</p>
      </footer>
    </main>
  );
}
