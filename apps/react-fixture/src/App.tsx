import { useMemo, useState } from "react";

type Period = "7d" | "30d" | "90d";

type Metric = {
  readonly change: string;
  readonly label: string;
  readonly value: string;
};

const metricsByPeriod: Readonly<Record<Period, readonly Metric[]>> = {
  "7d": [
    { label: "Active users", value: "12,842", change: "+8.4%" },
    { label: "Conversion", value: "6.18%", change: "+0.7%" },
    { label: "Revenue", value: "$84.2k", change: "+12.1%" },
  ],
  "30d": [
    { label: "Active users", value: "48,291", change: "+14.2%" },
    { label: "Conversion", value: "5.84%", change: "+1.2%" },
    { label: "Revenue", value: "$312.6k", change: "+9.8%" },
  ],
  "90d": [
    { label: "Active users", value: "131,508", change: "+21.7%" },
    { label: "Conversion", value: "5.29%", change: "+1.8%" },
    { label: "Revenue", value: "$901.4k", change: "+18.3%" },
  ],
};

const activity = [
  { initials: "AM", name: "Ada Miller", action: "published Summer campaign", time: "4m" },
  { initials: "JL", name: "Jonas Lee", action: "updated onboarding flow", time: "18m" },
  { initials: "SC", name: "Sara Chen", action: "invited 3 collaborators", time: "1h" },
] as const;

export function App() {
  const [period, setPeriod] = useState<Period>("30d");
  const [commandOpen, setCommandOpen] = useState(false);
  const metrics = useMemo(() => metricsByPeriod[period], [period]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="product-mark"><span>P</span><strong>Pulseboard</strong></div>
        <nav aria-label="Workspace navigation">
          <a className="nav-item active" href="#overview"><span>⌁</span>Overview</a>
          <a className="nav-item" href="#insights"><span>◇</span>Insights</a>
          <a className="nav-item" href="#audience"><span>◎</span>Audience</a>
          <a className="nav-item" href="#campaigns"><span>↗</span>Campaigns</a>
        </nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="#settings"><span>⚙</span>Settings</a>
          <button className="profile-button" type="button">
            <span className="avatar">FL</span>
            <span><strong>Fabian Lucas</strong><small>Product workspace</small></span>
            <span>•••</span>
          </button>
        </div>
      </aside>

      <main className="dashboard" id="overview">
        <header className="dashboard-header">
          <div><p className="kicker">Thursday, July 16</p><h1>Good afternoon, Fabian.</h1></div>
          <div className="header-actions">
            <button className="search-button" type="button" onClick={() => setCommandOpen(true)}><span>⌕</span>Search anything<kbd>⌘ K</kbd></button>
            <button className="icon-button" type="button" aria-label="Notifications">♢<span className="notification-dot" /></button>
            <button className="create-button" type="button">Create report <span>＋</span></button>
          </div>
        </header>

        <section aria-labelledby="summary-title">
          <div className="section-bar">
            <div><h2 id="summary-title">Performance summary</h2><p>Compared with the previous period</p></div>
            <div className="period-control" aria-label="Reporting period">
              {(["7d", "30d", "90d"] as const).map((item) => (
                <button className={period === item ? "selected" : ""} key={item} onClick={() => setPeriod(item)} type="button">{item}</button>
              ))}
            </div>
          </div>
          <div className="metric-grid">
            {metrics.map((metric, index) => (
              <article className="metric-card" key={metric.label}>
                <div className={`metric-icon metric-icon-${index + 1}`} aria-hidden="true">{index === 0 ? "↟" : index === 1 ? "◒" : "$"}</div>
                <p>{metric.label}</p><strong>{metric.value}</strong><span>{metric.change}</span>
                <div className={`sparkline sparkline-${index + 1}`} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
              </article>
            ))}
          </div>
        </section>

        <section className="lower-grid">
          <article className="chart-card" id="insights">
            <div className="card-header"><div><h2>Audience growth</h2><p>Unique visitors over time</p></div><button type="button">•••</button></div>
            <div className="chart-area" aria-label="Audience growth line chart">
              <div className="chart-labels"><span>50k</span><span>40k</span><span>30k</span><span>20k</span><span>10k</span></div>
              <svg viewBox="0 0 760 260" role="img" aria-label="Line rising from 18,000 to 48,000 visitors">
                <defs><linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#7668ff" stopOpacity="0.28"/><stop offset="1" stopColor="#7668ff" stopOpacity="0"/></linearGradient></defs>
                <path className="area" d="M0 218 C70 225 92 177 158 188 C225 199 252 131 322 145 C391 159 414 102 482 113 C551 124 586 61 650 78 C704 91 725 39 760 34 L760 260 L0 260Z" />
                <path className="line" d="M0 218 C70 225 92 177 158 188 C225 199 252 131 322 145 C391 159 414 102 482 113 C551 124 586 61 650 78 C704 91 725 39 760 34" />
              </svg>
              <div className="chart-months"><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span></div>
            </div>
          </article>

          <article className="activity-card">
            <div className="card-header"><div><h2>Recent activity</h2><p>Your team’s latest changes</p></div><a href="#all">View all</a></div>
            <div className="activity-list">
              {activity.map((item, index) => (
                <div className="activity-item" key={item.name}>
                  <span className={`avatar avatar-${index + 1}`}>{item.initials}</span>
                  <p><strong>{item.name}</strong><span>{item.action}</span></p><time>{item.time}</time>
                </div>
              ))}
            </div>
            <div className="tip-card"><span>✦</span><div><strong>Weekly insight</strong><p>Your conversion peak is Tuesday at 14:00.</p></div></div>
          </article>
        </section>
      </main>

      {commandOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCommandOpen(false)}>
          <section className="command-modal" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(event) => event.stopPropagation()}>
            <label><span>⌕</span><input autoFocus placeholder="Search reports, people, or campaigns…" /></label>
            <p>QUICK ACTIONS</p>
            <button type="button"><span>＋</span>Create a new report<kbd>R</kbd></button>
            <button type="button"><span>◎</span>Open audience explorer<kbd>A</kbd></button>
          </section>
        </div>
      )}
    </div>
  );
}
