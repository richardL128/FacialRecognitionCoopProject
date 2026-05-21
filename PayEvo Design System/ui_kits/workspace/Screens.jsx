// Workspace screens
const StatCard = ({ label, value, change, tone = "info" }) => (
  <div style={{
    background: "#fff", border: "1px solid #E0E0E0", borderRadius: 5,
    padding: 18, boxShadow: "0 1px 2px rgba(0,0,0,.06),0 2px 8px rgba(0,0,0,.04)"
  }}>
    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "#7987A9", fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-.02em", color: "#444", margin: "8px 0 4px" }}>{value}</div>
    {change && <div style={{ fontSize: 12, color: tone === "info" ? "#2285D0" : "#4CAF50", display: "flex", alignItems: "center", gap: 4 }}>
      <Icon name="trending-up" size={12} color="currentColor"/>{change}
    </div>}
  </div>
);

const HomeScreen = () => (
  <div style={{ padding: 24, overflowY: "auto", height: "100%" }}>
    <HeroBand kicker="Pay period · Apr 16 – Apr 30, 2026" title="Run Payroll"/>
    <div style={{
      background: "#fff", border: "1px solid #E0E0E0", borderTop: 0, borderRadius: "0 0 8px 8px",
      padding: 20, marginBottom: 20
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, color: "#70808F" }}>Next pay date</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#444", margin: "4px 0" }}>April 30, 2026</div>
          <div style={{ fontSize: 13, color: "#70808F" }}>14 employees · $24,182.50 net</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn kind="secondary" icon="calendar">Reschedule</Btn>
          <Btn kind="primary" icon="play">Start Payroll</Btn>
        </div>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
      <StatCard label="Net Pay" value="$24,182.50" change="+3.2% vs last period"/>
      <StatCard label="CPP / EI" value="$3,418.92" change="+1.1%" tone="success"/>
      <StatCard label="Income Tax" value="$5,927.18" change="+2.4%" tone="success"/>
      <StatCard label="Hours Tracked" value="1,284 h" change="+58 h"/>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
      <div style={{ background: "#fff", border: "1px solid #E0E0E0", borderRadius: 5, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#444" }}>Recent Activity</h4>
          <a style={{ fontSize: 13, color: "#2285D0" }}>View all</a>
        </div>
        {[
          { who: "Alex Pereira", what: "submitted timesheet", when: "2h ago", tag: "Pending", kind: "warning" },
          { who: "Maya Singh", what: "approved payroll for Apr 15", when: "Yesterday", tag: "Active", kind: "success" },
          { who: "Daniel Wong", what: "added new employee · Lin Chen", when: "Apr 24", tag: "Active", kind: "success" },
          { who: "Ravi Patel", what: "T4 export failed — retry needed", when: "Apr 23", tag: "Failed", kind: "error" },
        ].map((row, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 0", borderTop: i ? "1px solid #F0F0F0" : "none"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#7987A9", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>
                {row.who.split(" ").map(n=>n[0]).join("")}
              </div>
              <div>
                <div style={{ fontSize: 14, color: "#444" }}><b style={{ fontWeight: 600 }}>{row.who}</b> {row.what}</div>
                <div style={{ fontSize: 12, color: "#7987A9" }}>{row.when}</div>
              </div>
            </div>
            <Badge kind={row.kind}>{row.tag}</Badge>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid #E0E0E0", borderRadius: 5, padding: 20 }}>
        <h4 style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 600, color: "#444" }}>Checklist</h4>
        {[
          { label: "Connect bank account", done: true },
          { label: "Add employees", done: true },
          { label: "Verify CRA business number", done: true },
          { label: "Set up direct deposit", done: false },
          { label: "Submit first payroll", done: false },
        ].map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              background: c.done ? "#4CAF50" : "#fff",
              border: c.done ? "none" : "1.5px solid #C4C4C4",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              {c.done && <Icon name="check" size={12} color="#fff"/>}
            </div>
            <span style={{ fontSize: 14, color: c.done ? "#7987A9" : "#444", textDecoration: c.done ? "line-through" : "none" }}>{c.label}</span>
          </div>
        ))}
        <Btn kind="primary" icon="plus">Continue Setup</Btn>
      </div>
    </div>
  </div>
);

const EmployeesScreen = () => {
  const rows = [
    { name: "Alex Pereira", email: "alex@acmeco.ca", role: "Foreman", dept: "Site Ops", pay: "$32.00/hr", status: "Active" },
    { name: "Maya Singh", email: "maya@acmeco.ca", role: "Project Manager", dept: "Site Ops", pay: "$84,000", status: "Active" },
    { name: "Daniel Wong", email: "dwong@acmeco.ca", role: "Estimator", dept: "Estimating", pay: "$72,500", status: "Active" },
    { name: "Lin Chen", email: "lin@acmeco.ca", role: "Carpenter", dept: "Site Ops", pay: "$28.50/hr", status: "Pending" },
    { name: "Ravi Patel", email: "ravi@acmeco.ca", role: "Bookkeeper", dept: "Admin", pay: "$58,000", status: "Active" },
    { name: "Jordan Reyes", email: "jordan@acmeco.ca", role: "Driver", dept: "Logistics", pay: "$26.00/hr", status: "On Leave" },
    { name: "Priya Kaur", email: "priya@acmeco.ca", role: "Apprentice", dept: "Site Ops", pay: "$22.00/hr", status: "Active" },
    { name: "Sam O'Connor", email: "sam@acmeco.ca", role: "Safety Officer", dept: "Compliance", pay: "$67,000", status: "Inactive" },
  ];
  const statusKind = { Active: "success", Pending: "warning", "On Leave": "info", Inactive: "neutral" };
  return (
    <div style={{ padding: 24, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-.02em", color: "#165585", margin: 0 }}>Employees</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn kind="secondary" icon="upload">Import</Btn>
          <Btn kind="primary" icon="plus">Add Employee</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <div style={{
          flex: 1, background: "#fff", border: "1px solid #C4C4C4", borderRadius: 5,
          padding: "8px 12px", display: "flex", alignItems: "center", gap: 8
        }}>
          <Icon name="search" size={14} color="#7987A9"/>
          <input placeholder="Search by name, email, or role…" style={{
            border: 0, outline: 0, flex: 1, fontSize: 14, fontFamily: "inherit", color: "#444"
          }}/>
        </div>
        <button style={{
          background: "#fff", border: "1px solid #C4C4C4", borderRadius: 5,
          padding: "0 14px", fontSize: 13, color: "#444", display: "flex", alignItems: "center", gap: 6, cursor: "pointer"
        }}>
          <Icon name="filter" size={14} color="#7987A9"/>Filter
          <Badge kind="info">3</Badge>
        </button>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E0E0E0", borderRadius: 5, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#F4F8FB" }}>
              {["Name", "Role", "Department", "Pay rate", "Status", ""].map(h =>
                <th key={h} style={{ textAlign: "left", padding: "12px 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "#7987A9", fontWeight: 600 }}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid #F0F0F0" }}>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#7987A9", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>
                      {r.name.split(" ").map(n=>n[0]).join("")}
                    </div>
                    <div>
                      <div style={{ color: "#444", fontWeight: 600 }}>{r.name}</div>
                      <div style={{ color: "#7987A9", fontSize: 12 }}>{r.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "12px 14px", color: "#444" }}>{r.role}</td>
                <td style={{ padding: "12px 14px", color: "#70808F" }}>{r.dept}</td>
                <td style={{ padding: "12px 14px", color: "#444", fontVariantNumeric: "tabular-nums" }}>{r.pay}</td>
                <td style={{ padding: "12px 14px" }}><Badge kind={statusKind[r.status]}>{r.status}</Badge></td>
                <td style={{ padding: "12px 14px", textAlign: "right" }}>
                  <Icon name="more-horizontal" size={16} color="#7987A9"/>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderTop: "1px solid #F0F0F0", fontSize: 13, color: "#70808F" }}>
          <span>Showing 1–8 of 14</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ background: "#fff", border: "1px solid #E0E0E0", borderRadius: 5, padding: "4px 8px", cursor: "pointer" }}>‹</button>
            <button style={{ background: "#2285D0", color: "#fff", border: 0, borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}>1</button>
            <button style={{ background: "#fff", border: "1px solid #E0E0E0", borderRadius: 5, padding: "4px 10px", cursor: "pointer" }}>2</button>
            <button style={{ background: "#fff", border: "1px solid #E0E0E0", borderRadius: 5, padding: "4px 8px", cursor: "pointer" }}>›</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ReportsScreen = () => (
  <div style={{ padding: 24, overflowY: "auto", height: "100%" }}>
    <h2 style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-.02em", color: "#165585", margin: "0 0 18px" }}>Reports</h2>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
      {[
        { t: "Payroll Summary", d: "All pay periods, totals by employee", icon: "file-text" },
        { t: "T4 Slips", d: "Year-end CRA-formatted T4s", icon: "file-text" },
        { t: "Source Deductions", d: "CPP, EI, income tax remittances", icon: "calculator" },
        { t: "Records of Employment", d: "Generate ROE for departures", icon: "clipboard-check" },
        { t: "Hours Worked", d: "Timesheet exports by department", icon: "timer" },
        { t: "Audit Log", d: "Every change, every user", icon: "shield-check" },
      ].map((r, i) => (
        <div key={i} style={{
          background: "#fff", border: "1px solid #E0E0E0", borderRadius: 5, padding: 18,
          display: "flex", flexDirection: "column", gap: 10, cursor: "pointer"
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 5, background: "#EBF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={r.icon} size={20} color="#2285D0"/>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#444" }}>{r.t}</div>
            <div style={{ fontSize: 13, color: "#70808F", marginTop: 4 }}>{r.d}</div>
          </div>
          <a style={{ fontSize: 13, color: "#2285D0", marginTop: "auto" }}>Generate →</a>
        </div>
      ))}
    </div>
  </div>
);

const LoginScreen = ({ onLogin }) => (
  <div style={{ minHeight: "100%", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
    <div style={{
      background: "linear-gradient(135deg,#02314D 0%,#2285D0 100%)",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      padding: 60, color: "#fff", position: "relative", overflow: "hidden"
    }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(120deg,transparent 60%,rgba(255,255,255,.06) 60% 65%,transparent 65%)" }}/>
      <PEBrand inverse/>
      <div style={{ position: "relative" }}>
        <h1 style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-.02em", lineHeight: 1.05, margin: "0 0 16px" }}>
          Easy, fast and<br/>affordable payroll<br/>for your team.
        </h1>
        <p style={{ fontSize: 16, opacity: .9, lineHeight: 1.5, maxWidth: 400 }}>
          Streamline employee payments and effortlessly manage your payroll taxes in one platform.
        </p>
      </div>
      <div style={{ fontSize: 12, opacity: .7 }}>© 2026 PaymentEvolution Systems Inc.</div>
    </div>

    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 60px", background: "#fff" }}>
      <h2 style={{ fontSize: 30, fontWeight: 300, letterSpacing: "-.02em", color: "#165585", margin: "0 0 8px" }}>Sign in</h2>
      <p style={{ color: "#70808F", margin: "0 0 28px", fontSize: 14 }}>Welcome back. Let's get your team paid.</p>

      {[
        { lbl: "Email", v: "alex@acmeco.ca", t: "email" },
        { lbl: "Password", v: "••••••••••", t: "password" },
      ].map(f => (
        <div key={f.lbl} style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "#7987A9", fontWeight: 600, marginBottom: 6 }}>{f.lbl}</label>
          <input defaultValue={f.v} type={f.t} style={{
            width: "100%", padding: "10px 12px", border: "1px solid #C4C4C4", borderRadius: 5,
            fontSize: 14, fontFamily: "inherit", color: "#444", boxSizing: "border-box"
          }}/>
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0 20px" }}>
        <label style={{ fontSize: 13, color: "#444", display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" defaultChecked/>Remember me
        </label>
        <a style={{ fontSize: 13, color: "#2285D0" }}>Forgot password?</a>
      </div>

      <button onClick={onLogin} style={{
        background: "#2285D0", color: "#fff", border: 0, borderRadius: 5,
        padding: "12px 18px", fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", width: "100%"
      }}>Sign in →</button>

      <div style={{ marginTop: 18, fontSize: 13, color: "#70808F", textAlign: "center" }}>
        New to PayEvo? <a style={{ color: "#2285D0", fontWeight: 600 }}>Create an account</a>
      </div>
    </div>
  </div>
);

Object.assign(window, { HomeScreen, EmployeesScreen, ReportsScreen, LoginScreen, StatCard });
