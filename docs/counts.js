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
  // Total = 2 primary (buddy + advisor) + 13 inside the Wider Harness tab.
  // +4 since prior build: MCP client (gap→core), Plugins (new), Auto-Dream (new), Provider Registry (new)
  // +1 wave 7: TUI Renderer (three-tier: Ink Flexbox, DECSTBM, minimal Fragment)
  subsystems: {
    total: 15,
    wider_harness: 13
  },

  // ---- Security findings ----
  // SECURITY-AUDIT.md enumerates 13 vulnerabilities + 1 observation = 14.
  // Plus #31 AC3 (ghost-inbox forgery, empirical 2026-04-14) = 15 total.
  // Plus 6 mithril-probe harness findings (#73/#76 HIGH, #78/#80/#81/#85 MEDIUM) = 21 total.
  // v126 added 2 disclosure-candidates: brief-mode stop-hook GrowthBook injection
  // (Critical, empirically reaches model context as user-text verbatim, no client-side
  // length cap at 64KB confirmed) + Datadog third-party processor PII leak (High,
  // extends earlier envelope-leak finding with new processor surface).
  // v128 added 3 disclosure-candidates: ShareOnboardingGuide tool unauth-public share
  // URL (HIGH — round-3 USER incognito test reported "landed cleanly" but round-4
  // scrapling re-test from WSL host with no cookies got 3-of-3 server-side redirects
  // to /login?returnTo=...; promotion-gate from HIGH to CRITICAL pending USER
  // re-verification of which URL appeared in the address bar + whether canary
  // marker rendered or "Sign in" interstitial appeared),
  // <iron-gate-flag> sandbox network classifier fail-closed→fail-open inversion
  // (Med-High), <harbor-prism-flag> PR-status path-switcher (Med info).
  // v129 added 1 disclosure-candidate: <_PROTO_-leak> destructure-rename pattern
  // egresses raw plugin/skill/marketplace identifiers as 1P-telemetry top-level
  // fields. PROMOTED HIGH→CRITICAL via probe-r MITM 2026-05-06: empirical wire
  // capture showed 356 raw skill_name + 9 plugin_name + 9 marketplace_name on
  // 2 event_logging batches from a single bootstrap; zero redaction.
  // 2026-05-06 follow-up via probe-v2: iron-gate fail-open EMPIRICALLY confirmed
  // (literal binary log line "(fail open)" fires under documented attack input);
  // #108 PROMOTED Med-High→CRITICAL.
  // by_severity sums to 27 (5+7+11+3+0+1).
  security: {
    total: 27,
    audit_vulnerabilities: 13,
    audit_observations: 1,
    post_audit: 13,  // #31 AC3 + 6 mithril harness + brief stop-hook + Datadog 3rd-party + share-onboarding + iron-gate + harbor-prism + _PROTO_-leak
    by_severity: {
      critical: 5,   // C1 + #31 AC3 + brief stop-hook injection (v126) + _PROTO_-leak (v129, probe-r MITM) + iron-gate fail-open (v128, probe-v2 MITM 2026-05-06)
      high: 7,       // H1, H2 (resolved), H4, #73 off-switch, #76 paper_halyard, Datadog 3rd-party (v126), share-onboarding (v128, pending re-verify)
      medium: 11,    // M0-M5, #78 datadog (subset), #80 moth_copse, #81 passport_quail, #85 malort_pedway, harbor-prism (v128)
      med_high: 0,   // iron-gate fail-open promoted to CRITICAL via probe-v2 empirical
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
    binary_markers: 15  // &lt;flag-name&gt; + &lt;flag-name&gt; + ScheduleWakeup refs
  },

  // ---- Skills / hooks / flags ----
  skills: { bundled: 41 },
  hooks: { event_types: 27 },  // v2.1.112 binary: full tT[] array has 27 types (was 9 documented)
  // 7-layer resolution (v2.1.110 binary decode):
  //   1. CLAUDE_CODE_DISABLE_* env kill switches (caller-side)
  //   2. Session override map sTH() — env-var injected (CLAUDE_CODE_FEATURE_FLAGS)
  //   3. Project-local flag overrides tTH()
  //   4. GrowthBook feature cache (cachedGrowthBookFeatures in ~/.claude.json)
  //   5. Statsig supplemental gates [statsig-gate-fn] (cachedStatsigGates)
  //   6. Grove policy (GET /api/[internal-policy-endpoint])
  //   7. Embedded default ($ parameter fallback)
  flags: { resolution_layers: 7, gate_reads: 410, default_true: 17 },  // v131 round-1: unified reader G$ (410 sites) + parallel P0 3-arg reader (18 sites) — no rotation v129→v131. DEFAULT-TRUE bool count = 17 (corrected from 15; prior count missed P0's 3-arg form covering iron_gate_closed/kairos_cron/kairos_cron_durable). Set byte-identical v128↔v129↔v131.

  // ---- Local agents subsystem ----
  agents: {
    telemetry_events: 15,
    env_vars: 4
  },

  // ---- CCR cloud-runner ----
  // Core CCR verified against v2.1.109 binary in ccr-subsystem-2026-04-15.md.
  // total_events = teleport(17) + bridge(30) + ccr_umbrella(7) = 54.
  // Sub-surfaces probed on v2.1.110: ultrareview (review-namespace) + autofix-pr (autofix-namespace).
  ccr: {
    teleport_events: 17,
    bridge_events: 30,
    ccr_umbrella_events: 7,
    total_events: 54,
    ultrareview_events: 5,         // review-namespace namespace (preflight, launched, overage, bughunter)
    autofix_events: 2,             // autofix-namespace namespace (started, result)
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
  // Probed on v2.1.110. Detection order in [provider-detect-fn]; firstParty-equivalence gate [first-party-equiv-fn].
  // foundry = scaffolded (env vars + client class, no telemetry events);
  // anthropicAws = firstParty-peer (reuses firstParty event infrastructure, zero dedicated events).
  providers: {
    total: 6  // firstParty, bedrock, vertex, foundry (scaffolded), anthropicAws (firstParty-peer), mantle
  },

  // ---- CCR wave 6 additions ----
  // remote_trigger: [remote-trigger-gate] gate, ccr-triggers-2026-01-30
  // cobalt_lantern: GitHub token-sync CCR access
  remote_trigger: {
    actions: 5  // list, get, create, update, run
  },

  // ---- MCP Official Marketplace auto-installer (wave 6, v2.1.112) ----
  official_marketplace: {
    blocked_states: 3  // policy_blocked, already_installed, git_unavailable
  },

  // ---- TUI Renderer (wave 7, v2.1.114) ----
  tui: {
    tiers: 3,  // Ink Flexbox (fullscreen), DECSTBM a36 (scroll-region), minimal Fragment (fallback)
    decstbm_native_history: 10000  // nativeHistory buffer size
  },

  // ---- Team telemetry (wave 6, v2.1.112) ----
  team_telemetry: {
    total_events: 16  // was 0 prior to v2.1.112
  },

  // ---- Investigation metadata ----
  investigation: {
    agents_deployed: "21+",
    waves: 16
  },

  // ---- Version coverage ----
  version: {
    start: "v2.1.89",
    end: "v2.1.131",
    range: "v2.1.89 \u2192 v2.1.131",  // unicode rightwards arrow
    skipped: ["v2.1.120", "v2.1.122", "v2.1.124", "v2.1.125", "v2.1.127", "v2.1.130"]
  },

  // ---- v126 brief-mode stop-hook GrowthBook content injection ----
  // Empty-default GrowthBook string-flag overrides hardcoded harness Stop-hook
  // reminder text in brief mode. Empirically reaches model context as a synthetic
  // user-text message verbatim (probe-q canary). 64KB canary upper-bound test
  // (probe-u) confirms NO client-side length cap. No certificate pinning at the
  // eval channel (probe-s) \u2014 network-MITM threat is realistic in addition to
  // server-side per-account targeting.
  brief_stop_hook_injection: {
    flag: "<brief-mode-stop-hook-flag>",  // GrowthBook string-flag, empty default
    reach_layer: "model context as synthetic user-text message verbatim",
    confirmed_canary_size_bytes: 65596,    // empirical upper bound, no cap detected
    cert_pinning_at_eval_channel: false,
    severity: "critical",
    mitigations_invalidated: 1,            // length-cap mitigation verified missing
    targeting_envelope: "per-account via existing GrowthBook eval-request payload"
  },

  // ---- v126 Datadog third-party processor extension of envelope-leak class ----
  // When the Datadog event-logging gate flag is server-flipped on for an account,
  // a 110-event subset of telemetry duplicates to Datadog US5 ingest. Body retains
  // session_id (every event), subscription_type (also search-indexed via ddtags),
  // last_session_id (cross-session correlation), and 47-field system fingerprint.
  datadog_third_party_leak: {
    endpoint: "http-intake.logs.us5.datadoghq.com/api/v2/logs",
    event_allow_list_size: 110,            // subset of all telemetry events
    ddtag_field_count: 23,                 // search-indexed at SaaS
    confirmed_pii_in_body: ["session_id", "subscription_type", "last_session_id"],
    severity: "high",
    extends: "earlier envelope-leak class (raw session/account identifiers)"
  },

  // ---- v128 ShareOnboardingGuide unauth-public share URL ----
  // New built-in agentic tool reads ONBOARDING.md from cwd and POSTs/PUTs
  // contents to <organization-onboarding-endpoint>; returns a share_url. Empirical
  // promotion-gate (anon-incognito browser, no cookies, no claude.ai login):
  // page rendered the canary content client-side; cross-org content-leak via
  // single URL confirmed. Tool is gated by <share-tool-gate> GrowthBook
  // string-flag, server-flipped ON for the reporter's account. No delete API
  // in v128 binary (only check/update/create). mode:"check" not idempotent-read
  // (no-existing → POSTs upload). Tool result text injects model-directing
  // instruction (Close with: "...") same channel class as #106 brief stop-hook.
  share_onboarding_unauth_public_url: {
    flag: "<share-tool-gate>",                  // GrowthBook string-flag, default false
    server_flipped_on_for_reporter_account: true,
    cwd_file_read: "ONBOARDING.md",
    file_size_cap_bytes: 65536,
    endpoint: "<organization-onboarding-endpoint>",
    share_url_pattern: "<onboarding-share-url-pattern>",
    short_code_chars: 12,
    short_code_charset: "mixed-case alphanumeric",
    auth_required_to_view_share_url: "needs-reverify",  // round-3 USER incognito reported "landed cleanly"; round-4 scrapling 3-of-3 redirected to /login
    delete_api_present: false,
    model_invocable: true,                       // no disableModelInvocation flag
    tool_result_instruction_injection: true,     // Bx7 "Close with: ..." text
    mode_check_idempotent_read: false,           // POSTs upload if no existing
    cwes: ["CWE-200 (pending re-verify)", "CWE-94", "CWE-915"],
    severity: "high",
    severity_promotion_gate_pending: "USER incognito re-verify with explicit address-bar + sign-in-interstitial check"
  },

  // ---- v128 iron_gate sandbox network classifier fail-closed inversion ----
  // <iron-gate-flag> default-TRUE controls fail-closed-vs-fail-open
  // behaviour of the sandbox network classifier when classifier is unavailable.
  // Server flip to false inverts the safety default from DENY (fail-closed) to
  // ALLOW (fail-open). Server-flippable safety-default inversion.
  iron_gate_fail_open_inversion: {
    flag: "<iron-gate-flag>",                   // GrowthBook boolean-flag, default true
    default_behavior_when_classifier_unavailable: "deny (fail-closed, safe)",
    behavior_after_server_flip_to_false: "allow (fail-open, unsafe)",
    severity: "medium-high",
    promotion_gate_to_high: "empirical observation of classifier-unavailable window in normal operations"
  },

  // ---- v128 harbor_prism PR-status path-switcher ----
  // <harbor-prism-flag> string-flag (default false) switches PR-status
  // check between local `gh pr view` (default, ground truth) and Anthropic-server
  // side path. Decision-routing flag — diverges per-account.
  harbor_prism_path_switcher: {
    flag: "<harbor-prism-flag>",                // GrowthBook string-flag, default false
    off_path: "local `gh pr view --json ...` (ground truth)",
    on_path: "Anthropic-server side <pr-server-path-fn>($) routing",
    severity: "medium-info",
    class: "decision-routing flag — per-account path-divergence"
  },

  // ---- v128 positive delta: session_memory feature retired ----
  // <session-memory-flag-cluster> (5 flags) all removed in v128 binary.
  // Zero hits in v128 for session_memory / memory_extraction / MemorySaved /
  // initExtractMemory / UpdateMemory / memoryFile. Auto-memory feature
  // appears fully retired — privacy improvement.
  v128_positive_session_memory_retired: {
    flags_removed: 5,
    behaviour: "auto-memory feature fully retired in v128",
    note: "positive privacy delta to acknowledge alongside negative findings"
  },

  // ---- v128 reader rotation + flag delta ----
  v128_flag_delta: {
    boolean_reader: { v126: "<gb-bool-reader-v126>", v128: "<gb-bool-reader-v128>" },  // identifier rotation only
    string_reader: { v126: "<gb-string-reader-v126>", v128: "<gb-string-reader-v128>" },
    flags_added: 37,
    flags_removed: 17,
    bg_daemon_events_added: 17,    // adopt/attach/dispatch/worker lifecycle expansion
    note: "reader rotation = identifier-only churn (same call signature, version-specific minified name)"
  }
});
