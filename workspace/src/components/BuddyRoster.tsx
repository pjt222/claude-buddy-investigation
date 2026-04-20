import { BuddyPane } from "./BuddyPane";
import type { BuddyReactionPayload, SessionInfo } from "../../shared/protocol";

interface BuddyRosterProps {
  session: SessionInfo | null;
  reactions: BuddyReactionPayload[];
}

export function BuddyRoster({ session, reactions }: BuddyRosterProps) {
  if (!session || session.buddies.length === 0) {
    return (
      <div
        style={{
          padding: 12,
          fontSize: 11,
          color: "var(--text-dim)",
          textAlign: "center",
        }}
      >
        No session loaded.
        <br />
        Select a preset to activate buddies.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--text-dim)",
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        Buddies ({session.buddies.length})
      </div>
      {session.buddies.map((buddy) => (
        <BuddyPane
          key={buddy.slot}
          name={buddy.name}
          species={buddy.species}
          tier={buddy.tier}
          slot={buddy.slot}
          skills={buddy.skills}
          stats={buddy.stats}
          rarity={buddy.rarity}
          reactions={reactions}
        />
      ))}
    </div>
  );
}
