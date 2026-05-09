"use client";

import { useState } from "react";
import { SiteNav, SiteFooter } from "@/components/chrome";
import { IconCheck, IconChevD, IconArrow } from "@/components/icons";
import { tiers, comparisonRows, faqItems, type Billing, type Tier, type ComparisonRow } from "./tiers";

export default function PricingPage() {
  const [billing, setBilling] = useState<Billing>("yearly");

  return (
    <div style={{ background: "var(--color-base)", minHeight: "100vh" }}>
      <SiteNav />

      {/* Hero */}
      <section
        style={{
          padding: "96px 32px 48px",
          background: "var(--color-base)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <Eyebrow>Pricing</Eyebrow>
          <h1
            style={{
              fontSize: "clamp(44px, 5.5vw, 68px)",
              marginTop: 14,
              lineHeight: 1.05,
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"SOFT" 80',
              color: "var(--color-text-primary)",
            }}
          >
            Priced by{" "}
            <em
              style={{
                color: "var(--color-accent)",
                fontStyle: "italic",
                fontVariationSettings: '"SOFT" 100, "WONK" 1',
              }}
            >
              workspace
            </em>
            ,
            <br />
            not by seat.
          </h1>
          <p
            style={{
              fontSize: 18,
              color: "var(--color-text-secondary)",
              marginTop: 24,
              maxWidth: 560,
              margin: "24px auto 0",
              lineHeight: 1.6,
            }}
          >
            Self-host for free, forever. Or let us run it — one flat rate per workspace, bring the whole team.
          </p>

          <BillingToggle billing={billing} onChange={setBilling} />
        </div>
      </section>

      {/* Tier cards */}
      <section style={{ padding: "56px 32px 120px", background: "var(--color-base)" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 24,
          }}
        >
          {tiers.map((tier) => (
            <TierCard key={tier.id} tier={tier} billing={billing} />
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section
        style={{
          padding: "96px 32px",
          background: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <Eyebrow>Compare everything</Eyebrow>
            <h2
              style={{
                fontSize: 34,
                marginTop: 12,
                fontFamily: "var(--font-display)",
                fontVariationSettings: '"SOFT" 60',
                color: "var(--color-text-primary)",
              }}
            >
              The feature table, unabridged.
            </h2>
          </div>
          <ComparisonTable rows={comparisonRows} />
        </div>
      </section>

      {/* FAQ */}
      <PricingFAQ />

      {/* Bottom CTA */}
      <section
        style={{
          padding: "112px 32px",
          background: "var(--color-cream)",
          color: "#2b2017",
        }}
      >
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
          <h2
            style={{
              fontSize: "clamp(32px, 4.5vw, 48px)",
              fontFamily: "var(--font-display)",
              fontVariationSettings: '"SOFT" 80',
              lineHeight: 1.08,
              color: "#2b2017",
            }}
          >
            Still reading?
          </h2>
          <p
            style={{
              fontSize: 17,
              marginTop: 20,
              color: "#4a3a2c",
              maxWidth: 500,
              margin: "20px auto 0",
            }}
          >
            The self-host image is one command. The cloud trial is thirty days. Pick a direction.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              marginTop: 32,
            }}
          >
            <a
              href="/docs/install"
              style={{
                padding: "14px 24px",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                background: "#2b2017",
                color: "var(--color-cream)",
                border: "1px solid #2b2017",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Deploy On-prem <IconArrow size={15} />
            </a>
            <a
              href="/contact"
              style={{
                padding: "14px 24px",
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 500,
                background: "transparent",
                color: "#2b2017",
                border: "1px solid #2b2017",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              Talk to us
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function BillingToggle({
  billing,
  onChange,
}: {
  billing: Billing;
  onChange: (b: Billing) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        marginTop: 40,
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        padding: 4,
        background: "var(--color-surface)",
      }}
    >
      {(
        [
          { id: "monthly", t: "Monthly" },
          { id: "yearly", t: "Yearly", badge: "2 months free" },
        ] as const
      ).map((b) => (
        <button
          key={b.id}
          onClick={() => onChange(b.id)}
          style={{
            padding: "8px 18px",
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 500,
            color:
              billing === b.id
                ? "var(--color-accent-ink)"
                : "var(--color-text-secondary)",
            background:
              billing === b.id ? "var(--color-accent)" : "transparent",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            transition: "all 120ms",
          }}
        >
          {b.t}
          {"badge" in b && b.badge && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.05em",
                color:
                  billing === b.id
                    ? "var(--color-accent-ink)"
                    : "var(--color-accent)",
                background:
                  billing === b.id
                    ? "rgba(26,15,10,0.15)"
                    : "color-mix(in oklab, var(--color-accent) 15%, transparent)",
                padding: "2px 7px",
                borderRadius: 4,
              }}
            >
              {b.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function TierCard({ tier, billing }: { tier: Tier; billing: Billing }) {
  const price = tier.price[billing];

  return (
    <div
      style={{
        background: tier.featured ? "var(--color-surface)" : "var(--color-base)",
        border: tier.featured
          ? "1px solid var(--color-accent)"
          : "1px solid var(--color-border)",
        borderRadius: 16,
        padding: 32,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        boxShadow: tier.featured
          ? "0 30px 60px -30px color-mix(in oklab, var(--color-accent) 40%, transparent)"
          : "none",
      }}
    >
      {tier.featured && (
        <div
          style={{
            position: "absolute",
            top: -12,
            left: 24,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            background: "var(--color-accent)",
            color: "var(--color-accent-ink)",
            padding: "4px 10px",
            borderRadius: 4,
            fontWeight: 500,
          }}
        >
          Most teams pick this
        </div>
      )}

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--color-text-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {tier.name}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 17,
          fontStyle: "italic",
          color: "var(--color-accent)",
          marginTop: 6,
          fontVariationSettings: '"SOFT" 100',
        }}
      >
        {tier.flourish}
      </div>

      <div
        style={{
          marginTop: 24,
          display: "flex",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 48,
            fontWeight: 300,
            fontVariationSettings: '"SOFT" 50',
            letterSpacing: "-0.02em",
            color: "var(--color-text-primary)",
          }}
        >
          {price.amount}
        </span>
        {price.suffix && (
          <span
            style={{ fontSize: 13, color: "var(--color-text-secondary)" }}
          >
            {price.suffix}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          marginTop: 4,
        }}
      >
        {price.note}
      </div>

      <p
        style={{
          fontSize: 14,
          color: "var(--color-text-secondary)",
          marginTop: 22,
          lineHeight: 1.65,
        }}
      >
        {tier.blurb}
      </p>

      <a
        href={tier.ctaHref}
        style={{
          justifyContent: "center",
          marginTop: 28,
          width: "100%",
          padding: "14px 24px",
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
          transition: "transform 120ms, filter 120ms",
          ...(tier.featured
            ? {
                background: "var(--color-accent)",
                color: "var(--color-accent-ink)",
                border: "1px solid var(--color-accent)",
              }
            : {
                background: "transparent",
                color: "var(--color-text-primary)",
                border: "1px solid var(--color-border)",
              }),
        }}
      >
        {tier.cta}
      </a>

      <ul
        style={{
          padding: 0,
          margin: "28px 0 0",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {tier.features.map((f) => (
          <li
            key={f}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              fontSize: 13.5,
              color: "var(--color-text-secondary)",
            }}
          >
            <IconCheck
              size={13}
              style={{ color: "var(--color-accent)", marginTop: 4, flexShrink: 0 }}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        overflow: "hidden",
        background: "var(--color-base)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr 1fr",
          background: "var(--color-surface-elevated)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            padding: "16px 24px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--color-text-muted)",
          }}
        >
          Feature
        </div>
        {["Self-host", "Cloud", "Enterprise"].map((t) => (
          <div
            key={t}
            style={{
              padding: "16px 24px",
              fontSize: 14,
              color: "var(--color-text-primary)",
              borderLeft: "1px solid var(--color-border)",
              textAlign: "center",
            }}
          >
            {t}
          </div>
        ))}
      </div>

      {rows.map((row, i) => {
        if (row.isSection) {
          return (
            <div
              key={i}
              style={{
                padding: "14px 24px",
                background: "var(--color-surface)",
                borderBottom: "1px solid var(--color-border)",
                borderTop: i === 0 ? "none" : "1px solid var(--color-border)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--color-accent)",
              }}
            >
              {row.label}
            </div>
          );
        }

        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                padding: "14px 24px",
                fontSize: 14,
                color: "var(--color-text-secondary)",
              }}
            >
              {row.label}
            </div>
            {([row.selfhost, row.cloud, row.enterprise] as (boolean | string)[]).map(
              (cell, j) => (
                <div
                  key={j}
                  style={{
                    padding: "14px 24px",
                    borderLeft: "1px solid var(--color-border)",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <ComparisonCell value={cell} />
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function ComparisonCell({ value }: { value: boolean | string }) {
  if (value === true) {
    return <IconCheck size={15} style={{ color: "var(--color-accent)" }} />;
  }
  if (value === false) {
    return (
      <span
        style={{
          color: "var(--color-text-muted)",
          fontSize: 18,
          lineHeight: 1,
        }}
      >
        —
      </span>
    );
  }
  return (
    <span style={{ fontSize: 13.5, color: "var(--color-text-primary)" }}>
      {value}
    </span>
  );
}

function PricingFAQ() {
  const [open, setOpen] = useState(0);

  return (
    <section
      style={{
        padding: "112px 32px",
        background: "var(--color-base)",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <Eyebrow>Questions worth asking</Eyebrow>
        <h2
          style={{
            fontSize: 36,
            marginTop: 12,
            marginBottom: 40,
            fontFamily: "var(--font-display)",
            fontVariationSettings: '"SOFT" 60',
            color: "var(--color-text-primary)",
          }}
        >
          FAQ
        </h2>
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {faqItems.map((item, i) => (
            <div
              key={i}
              style={{
                borderBottom:
                  i === faqItems.length - 1 ? "none" : "1px solid var(--color-border)",
              }}
            >
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                style={{
                  width: "100%",
                  padding: "22px 24px",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontSize: 16,
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-display)",
                    fontVariationSettings: '"SOFT" 50',
                  }}
                >
                  {item.q}
                </span>
                <IconChevD
                  size={15}
                  style={{
                    color: "var(--color-text-secondary)",
                    transform: open === i ? "rotate(180deg)" : "none",
                    transition: "transform 180ms",
                    flexShrink: 0,
                  }}
                />
              </button>
              {open === i && (
                <div
                  style={{
                    padding: "0 24px 24px",
                    fontSize: 14.5,
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.7,
                    maxWidth: 680,
                  }}
                >
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--color-accent)",
      }}
    >
      {children}
    </div>
  );
}
