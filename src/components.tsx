import { useEffect, useState, type ReactNode } from "react";

export type BadgeTone = "demo" | "neutral" | "green" | "cyan" | "amber" | "red" | "violet";
export type StatusTone = "green" | "cyan" | "amber" | "red" | "muted";

const iconPaths: Record<string, ReactNode> = {
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></>,
  crosshair: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></>,
  activity: <><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.8 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.8-1l-1.7.7-1.4-2.4L7.1 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.8-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.8 1l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2Z"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>, arrow: <><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 5v2"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  flask: <><path d="M9 3h6m-5 0v7l-5.4 8.1A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.9L14 10V3"/><path d="M8 15h8"/></>,
  info: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></>,
  key: <><circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 9-9M17 6l2 2m-5 1 2 2"/></>,
  window: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18m-13-3h.01M7 14h4m-4 3h8"/></>,
  sliders: <><path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4"/></>,
  pause: <><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M10 9v6m4-6v6"/></>,
  check: <><path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="10"/></>,
  clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
  link: <><path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 10v-2a4 4 0 0 0-3-3.9m-1-12a4 4 0 0 1 0 7.8"/></>,
  gauge: <><path d="M20 13a8 8 0 1 0-16 0m8-1 4-4m-4 9h.01"/><path d="M5 18h14"/></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18m-5 5h.01"/><path d="M7 5V3h10v2"/></>,
  usercheck: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm9-1 2 2 4-4"/></>,
  play: <><path d="m8 5 12 7-12 7z"/></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5 5 5 5-5m-5 5V3"/></>,
  database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5m-18 7c0 1.7 4 3 9 3s9-1.3 9-3"/></>,
  inbox: <><path d="M4 4h16l2 12h-6l-2 3h-4l-2-3H2L4 4Z"/><path d="M2 16h6l2 3h4l2-3h6"/></>,
  chart: <><path d="M3 3v18h18M18 17V9m-5 8V5m-5 12v-4"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>,
  ban: <><circle cx="12" cy="12" r="10"/><path d="m5 5 14 14"/></>,
};

export function Icon({ name, size = 18 }: { name: string; size?: number }): JSX.Element {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{iconPaths[name] ?? iconPaths.info}</svg>;
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }): JSX.Element { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function StatusDot({ tone = "muted" }: { tone?: StatusTone }): JSX.Element { return <span className={`status-dot dot-${tone}`} aria-hidden="true" />; }
export function Button({ children, icon, onClick, disabled, variant = "primary", className = "" }: { children: ReactNode; icon?: string; onClick?: () => void; disabled?: boolean; variant?: "primary" | "secondary"; className?: string }): JSX.Element { return <button className={`button button-${variant} ${className}`} onClick={onClick} disabled={disabled}>{children}{icon && <Icon name={icon} size={14} />}</button>; }
export function Card({ children, className = "" }: { children: ReactNode; className?: string }): JSX.Element { return <section className={`card ${className}`}>{children}</section>; }
export function GlassPanel({ children, className = "" }: { children: ReactNode; className?: string }): JSX.Element { return <Card className={`glass-panel ${className}`}>{children}</Card>; }
export function GlowCard({ children, className = "" }: { children: ReactNode; className?: string }): JSX.Element { return <Card className={`glow-card ${className}`}>{children}</Card>; }
export function SectionHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }): JSX.Element { return <div className="section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>; }
export function MetricCard({ label, value, detail, icon, tone, trend }: { label: string; value: string; detail: string; icon: string; tone: string; trend: string }): JSX.Element { return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon tone-${tone}`}><Icon name={icon} size={17} /></span></div><div className="metric-value-row"><strong><AnimatedCounter value={value} /></strong><Badge tone={tone as BadgeTone}>{trend}</Badge></div><span className="metric-detail">{detail}</span><div className={`metric-spark spark-${tone}`} aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div></article>; }
export function EmptyState({ icon, title, detail }: { icon: string; title: string; detail: string }): JSX.Element { return <div className="empty-state"><span className="empty-icon"><Icon name={icon} size={18} /></span><strong>{title}</strong><span>{detail}</span></div>; }
export function Freshness({ label, state }: { label: string; state: Date | { updatedAt: Date | null } | null }): JSX.Element { const date = state instanceof Date ? state : state?.updatedAt ?? null; return <div className="freshness"><StatusDot tone={date ? "green" : "muted"} /><span>{label}</span><strong>{date ? `Updated ${date.toLocaleTimeString()}` : "No successful read yet"}</strong></div>; }

export function AnimatedCounter({ value }: { value: string }): JSX.Element {
  const match = value.match(/^([+]?)([\d,]+(?:\.\d+)?)(.*)$/);
  const target = match ? Number(match[2].replaceAll(",", "")) : null;
  const decimals = match?.[2].split(".")[1]?.length ?? 0;
  const [current, setCurrent] = useState(target === null ? value : `${match?.[1]}${(0).toFixed(decimals)}${match?.[3]}`);
  useEffect(() => {
    if (target === null) { setCurrent(value); return; }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setCurrent(value); return; }
    let frame = 0;
    const start = performance.now();
    const duration = 650;
    const tick = (now: number): void => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const number = target * eased;
      const formatted = decimals ? number.toFixed(decimals) : Math.round(number).toLocaleString();
      setCurrent(`${match?.[1]}${formatted}${match?.[3]}`);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setCurrent(value);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, target, decimals]);
  return <span className="animated-counter" aria-label={value}>{current}</span>;
}

export function QuantumNetworkBackground(): JSX.Element {
  return <div className="quantum-background" aria-hidden="true"><svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
    <defs>
      <pattern id="quantum-grid" width="54" height="54" patternUnits="userSpaceOnUse"><path d="M54 0H0V54" fill="none" stroke="#74a9d2" strokeOpacity=".08" strokeWidth=".65" /></pattern>
      <radialGradient id="quantum-halo"><stop stopColor="#53c9e8" stopOpacity=".2"/><stop offset="1" stopColor="#53c9e8" stopOpacity="0"/></radialGradient>
      <linearGradient id="quantum-line"><stop stopColor="#56d9df" stopOpacity="0"/><stop offset=".45" stopColor="#62d7e5" stopOpacity=".55"/><stop offset="1" stopColor="#8e78dc" stopOpacity="0"/></linearGradient>
    </defs>
    <rect width="1600" height="1000" fill="url(#quantum-grid)" />
    <circle cx="1220" cy="180" r="370" fill="url(#quantum-halo)" opacity=".38" />
    <circle cx="340" cy="780" r="420" fill="url(#quantum-halo)" opacity=".2" />
    <g fill="none" stroke="url(#quantum-line)" strokeWidth="1">
      <path className="network-path path-one" d="M-30 530 170 440 330 510 530 350 720 410 930 250 1120 310 1340 140 1640 240" />
      <path className="network-path path-two" d="M80 930 230 750 430 810 600 620 790 670 970 510 1160 570 1320 420 1540 500" />
      <path className="network-path path-three" d="M250-30 370 170 560 120 710 300 900 230 1080 420 1240 350 1420 550 1610 480" />
      <path d="m170 440 60 310m100-240 100 300m100-460 70 270m190-210 80 260m130-420 60 260m190-210 80 110" stroke="#73a9d0" strokeOpacity=".12" strokeDasharray="3 9" />
    </g>
    <g className="quantum-nodes">
      <circle cx="170" cy="440" r="3"/><circle cx="330" cy="510" r="2.5"/><circle cx="530" cy="350" r="3"/><circle cx="720" cy="410" r="2"/><circle cx="930" cy="250" r="3"/><circle cx="1120" cy="310" r="2.5"/><circle cx="1340" cy="140" r="3"/>
      <circle cx="230" cy="750" r="2.5"/><circle cx="430" cy="810" r="2"/><circle cx="600" cy="620" r="3"/><circle cx="790" cy="670" r="2"/><circle cx="970" cy="510" r="3"/><circle cx="1160" cy="570" r="2.4"/><circle cx="1320" cy="420" r="3"/>
    </g>
    <g className="quantum-particles"><circle r="2.5"><animateMotion dur="25s" repeatCount="indefinite" path="M-30 530 170 440 330 510 530 350 720 410 930 250 1120 310 1340 140 1640 240" /></circle><circle r="2"><animateMotion dur="33s" begin="-12s" repeatCount="indefinite" path="M80 930 230 750 430 810 600 620 790 670 970 510 1160 570 1320 420 1540 500" /></circle><circle r="1.7"><animateMotion dur="29s" begin="-8s" repeatCount="indefinite" path="M250-30 370 170 560 120 710 300 900 230 1080 420 1240 350 1420 550 1610 480" /></circle></g>
  </svg></div>;
}

export function SecurityStatus({ label, value, detail, tone = "muted", icon }: { label: string; value: string; detail: string; tone?: StatusTone; icon: string }): JSX.Element {
  return <div className="security-status"><span className={`security-status-icon status-${tone}`}><Icon name={icon} size={17} /></span><span className="security-status-copy"><small>{label}</small><strong><StatusDot tone={tone} />{value}</strong><span>{detail}</span></span></div>;
}

export interface TimelineEvent { time: string; kind: string; title: string; detail: string; tone: string; }
export function SecurityTimeline({ events, compact = false }: { events: TimelineEvent[]; compact?: boolean }): JSX.Element {
  return <div className={`event-list ${compact ? "compact" : ""}`}>{events.map((event) => <div className="event-row" key={`${event.time}-${event.kind}`}><span className={`event-marker tone-${event.tone}`} /><span className="event-time">{event.time}</span><span className="event-body"><span className="event-kind">{event.kind}</span><strong>{event.title}</strong><small>{event.detail}</small></span><Icon name="chevron" size={14} /></div>)}</div>;
}

export function PremiumChart({ title, subtitle, values, tone = "cyan", badge = "DEMO SERIES" }: { title: string; subtitle: string; values: number[]; tone?: "cyan" | "violet"; badge?: string }): JSX.Element {
  const width = 600; const height = 150; const padX = 4; const padY = 12;
  const max = Math.max(...values); const min = Math.min(...values); const range = Math.max(max - min, 1);
  const points = values.map((value, index) => `${padX + (index / Math.max(values.length - 1, 1)) * (width - padX * 2)},${height - padY - ((value - min) / range) * (height - padY * 2)}`);
  const line = points.map((point, index) => `${index ? "L" : "M"}${point}`).join(" ");
  const area = `${line} L${width - padX},${height} L${padX},${height} Z`;
  const gradient = `chart-fill-${tone}`;
  return <section className="premium-chart"><div className="chart-heading"><div><h3>{title}</h3><p>{subtitle}</p></div><Badge tone={tone === "cyan" ? "cyan" : "violet"}>{badge}</Badge></div><svg className={`chart-svg chart-${tone}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}, deterministic demo data`} preserveAspectRatio="none"><defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={tone === "cyan" ? "#54d2d3" : "#a78bfa"} stopOpacity=".24"/><stop offset="1" stopColor={tone === "cyan" ? "#54d2d3" : "#a78bfa"} stopOpacity="0"/></linearGradient></defs><path className="chart-area" d={area} fill={`url(#${gradient})`} /><path className="chart-line" d={line} pathLength="100" /><circle className="chart-endpoint" cx={points.at(-1)?.split(",")[0]} cy={points.at(-1)?.split(",")[1]} r="3.5" /></svg><div className="chart-axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>NOW</span></div></section>;
}
