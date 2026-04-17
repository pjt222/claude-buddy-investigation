/* === Single Source of Truth for displayed counts ===
 *
 * All numeric claims surfaced in index.html (hero tags, stats ribbon,
 * section intros, footer, nav-card bodies, catalogue headers) resolve
 * through this object. Update values HERE, then the DOM walker in
 * app.js picks them up on page load.
 *
 * Elements in index.html opt in via `data-count="path.to.key"`. The
 * walker replaces textContent with the resolved string. HTML fallback
 * text is preserved for no-JS viewers and file:// previews where the
 * parse happens, but the canonical value lives here.
 *
 * Format conventions:
 *   - Integers for counts; strings for ranges or compounds like "34.4T"
 *   - Nested namespaces for readability (counts.security.total)
 *   - Comments inline with each section explain the source of truth
 */

window.VIZ_COUNTS = Object.freeze({
  // ---- Subsystem taxonomy ----
  // Total = 2 primary (buddy + advisor) + 12 inside the Wider Harness tab.
  // +4 since prior build: MCP client (gap→core), Plugins (new), Auto-Dream (new), Provider Registry (new)
  subsystems: {
    total: 14,
    wider_harness: 12
  },

  // ---- Security findings ----
  // SECURITY-AUDIT.md enumerates 13 vulnerabilities + 1 observation = 14.
  // Plus #31 AC3 (ghost-inbox forgery, empirical 2026-04-14) = 15 total.
  // by_severity sums to 15 (2+3+6+3+1).
  security: {
    total: 15,
    audit_vulnerabilities: 13,
    audit_observations: 1,
    post_audit: 1,
    by_severity: {
      critical: 2,   // C1 + #31 AC3
      high: 3,       // H1, H2 (resolved), H4
      medium: 6,     // M0-M5
      low: 3,        // L1-L3
      observation: 1 // OBS1
    }
  },

  // ---- Buddy companion system ----
  buddy: {
    species: 18,
    companions_possible: "34.4T",  // species × personalities × stats
    triggers: 6                     // turn, hatch, pet, test-fail, error, large-diff
  },

  // ---- Advisor system ----
  advisor: {
    telemetry_events: 5  // command, dialog_shown, tool_call, tool_interrupted, tool_token_usage
  },

  // ---- Kairos loop system ----
  kairos: {
    binary_markers: 15  // loop + kairos + ScheduleWakeup refs
  },

  // ---- Skills / hooks / flags ----
  skills: { bundled: 41 },
  hooks: { event_types: 27 },  // v2.1.112 binary: full array has 27 types (was 9 documented)
  // 7-layer resolution (v2.1.110 binary decode):
  //   1. CLAUDE_CODE_DISABLE_* env kill switches (caller-side)
  //   2. Session override map sTH() — env-var injected (CLAUDE_CODE_FEATURE_FLAGS)
  //   3. Project-local flag overrides tTH()
  //   4. GrowthBook feature cache (cachedGrowthBookFeatures in ~/.claude.json)
  //   5. Statsig supplemental gates (cachedStatsigGates)
  //   6. Grove policy
  //   7. Embedded default (fallback)
  flags: { resolution_layers: 7 },

  // ---- Local agents subsystem ----
  agents: {
    telemetry_events: 15,
    env_vars: 4
  },

  // ---- CCR cloud-runner ----
  // Core CCR verified against v2.1.109 binary in ccr-subsystem-2026-04-15.md.
  // total_events = teleport(17) + bridge(30) + ccr_umbrella(7) = 54.
  // Sub-surfaces probed on v2.1.110: ultrareview + autofix-pr.
  ccr: {
    teleport_events: 17,
    bridge_events: 30,
    ccr_umbrella_events: 7,
    total_events: 54,
    ultrareview_events: 5,         // ultrareview namespace (preflight, launched, overage, bughunter)
    autofix_events: 2,             // autofix-pr namespace (started, result)
    env_vars: 12,                  // full CCR_* + CLAUDE_CODE_REMOTE* family
    sessions_api_paths: 11,        // /v1/sessions/* templates
    environments_api_paths: 8,     // /v1/environments/* templates
    beta_header: "ccr-byoc-2025-07-29"  // resolved from b81 in cinder-dig
  },

  // ---- MCP subsystem ----
  // Probed on v2.1.110 in results/mcp-client-2026-04-16.md.
  // 8 transport types: stdio, sse, sse-ide, ws, ws-ide, http, claudeai-proxy, sdk.
  mcp: {
    total_events: 42,
    transport_types: 8,
    oauth_events: 6  // per-server OAuth flow: start, success, failure, error, refresh_success, refresh_failure
  },

  // ---- Plugins subsystem ----
  // Probed on v2.1.110 in results/plugins-subsystem-2026-04-16.md.
  // Extends the CLI with skills, agents, hooks, MCP servers, LSP servers, monitors.
  plugins: {
    total_events: 22,
    extension_types: 6,  // skills, agents, hooks, mcp_servers, lsp_servers, monitors
    cli_subcommands: 9   // install, uninstall, enable, disable, list, update, marketplace add/remove/refresh
  },

  // ---- Auto-Dream memory scheduler ----
  // Probed on v2.1.110 in results/auto-dream-2026-04-16.md.
  // Background memory-consolidation; forks dream agent with skipTranscript=true.
  auto_dream: {
    total_events: 5,      // _skipped, _fired, _completed, _failed, _toggled
    min_sessions_default: 5,
    min_hours_default: 24
  },

  // ---- Provider registry ----
  // Probed on v2.1.110. Detection order via provider registry; firstParty-equivalence gate applied.
  // foundry = scaffolded (env vars + client class, no telemetry events);
  // anthropicAws = firstParty-peer (reuses firstParty event infrastructure, zero dedicated events).
  providers: {
    total: 6  // firstParty, bedrock, vertex, foundry (scaffolded), anthropicAws (firstParty-peer), mantle
  },

  // ---- Investigation metadata ----
  investigation: {
    agents_deployed: "21+",
    waves: 5
  },

  // ---- Version coverage ----
  version: {
    start: "v2.1.89",
    end: "v2.1.112",
    range: "v2.1.89 \u2192 v2.1.112"  // unicode rightwards arrow
  }
});
