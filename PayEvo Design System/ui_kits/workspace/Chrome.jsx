// Reusable PayEvo logo + chrome components
const PELogo = ({ size = 32, color = "#2285D0", strokeWidth = 6 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth={strokeWidth}>
    <path d="M 50 8 A 42 42 0 1 1 22 88" strokeLinecap="round"/>
  </svg>
);

const PEWordmark = ({ color = "#444", size = 22 }) => (
  <span style={{ fontFamily: "'Open Sans',sans-serif", fontWeight: 300, fontSize: size, letterSpacing: ".04em", color }}>
    <b style={{ fontWeight: 700 }}>PAY</b>EVO
  </span>
);

const PEBrand = ({ inverse = false }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <PELogo color={inverse ? "#fff" : "#2285D0"} size={26}/>
    <PEWordmark color={inverse ? "#fff" : "#444"} size={20}/>
  </div>
);

const Icon = ({ name, size = 18, color }) => {
  const ref = React.useRef(null);
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons({ nameAttr: "data-lucide", icons: window.lucide.icons }); });
  return <i data-lucide={name} ref={ref} style={{ width: size, height: size, color, display: "inline-flex" }}/>;
};

// Top header bar
const TopHeader = ({ company = "Acme Construction Ltd", user = "Alex Pereira" }) => (
  <header style={{
    height: 56, background: "#fff", borderBottom: "1px solid #E0E0E0",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 20px", flex: "none"
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <Icon name="grid-3x3" size={18} color="#7987A9"/>
      <PEBrand/>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ position: "relative" }}>
        <Icon name="search" size={16} color="#7987A9"/>
        <input placeholder="Search…" style={{
          marginLeft: 8, border: "1px solid #E0E0E0", borderRadius: 5,
          padding: "6px 10px", fontSize: 13, fontFamily: "inherit", width: 220, color: "#444"
        }}/>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#444" }}>
        <span>{company}</span>
        <Icon name="chevron-down" size={14} color="#7987A9"/>
      </div>
      <Icon name="phone" size={18} color="#7987A9"/>
      <div style={{ position: "relative" }}>
        <Icon name="bell" size={18} color="#7987A9"/>
        <span style={{ position: "absolute", top: -4, right: -4, background: "#F8333C", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 999, padding: "1px 4px" }}>3</span>
      </div>
      <Icon name="circle-help" size={18} color="#7987A9"/>
      <div style={{
        width: 30, height: 30, background: "#7987A9", color: "#fff", borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600
      }}>{user.split(" ").map(n=>n[0]).join("")}</div>
    </div>
  </header>
);

// Sidebar
const Sidebar = ({ active, onNav }) => {
  const items = [
    { key: "home", label: "Home", icon: "home" },
    { key: "payroll", label: "Payroll", icon: "banknote" },
    { key: "actions", label: "Actions", icon: "layers" },
    { key: "reports", label: "Reports", icon: "bar-chart-3" },
    { key: "employees", label: "Employees", icon: "users" },
    { key: "settings", label: "Settings", icon: "settings" },
  ];
  return (
    <aside style={{
      width: 220, background: "#fff", borderRight: "1px solid #E0E0E0",
      padding: "16px 8px", flex: "none", display: "flex", flexDirection: "column", gap: 2
    }}>
      {items.map(it => (
        <div key={it.key} onClick={()=>onNav(it.key)} style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "9px 12px", borderRadius: 5, fontSize: 14, cursor: "pointer",
          background: active === it.key ? "#2285D0" : "transparent",
          color: active === it.key ? "#fff" : "#444",
          fontWeight: active === it.key ? 600 : 400
        }}>
          <Icon name={it.icon} size={16} color={active === it.key ? "#fff" : "#7987A9"}/>
          <span>{it.label}</span>
        </div>
      ))}
      <div style={{ marginTop: "auto", padding: 10, fontSize: 11, color: "#7987A9" }}>v3.4.1</div>
    </aside>
  );
};

// Reusable buttons
const Btn = ({ kind = "primary", icon, children, onClick, disabled }) => {
  const styles = {
    primary: { background: "#2285D0", color: "#fff", border: "1px solid #2285D0" },
    secondary: { background: "#fff", color: "#2285D0", border: "1.5px solid #2285D0" },
    tertiary: { background: "transparent", color: "#2285D0", border: "1px solid transparent" },
    danger: { background: "#F8333C", color: "#fff", border: "1px solid #F8333C" },
  }[kind];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...styles, fontFamily: "'Open Sans',sans-serif", fontSize: 14, fontWeight: 600,
      padding: "8px 18px", borderRadius: 5, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6,
      whiteSpace: "nowrap", flex: "none"
    }}>
      {icon && <Icon name={icon} size={14} color="currentColor"/>}
      {children}
    </button>
  );
};

const Badge = ({ kind = "info", children }) => {
  const map = {
    success: { bg: "#F1FFF2", fg: "#317033", dot: "#4CAF50" },
    warning: { bg: "#FFF7DD", fg: "#8C6700", dot: "#F5B700" },
    error:   { bg: "#FFE6E7", fg: "#9E2127", dot: "#F8333C" },
    info:    { bg: "#EBF6FF", fg: "#165585", dot: "#2285D0" },
    neutral: { bg: "#EBEBEB", fg: "#48525C", dot: "#7987A9" },
  }[kind];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px",
      borderRadius: 999, fontSize: 12, fontWeight: 600, background: map.bg, color: map.fg
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: map.dot }}/>
      {children}
    </span>
  );
};

const HeroBand = ({ title, kicker }) => (
  <div style={{
    background: "linear-gradient(135deg,#02314D 0%,#2285D0 100%)",
    minHeight: 96, padding: "20px 24px",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24,
    color: "#fff", borderRadius: "8px 8px 0 0", position: "relative", overflow: "hidden"
  }}>
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(120deg,transparent 60%,rgba(255,255,255,.07) 60% 65%,transparent 65%),linear-gradient(160deg,transparent 70%,rgba(255,255,255,.05) 70% 80%,transparent 80%)", pointerEvents: "none" }}/>
    <div style={{ position: "relative", minWidth: 0, flex: 1 }}>
      {kicker && <div style={{ fontSize: 12, opacity: .8, textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{kicker}</div>}
      <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em", margin: 0, whiteSpace: "nowrap" }}>{title}</h2>
    </div>
    <PEWordmark color="#fff" size={18}/>
  </div>
);

Object.assign(window, { PELogo, PEWordmark, PEBrand, Icon, TopHeader, Sidebar, Btn, Badge, HeroBand });
