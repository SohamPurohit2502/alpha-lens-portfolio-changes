"use client";

import { useMemo, useState } from "react";
import initialData from "./portfolio-data.json";

type MonthWeights = Record<string, number | null>;
type MoveRow = { scheme_code:number; scheme:string; cohort:string; change_type:string; security:string; month_weights:MonthWeights; delta_pp:number|null; significance:string };
type Fund = { scheme_code:number; scheme:string; short_name:string; category:string; cohort:string; confidence:string; eligible_windows:number; positive_alpha_windows:number; eligible_sharpe_windows:number; sharpe_wins:number; portfolio_months?:string[]; rank?:number };
type RefreshScope = { full_universe_baseline:number; analyzed_baseline:number; baseline_as_of:string; live_candidates_analyzed:number; candidate_pool:number; live_portfolio_funds:number; selected_funds:number; note:string };
type SiteData = { as_of:string; refreshed_at?:string; funds:Fund[]; portfolio_rows:MoveRow[]; portfolio_months:string[]; refresh_scope?:RefreshScope };
type SortKey = "security"|"fund"|"move"|"delta"|`month:${string}`;
type SortState = { key:SortKey; direction:"asc"|"desc" };

declare global {
  interface Window { __ALPHA_LENS_REFRESH_API__?: string }
}

const defaultMonths = initialData.funds[0]?.portfolio_months ?? ["Jul-26","Jun-26","May-26","Apr-26"];
const normalizedInitial: SiteData = {
  as_of: initialData.as_of,
  funds: initialData.funds,
  portfolio_months: defaultMonths,
  portfolio_rows: initialData.portfolio_rows.map((row) => ({
    scheme_code:row.scheme_code, scheme:row.scheme, cohort:row.cohort, change_type:row.change_type,
    security:row.security, delta_pp:row.delta_pp, significance:row.significance,
    month_weights:Object.fromEntries(defaultMonths.map((month,index)=>[month,[row.jul_weight,row.jun_weight,row.may_weight,row.apr_weight][index]??null])),
  })),
};
const moveTypes = ["All moves","New position","Exited position","Weight increased","Weight reduced"] as const;
const moveMeta:Record<string,{short:string;symbol:string}> = {
  "New position":{short:"New",symbol:"+"}, "Exited position":{short:"Exit",symbol:"×"},
  "Weight increased":{short:"Added",symbol:"↑"}, "Weight reduced":{short:"Reduced",symbol:"↓"},
};
const monthName=(label:string)=>label.replace("-"," ’");
const fmt=(value:number|null)=>value==null?"—":`${value.toFixed(2)}%`;
const fmtDate=(value:string)=>new Intl.DateTimeFormat("en-IN",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${value}T00:00:00Z`));
const magnitude=(row:MoveRow)=>row.delta_pp!=null?Math.abs(row.delta_pp):Math.max(0,...Object.values(row.month_weights).filter((v):v is number=>v!=null));
const xmlEscape=(value:unknown)=>String(value??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[c]!);
const excelCell=(value:string|number|null,style="Body")=>value==null
  ?`<Cell ss:StyleID="${style}"><Data ss:Type="String"></Data></Cell>`
  :typeof value==="number"?`<Cell ss:StyleID="${style}"><Data ss:Type="Number">${value}</Data></Cell>`
  :`<Cell ss:StyleID="${style}"><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;

export default function Home(){
  const [siteData,setSiteData]=useState<SiteData>(normalizedInitial);
  const [fund,setFund]=useState("All funds");
  const [moveType,setMoveType]=useState<(typeof moveTypes)[number]>("All moves");
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<SortState>({key:"delta",direction:"desc"});
  const [visible,setVisible]=useState(40);
  const [refreshing,setRefreshing]=useState(false);
  const [refreshError,setRefreshError]=useState("");
  const months=siteData.portfolio_months.slice(0,4);
  const newestMonth=months[0]??"Latest", oldestMonth=months.at(-1)??"Oldest";
  const fundByCode=useMemo(()=>Object.fromEntries(siteData.funds.map((item)=>[item.scheme_code,item])),[siteData.funds]);
  const counts=useMemo(()=>Object.fromEntries(moveTypes.slice(1).map((type)=>[type,siteData.portfolio_rows.filter((row)=>row.change_type===type).length])),[siteData.portfolio_rows]);
  const fundSummary=useMemo(()=>siteData.funds.map((item)=>{
    const rows=siteData.portfolio_rows.filter((row)=>row.scheme_code===item.scheme_code);
    return {...item,total:rows.length,additions:rows.filter((r)=>r.change_type==="New position"||r.change_type==="Weight increased").length,reductions:rows.filter((r)=>r.change_type==="Exited position"||r.change_type==="Weight reduced").length};
  }).sort((a,b)=>b.total-a.total),[siteData]);
  const filtered=useMemo(()=>{
    const normalized=query.trim().toLowerCase();
    const rows=siteData.portfolio_rows.filter((row)=>{const name=fundByCode[row.scheme_code]?.short_name??row.scheme;return(fund==="All funds"||name===fund)&&(moveType==="All moves"||row.change_type===moveType)&&(!normalized||`${row.security} ${name}`.toLowerCase().includes(normalized));});
    return [...rows].sort((a,b)=>{
      const fa=fundByCode[a.scheme_code]?.short_name??a.scheme,fb=fundByCode[b.scheme_code]?.short_name??b.scheme;let c=0;
      if(sort.key==="security")c=a.security.localeCompare(b.security);else if(sort.key==="fund")c=fa.localeCompare(fb);else if(sort.key==="move")c=a.change_type.localeCompare(b.change_type);else if(sort.key==="delta")c=magnitude(a)-magnitude(b);else{const m=sort.key.slice(6);c=(a.month_weights[m]??-Infinity)-(b.month_weights[m]??-Infinity);}return sort.direction==="asc"?c:-c;
    });
  },[siteData.portfolio_rows,fund,moveType,query,sort,fundByCode]);
  const topMoves=useMemo(()=>[...siteData.portfolio_rows].sort((a,b)=>magnitude(b)-magnitude(a)).slice(0,6),[siteData.portfolio_rows]);
  const chooseFund=(name:string)=>{setFund(name);setVisible(40);document.getElementById("explorer")?.scrollIntoView({behavior:"smooth"});};
  const toggleSort=(key:SortKey)=>{setSort((current)=>current.key===key?{key,direction:current.direction==="asc"?"desc":"asc"}:{key,direction:key==="security"||key==="fund"||key==="move"?"asc":"desc"});setVisible(40);};
  const sortArrow=(key:SortKey)=>sort.key===key?(sort.direction==="asc"?" ↑":" ↓"):" ↕";

  const refresh=async()=>{
    setRefreshing(true);setRefreshError("");
    try{const endpoint=window.__ALPHA_LENS_REFRESH_API__??"/api/refresh";const response=await fetch(endpoint,{method:"POST",cache:"no-store"});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Refresh could not be completed.");setSiteData(payload as SiteData);setFund("All funds");setMoveType("All moves");setVisible(40);}
    catch(error){setRefreshError(error instanceof Error?error.message:"Refresh could not be completed. The current data is still shown.");}
    finally{setRefreshing(false);}
  };
  const downloadExcel=()=>{
    const explorerHeaders=["Fund","Cohort","Security","Move type",...months.map((m)=>`${monthName(m)} exposure (%)`),"Delta (pp)","Significance"];
    const explorerRows=filtered.map((row)=>[fundByCode[row.scheme_code]?.short_name??row.scheme,row.cohort,row.security,row.change_type,...months.map((m)=>row.month_weights[m]),row.delta_pp,row.significance]);
    const fundHeaders=["Rank","Fund","Category","Cohort","Alpha hit rate","Sharpe win rate","Portfolio months"];
    const fundRows=siteData.funds.map((item,index)=>[item.rank??index+1,item.short_name,item.category,item.cohort,item.eligible_windows?item.positive_alpha_windows/item.eligible_windows:0,item.eligible_sharpe_windows?item.sharpe_wins/item.eligible_sharpe_windows:0,(item.portfolio_months??months).map(monthName).join(", ")]);
    const worksheet=(name:string,title:string,headers:string[],rows:Array<Array<string|number|null>>,percent:number[]=[])=>`<Worksheet ss:Name="${xmlEscape(name)}"><Table><Row ss:Height="34"><Cell ss:MergeAcross="${headers.length-1}" ss:StyleID="Title"><Data ss:Type="String">${xmlEscape(title)}</Data></Cell></Row><Row ss:Height="22">${headers.map((h)=>excelCell(h,"Header")).join("")}</Row>${rows.map((row)=>`<Row>${row.map((v,i)=>excelCell(v,percent.includes(i)?"Percent":"Body")).join("")}</Row>`).join("")}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>2</SplitHorizontal><TopRowBottomPane>2</TopRowBottomPane><AutoFilter x:Range="R2C1:R${rows.length+2}C${headers.length}" xmlns:x="urn:schemas-microsoft-com:office:excel"/></WorksheetOptions></Worksheet>`;
    const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel"><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Aptos" ss:Size="10"/></Style><Style ss:ID="Title"><Font ss:FontName="Aptos Display" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#17212B" ss:Pattern="Solid"/></Style><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#17212B"/><Interior ss:Color="#8ED9C1" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#527C70"/></Borders></Style><Style ss:ID="Body"><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DDD9"/></Borders></Style><Style ss:ID="Percent"><NumberFormat ss:Format="0.00%"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D7DDD9"/></Borders></Style></Styles>${worksheet("Explorer",`Alpha Lens explorer · ${filtered.length} matching material moves`,explorerHeaders,explorerRows)}${worksheet("Fund Selection",`High-alpha selection · ${siteData.refreshed_at?new Date(siteData.refreshed_at).toLocaleString("en-IN"):fmtDate(siteData.as_of)}`,fundHeaders,fundRows,[4,5])}</Workbook>`;
    const blob=new Blob([xml],{type:"application/vnd.ms-excel;charset=utf-8"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`alpha-lens-explorer-${siteData.as_of}.xls`;link.click();URL.revokeObjectURL(link.href);
  };
  const tableColumns=`minmax(280px,1.5fr) 120px 130px repeat(${months.length},88px) 82px`;

  return <main>
    <header className="topbar"><a className="brand" href="#top" aria-label="Alpha Lens home"><span className="brand-mark">A</span><span>ALPHA LENS</span></a><nav aria-label="Primary navigation"><a href="#funds">Funds</a><a href="#signals">Signals</a><a href="#explorer">Explorer</a></nav><button className="refresh-button compact" onClick={refresh} disabled={refreshing}><span className={refreshing?"spinner":"refresh-icon"}>↻</span>{refreshing?"Refreshing":"Refresh data"}</button></header>
    <section className="hero" id="top"><div><p className="eyebrow">ACTIVE EQUITY · PORTFOLIO INTELLIGENCE</p><h1>Where fund managers<br/>are changing their minds.</h1><p className="hero-copy">Material stock additions, exits and conviction shifts across high-alpha actively managed equity funds—refreshed from current NAV history and available portfolio disclosures.</p><a className="hero-link" href="#explorer">Explore every move <span>↘</span></a></div><div className="hero-number"><strong>{siteData.portfolio_rows.length}</strong><span>material stock moves</span><small>{siteData.funds.length} funds · {months.length} disclosure months</small></div></section>
    <section className="refresh-strip" aria-live="polite"><div><span className="live-dot"/><strong>{siteData.refreshed_at?`Live refresh · ${new Date(siteData.refreshed_at).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"})}`:`Baseline · ${fmtDate(siteData.as_of)}`}</strong><p>{siteData.refresh_scope?.note??"Click refresh to revalidate the high-alpha candidate pool, rerank qualifying funds and reload their latest available portfolio disclosures."}</p></div><button className="refresh-button" onClick={refresh} disabled={refreshing}><span className={refreshing?"spinner":"refresh-icon"}>↻</span>{refreshing?"Checking NAVs & disclosures…":"Refresh selection + portfolios"}</button>{refreshError&&<p className="refresh-error">{refreshError}</p>}{siteData.refresh_scope&&<div className="scope-stats"><span><b>{siteData.refresh_scope.live_candidates_analyzed}</b> candidates checked</span><span><b>{siteData.refresh_scope.selected_funds}</b> funds selected</span><span><b>{siteData.refresh_scope.live_portfolio_funds}</b> live disclosures</span><span>Peer baseline: <b>{siteData.refresh_scope.analyzed_baseline}</b> schemes</span></div>}</section>
    <section className="pulse" aria-label="Portfolio change summary">{moveTypes.slice(1).map((type)=><button className={`pulse-card ${type.toLowerCase().replaceAll(" ","-")}`} key={type} onClick={()=>{setMoveType(type);document.getElementById("explorer")?.scrollIntoView({behavior:"smooth"});}}><span>{type}</span><strong>{counts[type]}</strong><small>View moves ↗</small></button>)}</section>
    <section className="fund-section" id="funds"><div className="section-intro split-intro"><div><p className="eyebrow">FUND ACTIVITY</p><h2>Who moved the most?</h2></div><p>Activity count is not a performance score. It shows how many holdings crossed the materiality threshold between {monthName(oldestMonth)} and {monthName(newestMonth)}.</p></div><div className="fund-grid">{fundSummary.map((item,index)=><button className="fund-card" key={item.scheme_code} onClick={()=>chooseFund(item.short_name)}><div className="fund-card-top"><span>{String(index+1).padStart(2,"0")}</span><span>{item.cohort.replace(" leader","")}</span></div><h3>{item.short_name}</h3><div className="activity-meter"><i style={{width:`${fundSummary[0]?.total?(item.total/fundSummary[0].total)*100:0}%`}}/></div><div className="fund-stats"><strong>{item.total}<small> total</small></strong><span><b>{item.additions}</b> add / <b>{item.reductions}</b> reduce</span></div></button>)}</div></section>
    <section className="signals" id="signals"><div className="section-intro split-intro light"><div><p className="eyebrow">LARGEST SIGNALS</p><h2>The biggest conviction shifts.</h2></div><p>Ranked by absolute weight change across the oldest and newest available disclosure months, or by opening/closing weight for new and exited positions.</p></div><div className="signal-grid">{topMoves.map((row,index)=>{const meta=moveMeta[row.change_type];return <article className={`signal-card ${row.change_type.toLowerCase().replaceAll(" ","-")}`} key={`${row.scheme_code}-${row.security}`}><div className="signal-rank">{String(index+1).padStart(2,"0")}</div><div className="signal-symbol">{meta.symbol}</div><span className="signal-type">{row.change_type}</span><h3>{row.security}</h3><p>{fundByCode[row.scheme_code]?.short_name??row.scheme}</p><div className="signal-values"><span>{monthName(oldestMonth)}<b>{fmt(row.month_weights[oldestMonth])}</b></span><span>{monthName(newestMonth)}<b>{fmt(row.month_weights[newestMonth])}</b></span></div><strong className="signal-magnitude">{magnitude(row).toFixed(2)}<small>{row.delta_pp==null?"% wt":"pp"}</small></strong></article>;})}</div></section>
    <section className="explorer" id="explorer"><div className="section-intro split-intro"><div><p className="eyebrow">MOVE EXPLORER</p><h2>Inspect every material change.</h2></div><p>Every available monthly exposure is shown. New or exited holdings qualify at ≥0.50% weight; existing holdings qualify at an absolute move of ≥0.50 percentage points.</p></div><div className="explorer-actions"><div><strong>{months.length}-month exposure view</strong><span>{months.slice().reverse().map(monthName).join(" → ")}</span></div><button className="download-button" onClick={downloadExcel}><span>↓</span> Download current explorer</button></div>
      <div className="filter-panel"><label className="search-box"><span>⌕</span><input value={query} onChange={(e)=>{setQuery(e.target.value);setVisible(40);}} placeholder="Search a stock or fund"/></label><label><span className="control-label">Fund</span><select value={fund} onChange={(e)=>{setFund(e.target.value);setVisible(40);}}><option>All funds</option>{siteData.funds.map((item)=><option key={item.scheme_code}>{item.short_name}</option>)}</select></label><label><span className="control-label">Order</span><select value={`${sort.key}:${sort.direction}`} onChange={(e)=>{const value=e.target.value,cut=value.lastIndexOf(":");setSort({key:value.slice(0,cut) as SortKey,direction:value.slice(cut+1) as "asc"|"desc"});}}><option value="delta:desc">Largest change</option><option value="security:asc">Stock A–Z</option><option value="fund:asc">Fund A–Z</option></select></label></div>
      <div className="type-tabs">{moveTypes.map((type)=><button className={moveType===type?"active":""} key={type} onClick={()=>{setMoveType(type);setVisible(40);}}>{type}<span>{type==="All moves"?siteData.portfolio_rows.length:counts[type]}</span></button>)}</div><div className="result-meta"><strong>{filtered.length}</strong> matching moves <span className="sort-hint">Click any column heading to sort</span><button onClick={()=>{setFund("All funds");setMoveType("All moves");setQuery("");}}>Reset filters</button></div>
      <div className="table-scroll"><div className="moves-table" role="table" style={{minWidth:`${650+months.length*106}px`}}><div className="table-head" role="row" style={{gridTemplateColumns:tableColumns}}><button onClick={()=>toggleSort("security")}>Security{sortArrow("security")}</button><button onClick={()=>toggleSort("move")}>Move{sortArrow("move")}</button><button onClick={()=>toggleSort("fund")}>Fund{sortArrow("fund")}</button>{months.map((m)=><button key={m} onClick={()=>toggleSort(`month:${m}`)}>{monthName(m)}{sortArrow(`month:${m}`)}</button>)}<button onClick={()=>toggleSort("delta")}>Δ pp{sortArrow("delta")}</button></div>{filtered.slice(0,visible).map((row,index)=>{const meta=moveMeta[row.change_type];return <article className="data-row" role="row" style={{gridTemplateColumns:tableColumns}} key={`${row.scheme_code}-${row.security}-${index}`}><div className="security-cell"><strong>{row.security}</strong><span>{row.significance}</span></div><span className={`type-pill ${row.change_type.toLowerCase().replaceAll(" ","-")}`}><b>{meta.symbol}</b>{meta.short}</span><span className="fund-cell">{fundByCode[row.scheme_code]?.short_name??row.scheme}</span>{months.map((m)=><span className="number-cell" key={m}>{fmt(row.month_weights[m])}</span>)}<strong className={`delta ${row.delta_pp==null?"neutral":row.delta_pp>=0?"positive":"negative"}`}>{row.delta_pp==null?"—":`${row.delta_pp>0?"+":""}${row.delta_pp.toFixed(2)}`}</strong></article>;})}</div></div>{visible<filtered.length&&<button className="load-more" onClick={()=>setVisible((v)=>v+40)}>Show 40 more <span>{filtered.length-visible} remaining</span></button>}
    </section>
    <footer><div className="footer-brand"><span className="brand-mark">A</span><strong>ALPHA LENS</strong></div><p>Portfolio comparisons use the latest 3–4 disclosure months available from the source. Weight changes may reflect trading and market-price movement. Validate conclusions with AMC disclosures.</p><p className="disclaimer">Research screen only · Not investment advice</p></footer>
  </main>;
}
