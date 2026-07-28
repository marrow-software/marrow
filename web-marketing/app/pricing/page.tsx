"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteNav, SiteFooter } from "@/components/chrome";
import { CheckIcon, MinusIcon, ChevronDownIcon } from "@/components/icons";
import { tiers, comparisonRows, faqItems } from "./tiers";
import type { Tier } from "./tiers";

// ─── Billing toggle ──────────────────────────────────────────────────────────

function BillingToggle({
  billing,
  onChange,
}: {
  billing: "monthly" | "yearly";
  onChange: (b: "monthly" | "yearly") => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.25rem",
        borderRadius: "9999px",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      {(["monthly", "yearly"] as const).map((b) => (
        <button
          key={b}
          onClick={() => onChange(b)}
          style={{
            padding: "0.375rem 1rem",
            borderRadius: "9999px",
            border: "none",
            fontSize: "0.875rem",
            fontWeight: billing === b ? 600 : 400,
            cursor: "pointer",
            backgroundColor: billing === b ? "var(--color-accent)" : "transparent",
            color: billing === b ? (b === "yearly" ? "#fff" : "var(--color-base)") : "var(--color-text-secondary)",
            transition: "all 0.15s",
          }}
        >
          {b === "monthly" ? "Monthly" : "Yearly"}
          {b === "yearly" && (
            <span
              style={{
                marginLeft: "0.4rem",
                fontSize: "0.6875rem",
                fontWeight: 600,
                padding: "0.1rem 0.35rem",
                borderRadius: "9999px",
                backgroundColor: "rgba(255,255,255,0.2)",
              }}
            >
              −17%
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Tier card ────────────────────────────────────────────────────────────────

function TierCard({ tier, billing }: { tier: Tier; billing: "monthly" | "yearly" }) {
  const price = tier.price[billing];
  const isContactSales = price === null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "2rem",
        borderRadius: "1rem",
        border: tier.highlighted
          ? "2px solid var(--color-accent)"
          : "1px solid var(--color-border)",
        backgroundColor: tier.highlighted ? "var(--color-surface)" : "var(--color-base)",
        position: "relative",
        flex: "1 1 280px",
        maxWidth: "380px",
      }}
    >
      {tier.highlighted && (
        <div
          style={{
            position: "absolute",
            top: "-1px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "var(--color-accent)",
            color: "var(--color-base)",
            fontSize: "0.6875rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "0.25rem 0.875rem",
            borderRadius: "0 0 0.5rem 0.5rem",
          }}
        >
          Most popular
        </div>
      )}

      <div style={{ marginBottom: "1.5rem" }}>
        <h2
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.5rem",
            fontWeight: 600,
            marginBottom: "0.25rem",
            color: "var(--color-text-primary)",
          }}
        >
          {tier.name}
        </h2>
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
          {tier.tagline}
        </p>
      </div>

      <div style={{ marginBottom: "2rem" }}>
        {isContactSales ? (
          <p
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "2rem",
              fontWeight: 600,
              color: "var(--color-text-primary)",
            }}
          >
            Custom
          </p>
        ) : (
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
            {tier.priceFrom && price! > 0 && (
              <span style={{ fontSize: "0.9375rem", color: "var(--color-text-secondary)", marginRight: "0.15rem" }}>
                from
              </span>
            )}
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "2.5rem",
                fontWeight: 600,
                color: "var(--color-text-primary)",
                lineHeight: 1,
              }}
            >
              ${price}
            </span>
            {price! > 0 && (
              <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                / mo
              </span>
            )}
            {price === 0 && (
              <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                forever
              </span>
            )}
          </div>
        )}
        {billing === "yearly" && !isContactSales && price! > 0 && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
            Billed ${price! * 12}/yr per band
          </p>
        )}
        {tier.priceNote && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
            {tier.priceNote}
          </p>
        )}
      </div>

      <Link
        href={tier.ctaHref}
        style={{
          display: "block",
          textAlign: "center",
          padding: "0.625rem 1.25rem",
          borderRadius: "0.5rem",
          fontWeight: 600,
          fontSize: "0.9375rem",
          textDecoration: "none",
          marginBottom: "2rem",
          backgroundColor: tier.highlighted ? "var(--color-accent)" : "transparent",
          border: tier.highlighted ? "none" : "1px solid var(--color-border)",
          color: tier.highlighted
            ? "var(--color-base)"
            : "var(--color-text-primary)",
          transition: "opacity 0.15s",
        }}
      >
        {tier.cta}
      </Link>

      {tier.bands && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            marginBottom: "1.5rem",
            paddingBottom: "1.5rem",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <p
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            Seat bands
          </p>
          {tier.bands.map((band) => (
            <div
              key={band.name}
              style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem" }}
            >
              <span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
                <strong style={{ color: "var(--color-text-primary)" }}>{band.name}</strong> · {band.seats}
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-text-primary)", whiteSpace: "nowrap" }}>
                ${band.price[billing]}/mo
              </span>
            </div>
          ))}
        </div>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {tier.features.map((feature) => (
          <li
            key={feature}
            style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", fontSize: "0.875rem" }}
          >
            <CheckIcon
              size={16}
              style={{ flexShrink: 0, marginTop: "0.1rem", color: "var(--color-accent)" }}
            />
            <span style={{ color: "var(--color-text-secondary)" }}>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Comparison table ─────────────────────────────────────────────────────────

function ComparisonTable() {
  const categories = Array.from(
    new Set(comparisonRows.map((r) => r.category ?? ""))
  ).filter(Boolean);

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.875rem",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "0.75rem 1rem",
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                borderBottom: "2px solid var(--color-border)",
                width: "45%",
              }}
            >
              Feature
            </th>
            {tiers.map((tier) => (
              <th
                key={tier.id}
                style={{
                  textAlign: "center",
                  padding: "0.75rem 1rem",
                  fontWeight: 700,
                  color: tier.highlighted ? "var(--color-accent)" : "var(--color-text-primary)",
                  borderBottom: "2px solid var(--color-border)",
                  fontFamily: "var(--font-heading)",
                }}
              >
                {tier.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => {
            const rows = comparisonRows.filter((r) => r.category === cat);
            return (
              <>
                <tr key={`cat-${cat}`}>
                  <td
                    colSpan={4}
                    style={{
                      padding: "1rem 1rem 0.375rem",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--color-text-muted)",
                      backgroundColor: "var(--color-surface)",
                    }}
                  >
                    {cat}
                  </td>
                </tr>
                {rows.map((row, i) => (
                  <tr
                    key={row.feature}
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      backgroundColor: i % 2 === 0 ? "transparent" : "var(--color-surface)",
                    }}
                  >
                    <td style={{ padding: "0.75rem 1rem", color: "var(--color-text-primary)" }}>
                      {row.feature}
                    </td>
                    {(["self-host", "cloud", "enterprise"] as const).map((tierId) => {
                      const val = row[tierId];
                      return (
                        <td key={tierId} style={{ textAlign: "center", padding: "0.75rem 1rem" }}>
                          {typeof val === "boolean" ? (
                            val ? (
                              <CheckIcon
                                size={16}
                                style={{ display: "inline", color: "var(--color-accent)" }}
                              />
                            ) : (
                              <MinusIcon
                                size={16}
                                style={{ display: "inline", color: "var(--color-border)" }}
                              />
                            )
                          ) : (
                            <span style={{ color: "var(--color-text-secondary)" }}>{val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {faqItems.map((item, i) => (
        <div
          key={i}
          style={{
            borderRadius: "0.75rem",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "1.125rem 1.25rem",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              gap: "1rem",
            }}
          >
            <span
              style={{
                fontWeight: 600,
                fontSize: "0.9375rem",
                color: "var(--color-text-primary)",
              }}
            >
              {item.question}
            </span>
            <ChevronDownIcon
              size={18}
              style={{
                flexShrink: 0,
                color: "var(--color-text-secondary)",
                transform: open === i ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}
            />
          </button>
          {open === i && (
            <div
              style={{
                padding: "0 1.25rem 1.125rem",
                fontSize: "0.9rem",
                lineHeight: 1.65,
                color: "var(--color-text-secondary)",
              }}
            >
              {item.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  return (
    <>
      <SiteNav />

      <main>
        {/* Hero */}
        <section
          style={{
            textAlign: "center",
            padding: "5rem 1.5rem 3rem",
            maxWidth: "720px",
            margin: "0 auto",
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(2rem, 5vw, 3rem)",
              fontWeight: 600,
              lineHeight: 1.1,
              marginBottom: "1rem",
              color: "var(--color-text-primary)",
              fontVariationSettings: "'SOFT' 60",
            }}
          >
            Simple, transparent pricing
          </h1>
          <p
            style={{
              fontSize: "1.125rem",
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
              marginBottom: "2.5rem",
            }}
          >
            Start free and self-host forever. Move to Cloud when you want
            managed infrastructure — or contact us for Enterprise.
          </p>
          <BillingToggle billing={billing} onChange={setBilling} />
        </section>

        {/* Tier cards */}
        <section
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 1.5rem 5rem",
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {tiers.map((tier) => (
            <TierCard key={tier.id} tier={tier} billing={billing} />
          ))}
        </section>

        {/* Comparison table */}
        <section
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "0 1.5rem 6rem",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.75rem",
              fontWeight: 600,
              marginBottom: "2rem",
              textAlign: "center",
              color: "var(--color-text-primary)",
            }}
          >
            Full comparison
          </h2>
          <ComparisonTable />
        </section>

        {/* FAQ */}
        <section
          style={{
            maxWidth: "720px",
            margin: "0 auto",
            padding: "0 1.5rem 6rem",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.75rem",
              fontWeight: 600,
              marginBottom: "2rem",
              textAlign: "center",
              color: "var(--color-text-primary)",
            }}
          >
            Frequently asked questions
          </h2>
          <FaqAccordion />
        </section>

        {/* CTA band */}
        <section
          style={{
            backgroundColor: "var(--color-cream)",
            padding: "5rem 1.5rem",
            textAlign: "center",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
              fontWeight: 600,
              lineHeight: 1.15,
              marginBottom: "1rem",
              color: "#1e293b",
              fontVariationSettings: "'SOFT' 50",
            }}
          >
            Your knowledge, owned outright.
          </h2>
          <p
            style={{
              fontSize: "1rem",
              color: "#64748b",
              marginBottom: "2rem",
              maxWidth: "40ch",
              margin: "0 auto 2rem",
            }}
          >
            Start with Self-host — free forever. Upgrade when you need it.
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="https://github.com/marrow-software/marrow"
              style={{
                display: "inline-block",
                padding: "0.75rem 1.75rem",
                borderRadius: "0.5rem",
                fontWeight: 600,
                textDecoration: "none",
                backgroundColor: "#9a3412",
                color: "#fff",
              }}
            >
              Get started free
            </Link>
            <Link
              href="https://docs.marrow.so"
              style={{
                display: "inline-block",
                padding: "0.75rem 1.75rem",
                borderRadius: "0.5rem",
                fontWeight: 600,
                textDecoration: "none",
                border: "1px solid #c8d0e0",
                color: "#1e293b",
                backgroundColor: "transparent",
              }}
            >
              Read the docs
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
