import { useMemo, useState, type ReactNode } from "react";
import { BrowserRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";

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

const navigation = [
  { icon: "⌁", label: "Overview", to: "/" },
  { icon: "◇", label: "Insights", to: "/insights" },
  { icon: "◎", label: "Audience", to: "/audience" },
  { icon: "↗", label: "Campaigns", to: "/campaigns" },
] as const;

/** Routed React fixture used to exercise UI Review across client-side pages. */
export function App() {
  return (
    <BrowserRouter>
      <ApplicationShell />
    </BrowserRouter>
  );
}

function ApplicationShell() {
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="product-mark"><span>P</span><strong>Pulseboard</strong></div>
        <nav aria-label="Workspace navigation">
          {navigation.map((item) => (
            <NavLink className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} end={item.to === "/"} key={item.to} to={item.to}>
              <span>{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} to="/settings"><span>⚙</span>Settings</NavLink>
          <button className="profile-button" type="button">
            <span className="avatar">FL</span>
            <span><strong>Fabian Lucas</strong><small>Product workspace</small></span>
            <span>•••</span>
          </button>
        </div>
      </aside>

      <Routes>
        <Route element={<OverviewPage onSearch={() => setCommandOpen(true)} />} path="/" />
        <Route element={<InsightsPage onSearch={() => setCommandOpen(true)} />} path="/insights" />
        <Route element={<AudiencePage onSearch={() => setCommandOpen(true)} />} path="/audience" />
        <Route element={<CampaignsPage onSearch={() => setCommandOpen(true)} />} path="/campaigns" />
        <Route element={<SettingsPage onSearch={() => setCommandOpen(true)} />} path="/settings" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>

      {commandOpen && <SearchDialog onClose={() => setCommandOpen(false)} />}
    </div>
  );
}

function OverviewPage({ onSearch }: { readonly onSearch: () => void }) {
  const [period, setPeriod] = useState<Period>("30d");
  const metrics = useMemo(() => metricsByPeriod[period], [period]);

  return (
    <Page title="Good afternoon, Fabian." kicker="Thursday, July 16" onSearch={onSearch} action="Create report">
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
        <GrowthChart />
        <article className="activity-card">
          <div className="card-header"><div><h2>Recent activity</h2><p>Your team’s latest changes</p></div><NavLink to="/audience">View all</NavLink></div>
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
    </Page>
  );
}

function InsightsPage({ onSearch }: { readonly onSearch: () => void }) {
  return (
    <Page title="Insights" kicker="Reporting workspace" onSearch={onSearch} action="Export view">
      <div className="route-intro"><div><span className="route-badge">Live</span><h2>Signals worth acting on.</h2></div><p>Patterns from acquisition, activation, and retention—ranked by likely impact.</p></div>
      <section className="insights-grid">
        <GrowthChart />
        <article className="signal-stack">
          <div className="signal-item"><span className="signal-index">01</span><div><strong>Tuesday converts 18% better</strong><p>Schedule lifecycle messages between 13:00 and 15:00.</p></div><span className="signal-positive">High impact</span></div>
          <div className="signal-item"><span className="signal-index">02</span><div><strong>Mobile activation is rising</strong><p>Completion improved after the compact onboarding launch.</p></div><span>+12.4%</span></div>
          <div className="signal-item"><span className="signal-index">03</span><div><strong>Organic traffic softened</strong><p>Branded search remains stable while discovery queries declined.</p></div><span className="signal-negative">−4.8%</span></div>
        </article>
      </section>
    </Page>
  );
}

function AudiencePage({ onSearch }: { readonly onSearch: () => void }) {
  const people = [
    ["Ada Miller", "Product", "Berlin", "Active now"],
    ["Jonas Lee", "Growth", "London", "12 min ago"],
    ["Sara Chen", "Design", "Singapore", "1 hour ago"],
    ["Noah Williams", "Engineering", "Toronto", "Yesterday"],
  ] as const;

  return (
    <Page title="Audience" kicker="48,291 active profiles" onSearch={onSearch} action="Invite people">
      <div className="route-intro"><div><span className="route-badge">+14.2%</span><h2>Your audience is becoming more engaged.</h2></div><p>Understand the people behind this month’s growth and where momentum is strongest.</p></div>
      <section className="table-card" aria-labelledby="audience-table-title">
        <div className="table-toolbar"><div><h2 id="audience-table-title">Recently active</h2><p>Sorted by most recent session</p></div><button type="button">Filter profiles</button></div>
        <div className="people-table" role="table" aria-label="Recently active profiles">
          <div className="people-row people-header" role="row"><span>Name</span><span>Team</span><span>Location</span><span>Last seen</span></div>
          {people.map(([name, team, location, lastSeen], index) => (
            <div className="people-row" role="row" key={name}>
              <span><i className={`avatar avatar-${(index % 3) + 1}`}>{name.split(" ").map((part) => part[0]).join("")}</i><strong>{name}</strong></span>
              <span>{team}</span><span>{location}</span><span>{lastSeen}</span>
            </div>
          ))}
        </div>
      </section>
    </Page>
  );
}

function CampaignsPage({ onSearch }: { readonly onSearch: () => void }) {
  const campaigns = [
    { name: "Summer launch", channel: "Email · Social", progress: 76, status: "Live" },
    { name: "Onboarding refresh", channel: "Lifecycle", progress: 52, status: "Live" },
    { name: "Founder stories", channel: "Editorial", progress: 28, status: "Draft" },
  ] as const;

  return (
    <Page title="Campaigns" kicker="3 active initiatives" onSearch={onSearch} action="New campaign">
      <div className="route-intro"><div><span className="route-badge">Q3</span><h2>Every initiative, one clear view.</h2></div><p>Track progress from brief to launch without losing the decisions behind the work.</p></div>
      <section className="campaign-grid">
        {campaigns.map((campaign) => (
          <article className="campaign-card" key={campaign.name}>
            <div><span className="campaign-status">{campaign.status}</span><button aria-label={`More actions for ${campaign.name}`} type="button">•••</button></div>
            <h2>{campaign.name}</h2><p>{campaign.channel}</p>
            <div className="progress-meta"><span>Progress</span><strong>{campaign.progress}%</strong></div>
            <div className="progress-track"><span style={{ width: `${campaign.progress}%` }} /></div>
          </article>
        ))}
      </section>
    </Page>
  );
}

function SettingsPage({ onSearch }: { readonly onSearch: () => void }) {
  return (
    <Page title="Workspace settings" kicker="Product workspace" onSearch={onSearch} action="Save changes">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections"><a className="active" href="#general">General</a><a href="#members">Members</a><a href="#notifications">Notifications</a><a href="#billing">Billing</a></nav>
        <section className="settings-card" id="general">
          <div className="settings-heading"><div><h2>General</h2><p>Manage the details people see across your workspace.</p></div><span className="workspace-avatar">P</span></div>
          <label>Workspace name<input defaultValue="Product workspace" /></label>
          <label>Workspace URL<div className="input-prefix"><span>pulseboard.app/</span><input defaultValue="product" /></div></label>
          <label>Timezone<select defaultValue="Europe/Berlin"><option>Europe/Berlin</option><option>America/New_York</option><option>Asia/Singapore</option></select></label>
          <div className="settings-note"><span>i</span><p>Changes apply to all reports and scheduled summaries in this workspace.</p></div>
        </section>
      </div>
    </Page>
  );
}

function Page({ action, children, kicker, onSearch, title }: {
  readonly action: string;
  readonly children: ReactNode;
  readonly kicker: string;
  readonly onSearch: () => void;
  readonly title: string;
}) {
  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div><p className="kicker">{kicker}</p><h1>{title}</h1></div>
        <div className="header-actions">
          <button className="search-button" type="button" onClick={onSearch}><span>⌕</span>Search anything<kbd>⌘ K</kbd></button>
          <button className="icon-button" type="button" aria-label="Notifications">♢<span className="notification-dot" /></button>
          <button className="create-button" type="button">{action} <span>＋</span></button>
        </div>
      </header>
      {children}
    </main>
  );
}

function GrowthChart() {
  return (
    <article className="chart-card">
      <div className="card-header"><div><h2>Audience growth</h2><p>Unique visitors over time</p></div><button aria-label="More chart options" type="button">•••</button></div>
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
  );
}

function SearchDialog({ onClose }: { readonly onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="command-modal" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(event) => event.stopPropagation()}>
        <label><span>⌕</span><input autoFocus placeholder="Search reports, people, or campaigns…" /></label>
        <p>QUICK ACTIONS</p>
        <button type="button"><span>＋</span>Create a new report<kbd>R</kbd></button>
        <button type="button"><span>◎</span>Open audience explorer<kbd>A</kbd></button>
      </section>
    </div>
  );
}
