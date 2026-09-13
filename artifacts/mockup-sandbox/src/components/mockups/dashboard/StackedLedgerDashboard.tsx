import { useState, type CSSProperties } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Grid2X2,
  Landmark,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Settings2,
  Sparkles,
  Store,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

type ActivityTone = "in" | "out" | "credit" | "settled";

type Activity = {
  time: string;
  title: string;
  detail: string;
  amount: string;
  tone: ActivityTone;
  Icon: typeof ArrowDownLeft;
};

const activities: Activity[] = [
  {
    time: "10:42",
    title: "Cash in",
    detail: "Counter float",
    amount: "+$240.00",
    tone: "in",
    Icon: ArrowDownLeft,
  },
  {
    time: "09:18",
    title: "Credit issued",
    detail: "Nadia Rahman",
    amount: "$68.50",
    tone: "credit",
    Icon: Clock3,
  },
  {
    time: "08:55",
    title: "Settlement",
    detail: "Omar’s account",
    amount: "+$120.00",
    tone: "settled",
    Icon: Check,
  },
  {
    time: "08:21",
    title: "Cash out",
    detail: "Supplier delivery",
    amount: "−$84.20",
    tone: "out",
    Icon: ArrowUpRight,
  },
];

const tones: Record<ActivityTone, { color: string; surface: string }> = {
  in: { color: "#72d6b0", surface: "rgba(114,214,176,.12)" },
  out: { color: "#ff8d8d", surface: "rgba(255,141,141,.12)" },
  credit: { color: "#e7bb73", surface: "rgba(231,187,115,.13)" },
  settled: { color: "#74c9ee", surface: "rgba(116,201,238,.13)" },
};

export function StackedLedgerDashboard() {
  const [closed, setClosed] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");

  const flashNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  };

  return (
    <main style={styles.page}>
      <div style={styles.backgroundGlow} aria-hidden="true" />
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.brandGroup}>
            <div style={styles.brandMark}>
              <Store size={19} strokeWidth={1.8} />
            </div>
            <div>
              <p style={styles.eyebrow}>RETAIL OPERATIONS</p>
              <h1 style={styles.title}>Good morning, Mira</h1>
            </div>
          </div>
          <button
            type="button"
            aria-label="Open notifications"
            onClick={() => flashNotice("No new alerts")}
            style={styles.iconButton}
          >
            <Bell size={18} strokeWidth={1.8} />
            <span style={styles.notificationDot} />
          </button>
        </header>

        <section style={styles.dateRow}>
          <div>
            <p style={styles.dateKicker}>TODAY · TUESDAY, 12 MARCH</p>
            <p style={styles.dateHint}>Your shop, at a glance.</p>
          </div>
          <button
            type="button"
            style={styles.moreButton}
            aria-label="More dashboard options"
            onClick={() => flashNotice("Dashboard options are ready")}
          >
            <MoreHorizontal size={20} />
          </button>
        </section>

        <section style={styles.balanceSection}>
          <div style={styles.balanceSectionHeading}>
            <div>
              <p style={styles.sectionLabel}>CASH BALANCE</p>
              <p style={styles.balanceTotal}>$1,840.50</p>
            </div>
            <span style={styles.balanceStatus}>
              <span style={styles.statusPulse} />
              LIVE
            </span>
          </div>
          <div style={styles.balanceRail}>
            <div style={{ ...styles.currencyBlock, borderRight: "1px solid rgba(129, 172, 195, .18)" }}>
              <p style={styles.currencyLabel}>USD WALLET</p>
              <p style={styles.currencyValue}>$1,420.50</p>
              <p style={styles.currencyDelta}>↑ 12.4% this week</p>
            </div>
            <div style={styles.currencyBlock}>
              <p style={styles.currencyLabel}>EUR WALLET</p>
              <p style={styles.currencyValue}>€420.00</p>
              <p style={{ ...styles.currencyDelta, color: "#d9b676" }}>steady today</p>
            </div>
          </div>
        </section>

        <section style={styles.quickRow}>
          <button
            type="button"
            style={styles.primaryAction}
            onClick={() => flashNotice("Cash in flow opened")}
          >
            <span style={styles.primaryActionIcon}><Plus size={16} /></span>
            <span>
              <strong style={styles.actionTitle}>Add cash</strong>
              <small style={styles.actionSub}>Record movement</small>
            </span>
            <ChevronRight size={17} style={{ marginLeft: "auto", opacity: .7 }} />
          </button>
          <button
            type="button"
            style={styles.secondaryAction}
            onClick={() => flashNotice("Daily journal opened")}
          >
            <ReceiptText size={18} color="#83cbe6" />
            <span style={styles.secondaryText}>Journal</span>
          </button>
        </section>

        <section style={styles.activitySection}>
          <div style={styles.activityHeader}>
            <div>
              <p style={styles.sectionLabel}>RECENT ACTIVITY</p>
              <p style={styles.activityCaption}>A clean trail of every movement</p>
            </div>
            <button
              type="button"
              style={styles.viewAll}
              onClick={() => flashNotice("Showing the full daily journal")}
            >
              View all <ChevronRight size={14} />
            </button>
          </div>

          <div style={styles.timeline}>
            <div style={styles.timelineLine} aria-hidden="true" />
            {activities.map((activity) => {
              const tone = tones[activity.tone];
              return (
                <button
                  type="button"
                  key={`${activity.time}-${activity.title}`}
                  style={styles.activityItem}
                  onClick={() => flashNotice(`${activity.title} · ${activity.amount}`)}
                >
                  <span style={styles.time}>{activity.time}</span>
                  <span style={{ ...styles.activityIcon, background: tone.surface, color: tone.color }}>
                    <activity.Icon size={16} strokeWidth={2} />
                  </span>
                  <span style={styles.activityCopy}>
                    <strong style={styles.activityTitle}>{activity.title}</strong>
                    <small style={styles.activityDetail}>{activity.detail}</small>
                  </span>
                  <span style={{ ...styles.activityAmount, color: tone.color }}>{activity.amount}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section style={styles.closeCard}>
          <div style={styles.closeCardIcon}><Landmark size={18} /></div>
          <div style={styles.closeCardCopy}>
            <p style={styles.closeTitle}>Close the day</p>
            <p style={styles.closeHint}>{closed ? "Journal sealed · ready for tomorrow" : "Reconcile today’s cash before you leave"}</p>
          </div>
          <button
            type="button"
            style={{ ...styles.closeButton, ...(closed ? styles.closeButtonDone : {}) }}
            onClick={() => {
              setClosed((value) => !value);
              flashNotice(closed ? "Day reopened" : "Day closed successfully");
            }}
          >
            {closed ? <Check size={17} /> : <span>Close</span>}
          </button>
        </section>
      </div>

      <nav style={styles.bottomNav} aria-label="Main navigation">
        {[
          { id: "dashboard", label: "Home", Icon: Grid2X2 },
          { id: "customers", label: "Customers", Icon: UsersRound },
          { id: "cash", label: "Cash", Icon: WalletCards },
          { id: "settings", label: "Settings", Icon: Settings2 },
        ].map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              type="button"
              key={id}
              onClick={() => {
                setActiveTab(id);
                flashNotice(`${label} selected`);
              }}
              style={{ ...styles.navItem, color: active ? "#8edaf2" : "#748792" }}
            >
              <span style={{ ...styles.navIcon, background: active ? "rgba(123, 211, 239, .13)" : "transparent" }}>
                <Icon size={18} strokeWidth={active ? 2.2 : 1.7} />
              </span>
              <span style={{ ...styles.navLabel, color: active ? "#c5eef8" : "#748792" }}>{label}</span>
            </button>
          );
        })}
      </nav>

      {notice ? (
        <div style={styles.toast} role="status">
          <Sparkles size={15} color="#8edaf2" />
          <span>{notice}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice("")} style={styles.toastClose}>
            <X size={14} />
          </button>
        </div>
      ) : null}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    position: "relative",
    overflow: "hidden",
    color: "#edf4f6",
    background: "#091117",
    fontFamily: '"DM Sans", "Avenir Next", system-ui, sans-serif',
    letterSpacing: "-.01em",
  },
  backgroundGlow: {
    position: "absolute",
    inset: "-12% -18% auto auto",
    width: 420,
    height: 430,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(68, 169, 196, .18) 0%, rgba(68, 169, 196, 0) 69%)",
    pointerEvents: "none",
  },
  shell: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 520,
    margin: "0 auto",
    padding: "29px 20px 122px",
    boxSizing: "border-box",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 29 },
  brandGroup: { display: "flex", alignItems: "center", gap: 11 },
  brandMark: {
    width: 41,
    height: 41,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    color: "#98e0ef",
    background: "rgba(94, 188, 213, .14)",
    border: "1px solid rgba(112, 207, 229, .25)",
  },
  eyebrow: { margin: 0, color: "#76c8dd", fontSize: 9, fontWeight: 800, letterSpacing: ".18em" },
  title: { margin: "4px 0 0", color: "#f1f7f8", fontSize: 19, lineHeight: 1.1, fontWeight: 700 },
  iconButton: {
    position: "relative",
    width: 38,
    height: 38,
    display: "grid",
    placeItems: "center",
    color: "#b3c9d0",
    background: "rgba(20, 36, 44, .74)",
    border: "1px solid rgba(130, 170, 181, .17)",
    borderRadius: 13,
    cursor: "pointer",
  },
  notificationDot: { position: "absolute", top: 8, right: 9, width: 5, height: 5, borderRadius: "50%", background: "#e0b66b" },
  dateRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 17 },
  dateKicker: { margin: 0, color: "#88a2ac", fontSize: 10, fontWeight: 800, letterSpacing: ".13em" },
  dateHint: { margin: "7px 0 0", color: "#d2e1e4", fontSize: 13 },
  moreButton: { width: 33, height: 33, display: "grid", placeItems: "center", color: "#76929b", background: "transparent", border: 0, cursor: "pointer" },
  balanceSection: {
    padding: "20px 18px 16px",
    border: "1px solid rgba(124, 190, 209, .22)",
    borderRadius: 24,
    background: "linear-gradient(135deg, rgba(28, 61, 70, .91), rgba(18, 36, 44, .92))",
    boxShadow: "0 18px 45px rgba(0, 0, 0, .16)",
  },
  balanceSectionHeading: { display: "flex", alignItems: "flex-start", justifyContent: "space-between" },
  sectionLabel: { margin: 0, color: "#86a6b0", fontSize: 10, fontWeight: 800, letterSpacing: ".16em" },
  balanceTotal: { margin: "6px 0 0", color: "#f3faf9", fontSize: 32, fontWeight: 700, letterSpacing: "-.055em" },
  balanceStatus: { display: "inline-flex", alignItems: "center", gap: 6, color: "#82d7b0", fontSize: 9, fontWeight: 800, letterSpacing: ".15em" },
  statusPulse: { width: 6, height: 6, borderRadius: "50%", background: "#82d7b0", boxShadow: "0 0 0 4px rgba(130, 215, 176, .12)" },
  balanceRail: { display: "grid", gridTemplateColumns: "1fr 1fr", marginTop: 20, paddingTop: 14, borderTop: "1px solid rgba(156, 203, 213, .16)" },
  currencyBlock: { paddingRight: 12, paddingLeft: 4 },
  currencyLabel: { margin: 0, color: "#80a5b0", fontSize: 9, fontWeight: 800, letterSpacing: ".11em" },
  currencyValue: { margin: "6px 0 0", color: "#e6f0f1", fontSize: 17, fontWeight: 700 },
  currencyDelta: { margin: "5px 0 0", color: "#7bd0ad", fontSize: 10, fontWeight: 600 },
  quickRow: { display: "grid", gridTemplateColumns: "1fr 92px", gap: 9, marginTop: 11, marginBottom: 28 },
  primaryAction: { display: "flex", alignItems: "center", gap: 10, minHeight: 61, padding: "0 13px", color: "#0b1b20", background: "#9addeb", border: 0, borderRadius: 17, textAlign: "left", cursor: "pointer" },
  primaryActionIcon: { width: 28, height: 28, display: "grid", placeItems: "center", color: "#173841", background: "rgba(12, 65, 77, .11)", borderRadius: 10 },
  actionTitle: { display: "block", fontSize: 13, fontWeight: 800 },
  actionSub: { display: "block", marginTop: 3, color: "#477481", fontSize: 10, fontWeight: 600 },
  secondaryAction: { display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center", gap: 7, padding: "0 14px", background: "rgba(21, 42, 50, .9)", border: "1px solid rgba(125, 187, 201, .19)", borderRadius: 17, cursor: "pointer" },
  secondaryText: { color: "#cee2e6", fontSize: 12, fontWeight: 700 },
  activitySection: { marginBottom: 19 },
  activityHeader: { display: "flex", alignItems: "end", justifyContent: "space-between", marginBottom: 13 },
  activityCaption: { margin: "6px 0 0", color: "#d1e0e2", fontSize: 13 },
  viewAll: { display: "inline-flex", alignItems: "center", gap: 2, color: "#83cbe6", fontSize: 11, fontWeight: 700, background: "transparent", border: 0, cursor: "pointer" },
  timeline: { position: "relative", paddingLeft: 2 },
  timelineLine: { position: "absolute", left: 45, top: 18, bottom: 18, width: 1, background: "rgba(113, 165, 178, .22)" },
  activityItem: { position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "34px 28px 1fr auto", gap: 10, alignItems: "center", width: "100%", minHeight: 58, padding: "6px 0", color: "inherit", background: "transparent", border: 0, textAlign: "left", cursor: "pointer" },
  time: { color: "#6f8b95", fontSize: 10, fontVariantNumeric: "tabular-nums" },
  activityIcon: { width: 28, height: 28, display: "grid", placeItems: "center", border: "4px solid #091117", borderRadius: "50%" },
  activityCopy: { minWidth: 0 },
  activityTitle: { display: "block", color: "#e3eff0", fontSize: 13, fontWeight: 700 },
  activityDetail: { display: "block", marginTop: 3, color: "#77919a", fontSize: 11 },
  activityAmount: { fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" },
  closeCard: { display: "flex", alignItems: "center", gap: 11, padding: 13, border: "1px solid rgba(139, 179, 185, .16)", borderRadius: 19, background: "rgba(17, 31, 38, .72)" },
  closeCardIcon: { width: 34, height: 34, display: "grid", placeItems: "center", color: "#d6b36d", background: "rgba(214, 179, 109, .12)", borderRadius: 11 },
  closeCardCopy: { minWidth: 0, flex: 1 },
  closeTitle: { margin: 0, color: "#e5eff0", fontSize: 12, fontWeight: 800 },
  closeHint: { margin: "4px 0 0", overflow: "hidden", color: "#78939b", fontSize: 10, lineHeight: 1.35, textOverflow: "ellipsis", whiteSpace: "nowrap" },
  closeButton: { minWidth: 51, height: 32, display: "grid", placeItems: "center", color: "#11262c", background: "#d5b06c", border: 0, borderRadius: 10, fontSize: 11, fontWeight: 800, cursor: "pointer" },
  closeButtonDone: { color: "#093126", background: "#7bd3ad" },
  bottomNav: { position: "fixed", zIndex: 4, left: "50%", bottom: 13, transform: "translateX(-50%)", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", width: "calc(100% - 26px)", maxWidth: 480, padding: "8px 7px 7px", background: "rgba(16, 31, 38, .92)", border: "1px solid rgba(127, 175, 185, .21)", borderRadius: 22, boxShadow: "0 14px 34px rgba(0,0,0,.28)", backdropFilter: "blur(15px)" },
  navItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minHeight: 46, border: 0, background: "transparent", cursor: "pointer" },
  navIcon: { width: 31, height: 26, display: "grid", placeItems: "center", borderRadius: 10 },
  navLabel: { fontSize: 9, fontWeight: 700 },
  toast: { position: "fixed", zIndex: 6, left: "50%", bottom: 88, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, width: "max-content", maxWidth: "calc(100% - 36px)", padding: "10px 11px 10px 13px", color: "#dbecef", background: "rgba(25, 49, 58, .96)", border: "1px solid rgba(124, 197, 214, .32)", borderRadius: 13, boxShadow: "0 12px 30px rgba(0,0,0,.24)", fontSize: 11, fontWeight: 700 },
  toastClose: { display: "grid", placeItems: "center", width: 20, height: 20, color: "#87a7af", background: "transparent", border: 0, cursor: "pointer" },
};

export default StackedLedgerDashboard;