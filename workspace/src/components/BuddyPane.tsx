import { useEffect, useState } from "react";
import type { BuddyReactionPayload } from "../../shared/protocol";

const SPECIES_EMOJI: Record<string, string> = {
  owl: "\u{1F989}", axolotl: "\u{1F98E}", blob: "\u{1FAE0}", cactus: "\u{1F335}",
  capybara: "\u{1F9AB}", cat: "\u{1F431}", chonk: "\u{1F43E}", dragon: "\u{1F409}",
  duck: "\u{1F986}", ghost: "\u{1F47B}", goose: "\u{1FAB6}", mushroom: "\u{1F344}",
  octopus: "\u{1F419}", penguin: "\u{1F427}", rabbit: "\u{1F430}", robot: "\u{1F916}",
  snail: "\u{1F40C}", turtle: "\u{1F422}",
};

const TIER_COLORS = {
  bubble: "var(--v6)",
  bootstrapped: "var(--v4)",
};

// 10s TTL with 7s fade matching native bubble behavior
const BUBBLE_TTL = 10000;
const FADE_START = 7000;

const VIRIDIS_STOPS = [
  "#440154", "#482878", "#3e4989", "#31688e", "#26828e",
  "#1f9e89", "#35b779", "#6ece58", "#fde725",
];

function statBarColor(value: number): string {
  const idx = Math.min(Math.floor(value / 12.5), VIRIDIS_STOPS.length - 1);
  return VIRIDIS_STOPS[idx];
}

const STAT_ORDER = ["DEBUGGING", "PATIENCE", "CHAOS", "WISDOM", "SNARK"];

interface BuddyPaneProps {
  name: string;
  species: string;
  tier: "bubble" | "bootstrapped";
  slot: string;
  skills: string[];
  stats?: Record<string, number>;
  rarity?: string;
  reactions: BuddyReactionPayload[];
}

export function BuddyPane({ name, species, tier, skills, stats, reactions }: BuddyPaneProps) {
  const latestReaction = reactions.filter((r) => r.name === name).at(-1);
  const [opacity, setOpacity] = useState(1);

  // Animate bubble TTL: full opacity for 7s, fade over 3s
  useEffect(() => {
    if (!latestReaction) return;

    setOpacity(1);
    const fadeTimer = setTimeout(() => {
      setOpacity(0);
    }, FADE_START);

    const clearTimer = setTimeout(() => {
      // Bubble fully dismissed
    }, BUBBLE_TTL);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(clearTimer);
    };
  }, [latestReaction?.timestamp]);

  const emoji = SPECIES_EMOJI[species] || "\u{2753}";
  const tierColor = TIER_COLORS[tier];
  const borderAccent = tier === "bootstrapped" ? tierColor : "var(--border)";

  return (
    <div
      style={{
        padding: "8px 10px",
        borderBottom: "1px solid var(--border)",
        borderLeft: tier === "bootstrapped" ? `3px solid ${tierColor}` : "none",
        background: "var(--bg-card)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>{emoji}</span>
        <span style={{ color: tierColor, fontWeight: 600, fontSize: 12 }}>
          {name}
        </span>
        <span
          style={{
            color: tierColor,
            fontSize: 11,
            padding: "1px 4px",
            borderRadius: 3,
            border: `1px solid ${tierColor}`,
            opacity: 0.7,
          }}
        >
          {tier === "bubble" ? "BUBBLE" : "BOOT"}
        </span>
        {tier === "bootstrapped" && (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {species}
          </span>
        )}
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          {skills.map((skill) => (
            <span
              key={skill}
              style={{
                fontSize: 11,
                padding: "1px 5px",
                borderRadius: 3,
                background: "var(--v2)",
                color: "var(--text)",
              }}
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Stat bars */}
      {stats && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, margin: "6px 0" }}>
          {STAT_ORDER.map((stat) => {
            const value = stats[stat] ?? 0;
            return (
              <div
                key={stat}
                style={{
                  display: "grid",
                  gridTemplateColumns: "52px 1fr 20px",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "right", textTransform: "uppercase" }}>
                  {stat.slice(0, 5)}
                </span>
                <div
                  style={{
                    height: 6,
                    background: "rgba(255,255,255,0.05)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${value}%`,
                      height: "100%",
                      background: statBarColor(value),
                      borderRadius: 3,
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{value}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Reaction bubble */}
      {latestReaction && (
        <div
          role="status"
          aria-live="polite"
          style={{
            opacity,
            transition: "opacity 3s ease-out",
            background: "var(--bg)",
            border: `1px solid ${borderAccent}`,
            borderRadius: 6,
            padding: "6px 8px",
            fontSize: 11,
            lineHeight: 1.4,
            color: "var(--text-bright)",
            maxHeight: 120,
            overflow: "auto",
          }}
        >
          {latestReaction.reaction}
        </div>
      )}

      {!latestReaction && (
        <div style={{ fontSize: 10, color: "var(--text-dim)", fontStyle: "italic" }}>
          waiting for trigger...
        </div>
      )}
    </div>
  );
}
