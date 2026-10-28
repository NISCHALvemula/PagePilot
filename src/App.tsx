import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Step = { index:number; page:number; hit:boolean; fault:boolean; frames:number[]; evicted:number|null; reason:string; scores:Record<string,number>|null; hits:number; faults:number }
type Result = { algorithm:string; capacity:number; trace:number[]; steps:Step[]; hits:number; faults:number; hit_rate:number; fault_rate:number; evictions:number }
type Comparison = Pick<Result,'algorithm'|'hits'|'faults'|'hit_rate'|'fault_rate'|'evictions'>
const API = '/api'
const defaults = '7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2'
const names:Record<string,string> = { fifo:'FIFO', lru:'LRU', optimal:'Optimal', clock:'Clock', ml:'PagePilot ML' }

async function post<T>(path:string, body:unknown):Promise<T> {
  const response = await fetch(`${API}/${path}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.detail || 'Request failed')
  return data as T
}

export default function App() {
  const [traceText,setTraceText] = useState(defaults)
  const [frames,setFrames] = useState(3)
  const [algorithm,setAlgorithm] = useState('ml')
  const [result,setResult] = useState<Result|null>(null)
  const [comparison,setComparison] = useState<Comparison[]>([])
  const [cursor,setCursor] = useState(0)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [workload,setWorkload] = useState('locality')
  const [apiStatus,setApiStatus] = useState<'checking'|'online'|'offline'>('checking')
  const trace = useMemo(() => traceText.split(/[\s,]+/).filter(Boolean).map(Number),[traceText])
  const current = result?.steps[Math.min(cursor,Math.max(0,(result?.steps.length ?? 1)-1))]

  useEffect(() => { fetch(`${API}/health`).then(r => { if(!r.ok) throw new Error(); return r.json() }).then(() => setApiStatus('online')).catch(() => setApiStatus('offline')) },[])

  async function run(selected=algorithm) {
    setBusy(true); setError('')
    try {
      const data = await post<Result>('simulate',{trace,frames,algorithm:selected})
      setResult(data); setCursor(0); setAlgorithm(selected)
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not run simulation') }
    finally { setBusy(false) }
  }
  async function compareAll() {
    setBusy(true); setError('')
    try { const data = await post<Comparison[]>('compare',{trace,frames}); setComparison(data) }
    catch(e) { setError(e instanceof Error ? e.message : 'Could not compare algorithms') }
    finally { setBusy(false) }
  }
  async function generate() {
    setBusy(true); setError('')
    try { const data = await post<{trace:number[]}>('workload',{kind:workload,length:80,seed:42}); setTraceText(data.trace.join(', ')); setResult(null); setComparison([]) }
    catch(e) { setError(e instanceof Error ? e.message : 'Could not generate workload') }
    finally { setBusy(false) }
  }
  function exportCsv() {
    if (!comparison.length) return
    const csv = ['algorithm,hits,page_faults,hit_rate,fault_rate,evictions',...comparison.map(r=>`${names[r.algorithm] ?? r.algorithm},${r.hits},${r.faults},${r.hit_rate},${r.fault_rate},${r.evictions}`)].join('\n')
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); const a=document.createElement('a'); a.href=url; a.download='pagepilot-comparison.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">P<span>↗</span></div><div><strong>pagepilot</strong><small>VIRTUAL MEMORY LAB</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      <a className="nav-item active" href="#simulator"><span>◫</span> Simulator</a>
      <a className="nav-item" href="#comparison"><span>▥</span> Algorithm comparison</a>
      <a className="nav-item" href="#ml-insights"><span>✳</span> ML insights</a>
      <a className="nav-item" href="#workloads"><span>⌁</span> Workload lab</a>
      <div className="sidebar-bottom"><div className="status-row"><span className={`status-dot ${apiStatus==='online'?'good':apiStatus==='offline'?'bad':''}`}/><span>API {apiStatus==='checking'?'checking':apiStatus}</span></div><div className="sidebar-note">An interactive playground for Operating Systems memory management.</div><div className="version">CBP PROJECT · v1.0</div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><span className="crumb">Workspace</span><span className="crumb-sep">/</span><strong>Virtual memory simulator</strong></div><div className="top-right"><span className="live-pill"><i/> SIMULATION ENVIRONMENT</span><div className="avatar">PP</div></div></header>
      <section className="hero"><div><div className="eyebrow"><span className="eyebrow-line"/> OPERATING SYSTEMS · UNIT IV</div><h1>Make memory <span>make sense.</span></h1><p>Explore page replacement, compare classic algorithms, and see how an ML-assisted policy makes eviction decisions.</p></div><div className="hero-orb"><div className="orb-ring ring-one"/><div className="orb-ring ring-two"/><div className="orb-core">RAM<small>MEMORY</small></div><span className="orb-node node-a">P1</span><span className="orb-node node-b">P4</span><span className="orb-node node-c">P2</span></div></section>
      <section className="metric-grid">
        <Metric label="CURRENT ALGORITHM" value={names[result?.algorithm ?? algorithm]} note="Selected replacement policy" icon="◈" />
        <Metric label="PAGE FAULTS" value={result?.faults ?? '—'} note={result?`${(result.fault_rate*100).toFixed(1)}% fault rate`:'Run a simulation to measure'} icon="↯" />
        <Metric label="PAGE HITS" value={result?.hits ?? '—'} note={result?`${(result.hit_rate*100).toFixed(1)}% hit rate`:'Successful resident-page accesses'} icon="✓" />
        <Metric label="EVICTIONS" value={result?.evictions ?? '—'} note="Pages removed from full memory" icon="⇄" />
      </section>
      {error && <div className="error-banner">{error}</div>}
      <section className="panel simulator-panel" id="simulator">
        <div className="panel-heading"><div><div className="section-kicker">01 / LIVE SIMULATION</div><h2>Memory playground</h2><p>Configure a reference string and watch the frames change at every access.</p></div><span className="panel-chip"><i/> READY TO RUN</span></div>
        <div className="control-grid"><label className="field trace-field"><span>MEMORY REFERENCE STRING</span><input value={traceText} onChange={e=>setTraceText(e.target.value)} placeholder="7, 0, 1, 2, 0, 3..."/><small>Comma or space separated page IDs · up to 500 accesses</small></label><label className="field"><span>FRAME CAPACITY</span><div className="frame-select"><button onClick={()=>setFrames(Math.max(1,frames-1))} aria-label="Decrease frames">−</button><strong>{frames}</strong><button onClick={()=>setFrames(Math.min(32,frames+1))} aria-label="Increase frames">+</button></div><small>Physical RAM frames</small></label><label className="field"><span>REPLACEMENT POLICY</span><select value={algorithm} onChange={e=>setAlgorithm(e.target.value)}>{Object.entries(names).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><small>{algorithm==='ml'?'Learned eviction ranking':'Deterministic algorithm policy'}</small></label><button className="primary-button run-button" disabled={busy} onClick={()=>run()}>{busy?'Running…':'▶  Run simulation'}</button></div>
        <div className="sim-stage"><div className="stage-head"><div><span className="stage-title">PHYSICAL MEMORY</span><span className="stage-sub">{frames} frames allocated</span></div><div className="legend"><span><i className="legend-hit"/> HIT</span><span><i className="legend-fault"/> PAGE FAULT</span></div></div>
          <div className="memory-grid" style={{gridTemplateColumns:`repeat(${frames}, minmax(0,1fr))`}}>{Array.from({length:frames},(_,i)=>({slot:i,page:current?.frames[i]})).map(cell=><div className={`memory-cell ${current && cell.page!==undefined?'occupied':''} ${current?.evicted!==null && current?.evicted===cell.page?'evicted':''}`} key={cell.slot}><div className="cell-top"><span>FRAME {String(cell.slot).padStart(2,'0')}</span><span className="cell-led"/></div><div className="cell-page">{cell.page===undefined?'—':`P${cell.page}`}</div><div className="cell-foot">{cell.page===undefined?'EMPTY':'RESIDENT PAGE'}</div></div>)}</div>
          <div className="timeline"><div className="timeline-title"><span>ACCESS TIMELINE</span><span>{result?`${Math.min(cursor+1,result.steps.length)} / ${result.steps.length} steps`:'Awaiting simulation'}</span></div><div className="timeline-track">{(result?.steps ?? []).map((step,i)=><button key={i} className={`timeline-step ${step.hit?'hit':'fault'} ${i===cursor?'selected':''}`} onClick={()=>setCursor(i)} title={`Access ${step.page}: ${step.hit?'hit':'fault'}`}>{step.page}</button>)}</div><div className="timeline-controls"><button className="secondary-button" onClick={()=>setCursor(Math.max(0,cursor-1))} disabled={!result||cursor===0}>← Previous</button><button className="secondary-button" onClick={()=>setCursor(Math.min((result?.steps.length??1)-1,cursor+1))} disabled={!result||cursor>=result.steps.length-1}>Next step →</button></div></div>
          {current && <div className={`decision ${current.hit?'decision-hit':'decision-fault'}`}><div className="decision-icon">{current.hit?'✓':'↯'}</div><div><strong>{current.hit?`Page ${current.page} is a hit`:`Page ${current.page} caused a page fault`}</strong><p>{current.reason}{current.evicted!==null?` Evicted page ${current.evicted}.`:''}</p></div><span className="decision-tag">{current.hit?'HIT':'FAULT'}</span></div>}
        </div>
      </section>
      <section className="panel" id="comparison"><div className="panel-heading"><div><div className="section-kicker">02 / BENCHMARKS</div><h2>Algorithm comparison</h2><p>Run identical inputs through all five policies. Results are computed by the simulation engine.</p></div><div className="button-row"><button className="secondary-button" disabled={busy} onClick={compareAll}>Compare all ↗</button><button className="icon-button" title="Export CSV" onClick={exportCsv} disabled={!comparison.length}>⇩</button></div></div>
        {comparison.length ? <><div className="chart-wrap"><ResponsiveContainer width="100%" height={230}><BarChart data={comparison.map(r=>({...r,label:names[r.algorithm]}))} margin={{top:12,right:10,left:-18,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="#202b3d" vertical={false}/><XAxis dataKey="label" tick={{fill:'#8d9ab0',fontSize:12}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fill:'#8d9ab0',fontSize:12}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:'#101827',border:'1px solid #29364b',borderRadius:10,color:'#e7edf7'}}/><Bar dataKey="faults" name="Page faults" fill="#6f7dff" radius={[5,5,0,0]} /></BarChart></ResponsiveContainer></div><div className="table-scroll"><table><thead><tr><th>POLICY</th><th>PAGE HITS</th><th>PAGE FAULTS</th><th>HIT RATE</th><th>EVICTIONS</th></tr></thead><tbody>{comparison.map(r=><tr key={r.algorithm}><td><span className={`policy-dot ${r.algorithm==='ml'?'ml-dot':''}`}/>{names[r.algorithm]}</td><td>{r.hits}</td><td className="number-strong">{r.faults}</td><td>{(r.hit_rate*100).toFixed(1)}%</td><td>{r.evictions}</td></tr>)}</tbody></table></div></> : <div className="empty-state"><div className="empty-icon">▥</div><strong>No benchmark results yet</strong><span>Run a simulation, then compare all algorithms on the same reference string.</span><button className="secondary-button" onClick={compareAll} disabled={busy}>Run comparison</button></div>}
      </section>
      <div className="two-column"><section className="panel" id="ml-insights"><div className="section-kicker">03 / INTELLIGENCE</div><h2>Inside the ML policy</h2><p className="panel-description">PagePilot trains a lightweight logistic scoring model on synthetic traces labelled by an offline Optimal-policy teacher.</p><div className="feature-list"><Feature title="Historical recency" detail="How long since a page was last accessed."/><Feature title="Recent frequency" detail="How often it appeared in the recent access window."/><Feature title="Lifetime frequency" detail="Historical reuse frequency before the current decision."/><Feature title="Resident-set position" detail="A deterministic tie-breaking signal from frame order."/></div><div className="note-box"><strong>Honest by design</strong><p>Future accesses generate teacher labels only. The model's input features use history available at decision time. ML may perform worse than LRU on some workloads.</p></div></section>
      <section className="panel" id="workloads"><div className="section-kicker">04 / EXPERIMENT LAB</div><h2>Generate a workload</h2><p className="panel-description">Explore how different memory-access patterns affect replacement policies.</p><label className="field workload-field"><span>ACCESS PATTERN</span><select value={workload} onChange={e=>setWorkload(e.target.value)}><option value="locality">Locality-heavy</option><option value="sequential">Sequential scan</option><option value="looping">Repeated loop</option><option value="random">Random access</option><option value="phase-change">Phase change</option></select></label><div className="workload-preview"><div><span>TRACE LENGTH</span><strong>80 accesses</strong></div><div><span>RANDOM SEED</span><strong>42 · reproducible</strong></div></div><button className="primary-button full-button" disabled={busy} onClick={generate}>Generate reference string ↗</button><p className="tiny-note">Generated traces replace the current input. Run a simulation after generation to see results.</p></section></div>
      <footer><div className="footer-brand">PAGEPILOT <span>·</span> OS UNIT IV CBP</div><span>Educational simulator · Not a real kernel memory manager</span><a href={`${API}/health`} target="_blank" rel="noreferrer">API status ↗</a></footer>
    </main>
  </div>
}

function Metric({label,value,note,icon}:{label:string,value:string|number,note:string,icon:string}) { return <div className="metric-card"><div className="metric-top"><span>{label}</span><i>{icon}</i></div><strong>{value}</strong><small>{note}</small></div> }
function Feature({title,detail}:{title:string,detail:string}) { return <div className="feature-item"><span className="feature-check">✓</span><div><strong>{title}</strong><p>{detail}</p></div></div> }
