/**
 * LandingPage.jsx
 * Public-facing product website for REFORGE.
 * Fully self-contained (no AppShell/sidebar).
 */

import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Shield, Cpu, Zap, GitBranch, CheckCircle,
  Activity, AlertTriangle, Wrench, BarChart2, ChevronDown,
  Upload, Database, Play, ExternalLink, Menu, X, Layers
} from "lucide-react";
import { useSelector, useDispatch } from "react-redux";
import { toggleTheme } from "../features/ui/uiSlice";
import AnimatedPipeline from "../components/landing/AnimatedPipeline";

// ─── Data ─────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "Architecture", href: "#architecture" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "How It Works", href: "#how-it-works" },
];

const CAPABILITIES = [
  {
    icon: Shield,
    title: "Deterministic Rule Validation",
    desc: "Four domain-specific semantic rules (range, rate-of-change, frozen sensor, spatial peer consensus) run on every ingested observation. Every rule decision is recorded in the audit trail.",
    accent: "var(--accent-telemetry)",
    accentDim: "var(--accent-telemetry-dim)",
  },
  {
    icon: Cpu,
    title: "ML Anomaly Detection",
    desc: "An unsupervised Python FastAPI microservice runs Isolation Forest + DBSCAN on incoming telemetry. The ML score is combined with rule risk in the hybrid decision engine.",
    accent: "var(--accent-purple)",
    accentDim: "var(--accent-purple-dim)",
  },
  {
    icon: Zap,
    title: "Hybrid Decision Engine",
    desc: "A configurable arbitration layer weighs rule risk scores against ML anomaly scores. The active mode (shadow / hybrid / rule_only) is an environment-level setting.",
    accent: "var(--accent-anomaly)",
    accentDim: "var(--accent-anomaly-dim)",
  },
  {
    icon: Wrench,
    title: "Five Mathematical Repair Strategies",
    desc: "When an anomaly is confirmed, the repair service computes five candidate values: mean imputation, moving-average smoothing, linear interpolation, peer consensus, and Kalman filtering.",
    accent: "var(--accent-verified)",
    accentDim: "var(--accent-verified-dim)",
  },
  {
    icon: Play,
    title: "Sandboxed Execution (Mode B)",
    desc: "Code patches are executed in an isolated Docker container (30s cap, 256MB RAM, no network egress). Exit code, stdout, and stderr are captured and shown in the Repair Center.",
    accent: "var(--accent-telemetry)",
    accentDim: "var(--accent-telemetry-dim)",
  },
  {
    icon: CheckCircle,
    title: "Post-Repair Verification",
    desc: "A repair is only marked VERIFIED when the final risk score drops below 0.30. Backend strictly blocks PR creation and human approval unless this threshold is met.",
    accent: "var(--accent-verified)",
    accentDim: "var(--accent-verified-dim)",
  },
  {
    icon: GitBranch,
    title: "GitHub PR Export",
    desc: "Verified repairs can be exported as GitHub pull requests. A pure-JS PDF 1.4 generator produces audit-ready reports. All exports are logged in the immutable audit trail.",
    accent: "var(--accent-purple)",
    accentDim: "var(--accent-purple-dim)",
  },
  {
    icon: BarChart2,
    title: "Model Registry & Governance",
    desc: "A versioned model registry supports training, promotion, and rollback of ML models. Every promotion and rollback event is recorded with a timestamp and operator identifier.",
    accent: "var(--accent-anomaly)",
    accentDim: "var(--accent-anomaly-dim)",
  },
];

const ARCH_STAGES = [
  { label: "Ingestion", sub: "Schema Check", icon: Upload, color: "var(--accent-telemetry)" },
  { label: "Rule Engine", sub: "4 Semantic Rules", icon: Shield, color: "var(--accent-purple)" },
  { label: "ML Service", sub: "Isolation Forest", icon: Cpu, color: "var(--accent-anomaly)" },
  { label: "Decision", sub: "Hybrid Arbitration", icon: Zap, color: "var(--accent-telemetry)" },
  { label: "Quarantine", sub: "Human Review Queue", icon: AlertTriangle, color: "var(--accent-anomaly)" },
  { label: "Repair", sub: "5 Strategies + Docker", icon: Wrench, color: "var(--accent-verified)" },
  { label: "Verification", sub: "Risk < 0.30 Gate", icon: CheckCircle, color: "var(--accent-verified)" },
  { label: "Audit Trail", sub: "Immutable Log", icon: Database, color: "var(--accent-baseline)" },
];

const HOW_STEPS = [
  {
    num: "01",
    title: "Telemetry arrives via the ingestion API",
    desc: "IoT sensor observations are POSTed to /api/observations. The schema validator ensures every record has a valid entityId, timestamp, values, modality, and zone before it enters the pipeline.",
  },
  {
    num: "02",
    title: "Deterministic rules score each observation",
    desc: "Four rule engines run in sequence: physical range check, rate-of-change anomaly, frozen-sensor detection, and spatial peer consensus. Each rule contributes to a composite risk score.",
  },
  {
    num: "03",
    title: "The ML microservice scores the same observation",
    desc: "A Python FastAPI service runs an Isolation Forest model trained on historical baseline data. The anomaly score is normalized to [0, 1] and returned alongside the rule score.",
  },
  {
    num: "04",
    title: "The decision engine arbitrates classification",
    desc: "The hybrid engine combines rule and ML scores using the active mode. Observations with risk ≥ 0.30 are classified suspicious; ≥ 0.60 are classified invalid and automatically quarantined.",
  },
  {
    num: "05",
    title: "Quarantined records are queued for repair",
    desc: "An operator (or automated cascade healer for low-risk records) reviews the evidence. Confirmed anomalies trigger repair proposal generation using five mathematical strategies.",
  },
  {
    num: "06",
    title: "Sandbox execution and post-repair verification",
    desc: "Mode B patches run in a Docker container. The repaired value is re-scored. If the final risk score is < 0.30, the proposal advances to VERIFIED state and becomes eligible for export and approval.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const dispatch = useDispatch();
  const { theme } = useSelector((s) => s.ui);

  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const heroRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleAnchorClick(e, href) {
    e.preventDefault();
    setMobileMenuOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="landing-root">
      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className={`landing-nav${scrolled ? " scrolled" : ""}`} aria-label="Main navigation">
        <div className="landing-nav-inner">
          {/* Logo */}
          <Link to="/" className="landing-nav-logo">
            <span className="brand-badge" style={{ width: 32, height: 32, fontSize: "15px" }}>R</span>
            <span className="landing-nav-wordmark">REFORGE</span>
          </Link>

          {/* Desktop links */}
          <ul className="landing-nav-links">
            {NAV_LINKS.map(({ label, href }) => (
              <li key={href}>
                <a href={href} onClick={(e) => handleAnchorClick(e, href)}>{label}</a>
              </li>
            ))}
          </ul>

          {/* CTAs */}
          <div className="landing-nav-ctas">
            <button
              onClick={() => dispatch(toggleTheme())}
              className="btn btn-ghost btn-sm"
              aria-label="Toggle theme"
              style={{ padding: "6px 8px" }}
            >
              {theme === "dark"
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
              }
            </button>
            <Link to="/dashboard" className="btn btn-primary btn-sm">
              Open Dashboard <ArrowRight size={13} />
            </Link>
            {/* Mobile menu */}
            <button
              className="btn btn-ghost btn-sm"
              style={{ display: "none", padding: "6px 8px" }}
              onClick={() => setMobileMenuOpen(o => !o)}
              aria-label="Toggle menu"
              id="mobile-menu-btn"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div style={{
            background: "var(--bg-panel)",
            borderTop: "1px solid var(--border-color)",
            padding: "16px 28px 24px",
          }}>
            {NAV_LINKS.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                onClick={(e) => handleAnchorClick(e, href)}
                style={{
                  display: "block",
                  padding: "12px 0",
                  color: "var(--text-secondary)",
                  textDecoration: "none",
                  fontSize: "var(--text-base)",
                  fontWeight: 500,
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                {label}
              </a>
            ))}
          </div>
        )}
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="landing-hero" id="product" ref={heroRef}>
        <div className="landing-hero-bg" aria-hidden="true" />

        <div className="landing-hero-inner">
          {/* Copy */}
          <div className="landing-hero-content">
            <div className="hero-eyebrow animate-fadeInUp">
              <span className="hero-eyebrow-dot" />
              Intelligent Data Reliability
            </div>

            <h1 className="hero-headline animate-fadeInUp anim-delay-1">
              Detect the anomaly.{" "}
              <span className="hero-headline-accent">Repair the pipeline.</span>{" "}
              Verify the recovery.
            </h1>

            <p className="hero-body animate-fadeInUp anim-delay-2">
              REFORGE combines deterministic validation, machine-learning anomaly detection,
              controlled data repair, and post-repair verification to make IoT telemetry
              pipelines more reliable.
            </p>

            <div className="hero-ctas animate-fadeInUp anim-delay-3">
              <Link to="/dashboard" className="btn-hero-primary">
                Open Dashboard <ArrowRight size={16} />
              </Link>
              <a href="#how-it-works" onClick={(e) => handleAnchorClick(e, "#how-it-works")} className="btn-hero-secondary">
                Explore the Pipeline <ChevronDown size={15} />
              </a>
            </div>

            {/* Quick fact pills */}
            <div className="animate-fadeInUp anim-delay-4" style={{
              display: "flex", gap: "10px", marginTop: "48px", flexWrap: "wrap"
            }}>
              {[
                { color: "var(--accent-telemetry)", label: "Rule Engine + ML Hybrid" },
                { color: "var(--accent-verified)", label: "Post-Repair Verification" },
                { color: "var(--accent-anomaly)", label: "Docker Sandbox Execution" },
              ].map(({ color, label }) => (
                <div key={label} style={{
                  display: "flex", alignItems: "center", gap: "7px",
                  padding: "5px 12px",
                  background: "var(--bg-panel)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-full)",
                  fontSize: "var(--text-xs)",
                  color: "var(--text-secondary)",
                  fontWeight: 500,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline Visualization */}
          <div className="pipeline-canvas animate-fadeInUp anim-delay-2" style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-lg)",
            padding: "24px",
            boxShadow: "var(--shadow-elevated)",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Corner decoration */}
            <div aria-hidden="true" style={{
              position: "absolute", top: 0, right: 0, width: 160, height: 160,
              background: "radial-gradient(circle at top right, var(--accent-telemetry-dim), transparent 70%)",
              pointerEvents: "none",
            }} />

            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.04em", marginBottom: "2px" }}>
                REFORGE Validation Pipeline
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                6-stage illustrated demonstration
              </div>
            </div>

            <AnimatedPipeline />

            {/* Legend */}
            <div style={{ display: "flex", gap: "14px", marginTop: "12px", flexWrap: "wrap" }}>
              {[
                { color: "#36C878", label: "Valid" },
                { color: "#FF9F43", label: "Anomaly" },
                { color: "#438DFF", label: "Repairing" },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-muted)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Architecture ───────────────────────────────────────────────── */}
      <section id="architecture" style={{ background: "var(--bg-panel)", borderTop: "1px solid var(--border-color)", borderBottom: "1px solid var(--border-color)" }}>
        <div className="landing-section">
          <div className="section-eyebrow">Architecture</div>
          <h2 className="section-title">
            Eight stages. One coherent pipeline.
          </h2>
          <p className="section-subtitle">
            Every observation flows through a verified sequence of processing stages.
            Implemented components are shown below - no invented capabilities.
          </p>

          {/* Arch diagram */}
          <div style={{ overflowX: "auto", paddingBottom: "8px" }}>
            <div style={{
              display: "flex",
              gap: "0",
              minWidth: "900px",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
            }}>
              {ARCH_STAGES.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} style={{
                    flex: 1,
                    background: i % 2 === 0 ? "var(--bg-panel)" : "var(--bg-secondary)",
                    borderRight: i < ARCH_STAGES.length - 1 ? "1px solid var(--border-color)" : "none",
                    padding: "20px 14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "10px",
                    textAlign: "center",
                    position: "relative",
                    transition: "all var(--duration-base) var(--ease-out)",
                    cursor: "default",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-tertiary)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? "var(--bg-panel)" : "var(--bg-secondary)"; }}
                  >
                    <div style={{
                      width: 40, height: 40,
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-elevated)",
                      border: `1px solid ${s.color}33`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: s.color,
                    }}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--text-primary)", marginBottom: "3px" }}>{s.label}</div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{s.sub}</div>
                    </div>
                    <div style={{
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-muted)",
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "var(--radius-full)",
                      padding: "2px 8px",
                    }}>
                      Stage {i + 1}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Capabilities ───────────────────────────────────────────────── */}
      <section id="capabilities" className="landing-section">
        <div className="section-eyebrow">Core Capabilities</div>
        <h2 className="section-title">Everything the pipeline does.</h2>
        <p className="section-subtitle">
          Built and operational. Each capability is backed by real server-side code - not planned features or marketing bullet points.
        </p>

        <div className="feature-grid">
          {CAPABILITIES.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="feature-card">
                <div className="feature-icon" style={{ borderColor: c.accent + "40", color: c.accent, background: c.accentDim }}>
                  <Icon size={20} />
                </div>
                <div className="feature-title">{c.title}</div>
                <div className="feature-desc">{c.desc}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ background: "var(--bg-panel)", borderTop: "1px solid var(--border-color)", borderBottom: "1px solid var(--border-color)" }}>
        <div className="landing-section">
          <div className="section-eyebrow">How It Works</div>
          <h2 className="section-title">From raw telemetry to verified recovery.</h2>
          <p className="section-subtitle">
            Six stages, each with a clear function. No black boxes.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 64px" }}>
            <div className="how-steps">
              {HOW_STEPS.slice(0, 3).map((s) => (
                <div key={s.num} className="how-step">
                  <div className="how-step-num">{s.num}</div>
                  <div>
                    <div className="how-step-title">{s.title}</div>
                    <div className="how-step-desc">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="how-steps">
              {HOW_STEPS.slice(3).map((s) => (
                <div key={s.num} className="how-step">
                  <div className="how-step-num">{s.num}</div>
                  <div>
                    <div className="how-step-title">{s.title}</div>
                    <div className="how-step-desc">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────── */}
      <div className="landing-cta-section">
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="section-eyebrow" style={{ justifyContent: "center", display: "flex" }}>Open Source · Local-First</div>
          <h2 style={{
            fontSize: "var(--text-3xl)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
            marginBottom: "16px",
            lineHeight: 1.2,
          }}>
            Explore the live dashboard.
          </h2>
          <p style={{
            fontSize: "var(--text-lg)",
            color: "var(--text-secondary)",
            maxWidth: "520px",
            margin: "0 auto 40px",
            lineHeight: 1.7,
          }}>
            Connect to a local REFORGE backend or switch to Demo Mode to explore
            the full platform with deterministic benchmark scenarios.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "14px", flexWrap: "wrap" }}>
            <Link to="/dashboard" className="btn-hero-primary">
              Open Dashboard <ArrowRight size={15} />
            </Link>
            <Link to="/pipeline" className="btn-hero-secondary">
              <Layers size={15} /> Explore Pipeline Map
            </Link>
          </div>
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="brand-badge" style={{ width: 28, height: 28, fontSize: "13px" }}>R</span>
            <div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>REFORGE</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Self-Healing IoT Data Pipeline Observatory</div>
            </div>
          </div>

          <ul className="landing-footer-links">
            {NAV_LINKS.map(({ label, href }) => (
              <li key={href}>
                <a href={href} onClick={(e) => handleAnchorClick(e, href)}>{label}</a>
              </li>
            ))}
            <li><Link to="/dashboard" style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", textDecoration: "none" }}>Dashboard</Link></li>
          </ul>

          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            Built for reliability engineering
          </div>
        </div>
      </footer>

      {/* Mobile nav toggle styles */}
      <style>{`
        @media (max-width: 768px) {
          #mobile-menu-btn { display: flex !important; }
          .landing-nav-links { display: none !important; }
          .landing-nav-ctas .btn-hero-primary { display: none; }
          .landing-hero-inner { grid-template-columns: 1fr !important; text-align: center; }
          .hero-ctas { justify-content: center; }
          .hero-body { margin-left: auto; margin-right: auto; }
          .how-steps { grid-column: 1 / -1; }
          .landing-section > div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
