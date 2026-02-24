import { useRef } from "react";
import { AuthForm } from "@/components/AuthForm";
import { cn } from "@/lib/utils";
import {
  Rocket,
  Settings2,
  Users,
  Cpu,
  Check,
  Terminal,
  ChevronRight,
} from "lucide-react";

/**
 * Landing page with hero, features, pricing, and auth form.
 * Dark theme matching the Companion design system.
 */
export function Landing() {
  const authRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLDivElement>(null);

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="min-h-screen bg-cc-bg text-cc-fg grain">
      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-cc-bg/80 backdrop-blur-xl border-b border-cc-separator">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <span className="font-[family-name:var(--font-display)] font-bold text-sm tracking-tight">
              companion
              <span className="text-cc-primary">.</span>
              cloud
            </span>
          </a>
          <div className="flex items-center gap-3">
            <button
              onClick={() => scrollTo(authRef)}
              className="text-sm text-cc-muted hover:text-cc-fg transition-colors"
            >
              Sign In
            </button>
            <button
              onClick={() => scrollTo(authRef)}
              className="text-sm px-4 py-1.5 bg-cc-primary text-white rounded-lg hover:bg-cc-primary-hover transition-colors font-medium"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Background glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(217,119,87,0.08) 0%, transparent 70%)",
          }}
        />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Terminal badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-8 rounded-full border border-cc-border bg-cc-card/50">
            <Terminal size={14} className="text-cc-primary" />
            <span className="font-[family-name:var(--font-display)] text-xs text-cc-muted">
              companion cloud
              <span className="animate-blink text-cc-primary">_</span>
            </span>
          </div>

          <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Your Claude Code
            <br />
            instances,{" "}
            <span className="text-cc-primary">managed</span>
            <span className="text-cc-primary">.</span>
          </h1>

          <p className="text-cc-muted text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Deploy managed Companion instances in seconds. No setup, no servers
            — just you and Claude Code in the browser.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => scrollTo(authRef)}
              className="px-6 py-3 bg-cc-primary text-white rounded-xl font-medium text-sm hover:bg-cc-primary-hover transition-all glow-primary-hover flex items-center gap-2"
            >
              Start Building
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => scrollTo(pricingRef)}
              className="px-6 py-3 border border-cc-border text-cc-fg rounded-xl font-medium text-sm hover:bg-cc-hover transition-all"
            >
              View Pricing
            </button>
          </div>

          <p className="text-cc-muted-fg text-xs mt-6">
            No credit card required
          </p>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-bold text-center mb-4">
            Built for developers
          </h2>
          <p className="text-cc-muted text-center mb-16 max-w-lg mx-auto">
            Everything you need to run Claude Code in the cloud, managed and
            ready in seconds.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={cn(
                  "group p-6 rounded-xl border border-cc-border bg-cc-card/50",
                  "hover:border-cc-border-hover hover:bg-cc-card transition-all duration-200",
                  "animate-fade-slide-up",
                  `delay-${i + 1}`,
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-cc-primary/10 flex items-center justify-center mb-4 group-hover:bg-cc-primary/15 transition-colors">
                  <f.icon size={20} className="text-cc-primary" />
                </div>
                <h3 className="font-medium text-sm mb-2">{f.title}</h3>
                <p className="text-cc-muted text-sm leading-relaxed">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section ref={pricingRef} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-[family-name:var(--font-display)] text-2xl md:text-3xl font-bold text-center mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-cc-muted text-center mb-16 max-w-lg mx-auto">
            Start free, scale when you&apos;re ready. No hidden fees.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={cn(
                  "relative rounded-xl border p-8 transition-all duration-200",
                  tier.highlighted
                    ? "border-cc-primary bg-cc-card glow-primary"
                    : "border-cc-border bg-cc-card/50 hover:border-cc-border-hover",
                )}
              >
                {tier.highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-cc-primary text-white text-xs font-medium rounded-full">
                    Most Popular
                  </span>
                )}

                <h3 className="font-[family-name:var(--font-display)] font-medium text-sm mb-1">
                  {tier.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-bold">{tier.price}</span>
                  <span className="text-cc-muted text-sm">/mo</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-cc-muted"
                    >
                      <Check
                        size={16}
                        className="text-cc-success shrink-0 mt-0.5"
                      />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => scrollTo(authRef)}
                  className={cn(
                    "w-full py-2.5 rounded-lg font-medium text-sm transition-all",
                    tier.highlighted
                      ? "bg-cc-primary text-white hover:bg-cc-primary-hover"
                      : "border border-cc-border text-cc-fg hover:bg-cc-hover",
                  )}
                >
                  Get Started
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Auth Section ─────────────────────────────────────────────────── */}
      <section ref={authRef} className="py-24 px-6">
        <div className="max-w-md mx-auto">
          <div className="rounded-2xl border border-cc-border bg-cc-card p-8">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-center mb-6">
              Ready to start?
            </h2>
            <AuthForm />
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-cc-separator py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-[family-name:var(--font-display)] text-xs text-cc-muted-fg">
            companion<span className="text-cc-primary">.</span>cloud
          </span>
          <div className="flex items-center gap-6 text-xs text-cc-muted-fg">
            <a
              href="https://thecompanion.sh"
              className="hover:text-cc-muted transition-colors"
            >
              Home
            </a>
            <a
              href="https://github.com/The-Vibe-Company/companion"
              className="hover:text-cc-muted transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Data ────────────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: Rocket,
    title: "Instant Deploy",
    description:
      "Spin up a Companion instance in one click. Pre-configured with Claude Code or Codex.",
  },
  {
    icon: Settings2,
    title: "Zero Config",
    description:
      "Tailscale networking, custom domains, and persistent storage — all managed for you.",
  },
  {
    icon: Users,
    title: "Team Ready",
    description:
      "Share instances across your organization. Role-based access and team workspaces built in.",
  },
  {
    icon: Cpu,
    title: "Agent Orchestration",
    description:
      "Schedule and manage agents with built-in cron support, triggers, and monitoring.",
  },
];

const PRICING_TIERS = [
  {
    name: "Starter",
    price: "$29",
    highlighted: false,
    features: [
      "1 instance",
      "2 CPU / 2 GB RAM",
      "10 GB storage",
      "3 agents",
      "Community support",
    ],
  },
  {
    name: "Pro",
    price: "$79",
    highlighted: true,
    features: [
      "1 instance",
      "4 CPU / 4 GB RAM",
      "50 GB storage",
      "Custom domain",
      "Tailscale networking",
      "10 agents",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    price: "$149",
    highlighted: false,
    features: [
      "3 instances",
      "4 CPU / 8 GB RAM",
      "100 GB storage",
      "Custom domain",
      "Tailscale networking",
      "Unlimited agents",
      "Dedicated support",
    ],
  },
];
