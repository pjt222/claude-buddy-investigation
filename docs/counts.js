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
  // Total = 2 primary (buddy + advisor) + 16 inside the Wider Harness tab.
  // Wider-harness additions through v2.1.145 include: MCP client, Plugins,
  // Auto-Dream, Provider Registry, TUI Renderer, Background daemon, the
  // pi-passport research tooling, and the server-side billing-tier classifier.
  subsystems: {
    total: 18,
    wider_harness: 16
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
  // sandbox network classifier fail-closed → fail-open inversion (CRITICAL,
  // promoted in v129 via empirical wire capture: literal binary log line
  // "(fail open)" fires under documented attack input). PR-status path-switcher
  // remains Medium-info pending billed-mode runtime verification.
  // v129 added 1 disclosure-candidate: a destructure-rename pattern egresses raw
  // plugin/skill/marketplace identifiers as first-party-telemetry top-level
  // fields. PROMOTED HIGH→CRITICAL via MITM wire capture 2026-05-06: a single
  // bootstrap produced 356 raw skill_name + 9 plugin_name + 9 marketplace_name
  // on 2 event-logging batches; zero redaction.
  // v138 added 2 HIGH disclosures: a server-pushed forced-downgrade primitive
  // (typed-config eval-SDK reader returns {maxVersion, forceDowngradeEnabled})
  // and a partial defense for the ghost-inbox transcript-replay variant on the
  // skip-persistence path (third-party SDK wrapper survey: 5 of 7 sampled
  // wrappers default unconditionally to the bypass-vulnerable mode).
  // v140 added 1 disclosure-candidate promoted to CRITICAL during the cycle:
  // a server-pushed TUI notification flag delivers attacker-chosen content
  // to the user's terminal stream with no sanitization. Probe-HH (4-phase
  // PTY-mounted MITM session) confirmed raw ANSI escape sequences pass
  // through; probe-JJ demonstrated the most-impactful concrete chain — OSC 8
  // terminal hyperlinks rendered as mouse-clickable phishing labels with
  // attacker-chosen URL targets. Length cap is ~75 visible chars but ANSI
  // escapes are zero-width and survive the cap; markdown is rendered as
  // literal text (defensive). For v140 the original forced-downgrade
  // primitive also gained wire-evidence on its negative branch — Phase A
  // of a 2-phase MITM probe pushed an invalid (URL-shaped) value and
  // confirmed the SemVer-strict parser fires invalid-config telemetry,
  // closing one of the original promotion-gates with positive wire
  // evidence rather than static decode alone.
  //
  // TWO COUNTING BASES tracked here, deliberately:
  //   (1) audit-baseline-tally = SECURITY-AUDIT.md (13V + 1OBS) + curated
  //       post-audit GH adds. Historical lineage, codenamed C1/H1/M0/L1/OBS1.
  //   (2) gh_label_counts = live re-derivation from `gh issue list` severity
  //       labels in the private issue tracker (refreshed each version bump).
  //
  // by_severity sums to 30 (8+8+10+3+1).
  // session-61 docker-session promotions (2026-05-27):
  //   - #113 HIGH → CRITICAL (run-to-completion wire-confirmed on v2.1.152:
  //     the auto-updater + npm install actually replaces the on-disk
  //     @anthropic-ai/claude-code package with the attacker-chosen older
  //     version; post-probe `claude --version` reports the downgraded value)
  //   - #136 HIGH → CRITICAL (gate-a wire-confirmed on v2.1.152: a passive
  //     MITM capture observed the production server pushing a non-empty
  //     30-plugin server-allowlist by default to a standard first-party
  //     Pro account — the Anthropic-marketplace official plugins, including
  //     12 LSP language-server adapters)
  security: {
    total: 30,
    audit_vulnerabilities: 13,
    audit_observations: 1,
    post_audit: 16,
    by_severity: {
      critical: 8,
      high: 8,
      medium: 10,
      low: 3,
      observation: 1
    },
    // Live re-derivation from `gh issue list --label <sev>` (run 2026-05-27,
    // session-61 docker-session close). Re-derived DIRECTLY from gh, NOT
    // arithmetic. Counts ALL repo issues with severity labels, not just
    // curated post-audit additions.
    gh_label_counts: {
      critical: 14,
      high: 31,
      medium: 47,
      low: 9,
      labeled_total: 101,
      unlabeled_by_severity: 39,
      repo_total: 140,
      derived_at: "2026-05-31"
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
  flags: { resolution_layers: 7, gate_reads: 410, default_true: 22 },  // v158: CORRECTED 20→22 — the scalar was stale since v152 (frozen at 17 boolean + 3 typed); re-derived directly from the v158 binary = 19 boolean + 3 typed = 22, byte-stable in COUNT v156→v158. The v156 cycle raised the boolean count 17→19 in prose but never bumped this scalar. v156→v158 boolean composition shift: one new UI default added, one boolean flipped to default-false → net flat at 19. Reader identifiers continue rotating per release (case-flip recurrence on boolean, full rotation on typed).

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
    waves: 16,
    current_binary: "2.1.152",   // session-61 (2026-05-27); npm latest
    latest_session: 61
  },

  // ---- Version coverage ----
  version: {
    start: "v2.1.89",
    end: "v2.1.160",
    range: "v2.1.89 \u2192 v2.1.160",  // unicode rightwards arrow
    skipped: ["v2.1.120", "v2.1.122", "v2.1.124", "v2.1.125", "v2.1.127", "v2.1.130", "v2.1.134", "v2.1.135", "v2.1.136", "v2.1.137", "v2.1.139", "v2.1.146", "v2.1.149", "v2.1.150", "v2.1.151", "v2.1.154", "v2.1.155", "v2.1.157"]
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
  },

  // ---- pi-passport research tooling (subsystem PIPASS) ----
  // Research-grade tooling demonstrating that an OAuth bearer extracted from
  // a logged-in first-party Claude Code session can drive `/v1/messages` from
  // outside the official binary, against the same Pro/Max subscription billing
  // tier. The tooling exercises a billing-tier classifier evasion via a
  // sanitiser ladder applied to system-prompt blocks. Disclosure batched as
  // a single bundled report (research-grade, no in-the-wild abuse).
  //
  // Post-hardening tally re-derived from the multi-perspective audit at
  // results/pi-passport-review-postQ3Q4-2026-05-10.md (private). All Critical
  // and High items closed across 6 follow-up commits; remaining open work is
  // documented architectural limitations or out-of-scope research-grade Lows.
  pi_passport: {
    sanitiser_levels: 4,                  // ladder: light → nuclear
    classifier_corpus_size: 41,           // labelled samples; PASS:BLOCKED skew 37:4 (majority baseline 90.2%)
    sanctioned_path_l1_trials: 13,        // 3 verifier + 10 stress-multiturn
    sanctioned_path_l1_ci_lower_95_clopper: 0.7942,  // (0.05)^(1/13); the right CI for n=13
    statistical_scope: "demonstrated bypass within 2026-05-07 corpus snapshot; effective independent units = 1 classifier-snapshot, NOT the 13 Bernoulli trials",
    test_count: 112,                      // unit + integration; lineage 41 → 54 → 82 → 95 → 107 → 112
    review_post_hardening: {
      timestamp: "2026-05-10",
      severity_breakdown_original: { critical: 1, high: 11, medium: 12, low: 6, info: 5 },
      severity_breakdown_rebaselined: {
        closed: 35,
        refuted: 1,
        architectural_residual: 1,        // bearer-in-/proc; Pi contract requires env-var bearer-injection
        low_open: 3,                      // research-grade-acceptable: stderr meta, hot-reload-fwd-compat, import-time-side-effect
        info_writeup_open: 1,             // cosmetic doc snippet
        info_positive: 3,                 // tsconfig lib, no outcome→feature leakage, contained-env-pattern
        total: 44
      },
      empirical_falsification_class: "shell-script $PATH-attacker token exfil — pre-strip dependency-binary shim AND post-strip PATH forwarding; sandbox-confirmed with fake bearer (no real exfil); CLOSED via absolute-path resolution at startup + hardcoded minimal PATH in env-strip allowlist",
      hardening_themes: [
        "absolute-path resolution for all dependency binaries before any external invocation",
        "$PATH sanity-check refusing /tmp/* and . entries",
        "hardcoded minimal PATH in env-strip allowlist (no parent-shell PATH forwarding)",
        "CWE-78 arithmetic-injection guard via integer-format validation before bash $(( ... )) context",
        "single-flight mid-session OAuth refresh with background scheduler + clock-skew defense via server Date header",
        "TZ-stress test matrix (UTC / Asia/Tokyo / America/Los_Angeles / Pacific/Kiritimati) confirming epoch-only invariant",
        "Anthropic-API runtime drift watcher (Sunset / Deprecation / anthropic-deprecation-notice headers + version-error body types)",
        "Pi-API runtime event-shape sentinel (per-event expected/missing/wrong-type/extra-field detection, once-per-process dedup)",
        "nuclear-mode opt-in gate (env-injected level=4 clamps to 3 unless explicit second env var is set)",
        "client_id discovery primitive when hardcoded ladder exhausts (binary-string-grep for fresh UUIDs ranked by oauth-keyword proximity)",
        "MITM-log path safety: lstat refuses symlinks + non-regular-files + non-current-user-owned paths"
      ],
      remaining_open_classes: [
        "bearer-in-/proc/<pid>/environ (architectural — Pi contract; needs Pi-upstream change)",
        "stderr account meta on each request (research-grade-acceptable diagnostic surface)",
        "module-state under hot-reload (forward-compat — Pi has no hot-reload; A3 session_start hook covers single-process multi-session)",
        "import-time await side-effects in a script-only verifier",
        "writeup snippet predates module decompose (cosmetic)"
      ]
    },
    issue_bundle: 111
  },

  // ---- v140 round-1 + probe-AA ----
  // v140 (build 2026-05-13) extends the v139 (build 2026-05-11) chain. Flag delta
  // v138→v140 = +13 / -4 standalone. Reader rotated twice (bool case-flip v139→v140;
  // typed full rotate each release).
  //
  // Notable NEW telemetry/throw paths (v140) — CALIBRATED:
  //   - Two new telemetry events (subagent-type-miss + subagent-type-normalized,
  //     literal counts 0/0/3 + 0/0/2 across v138/v139/v140) plus one new
  //     ambiguous-detection error context (0/0/2). The pre-existing v138
  //     defenses for not-found and permission-denied subagent types stay
  //     byte-stable in v140. v140 EXPANDS the existing surface with
  //     telemetry + a fuzzy normalizer rather than introducing the
  //     defense class itself. Empirically verified live: the not-found
  //     error string matches the binary verbatim (pre-existing throw,
  //     re-confirmed under v140), and a dash-stripped fuzzy variant
  //     ("seniorresearcher") normalizes-and-launches successfully
  //     through the new normalizer.
  //   - A bash-safety telemetry event (fires on multi-category overlap
  //     during rule evaluation; classification-only — not a throw).
  //   - A defensive token re-fetch telemetry event on access-token
  //     mismatch (looks benign / hardening).
  //
  // Notable REMOVED flags: a previously DEFAULT-TRUE MCP-retry flag dropped.
  //
  // SCOPE VERDICT on the new subagent_type defense vs the prior SendMessage
  // attribution-forge finding (skill-fork ghost-inbox class):
  //   - Defense fires on the Task()/subagent_launch path ONLY.
  //   - The InboxPoller plan_approval_response handler that gates permission-mode
  //     escalation on a sender-string equality check is BYTE-STABLE v138→v140
  //     (canonical-form compare after identifier normalization across a
  //     600-byte anchored window — identical, including the "Ignoring ... from
  //     non-team-lead" log line that was already present in v138 and is NOT
  //     a new defense, just the non-matching-branch log).
  //   - Therefore the SendMessage attribution-forge variant of the prior
  //     ghost-inbox finding remains UNDEFENDED in v140. The new defense
  //     targets a different attack surface (LLM-hallucinated agent type at
  //     spawn time, not receiver-side attribution).
  //
  // Persistence check on prior findings (bounded-context grep, all byte-stable
  // v138→v140): the raw _PROTO_ destructure pattern, brief-mode stop-hook
  // GrowthBook reader, Datadog third-party gate, harbor PR-status flag,
  // hookSpecificOutput.updatedInput nesting, --teleport CLI flag, the
  // forced-downgrade canary primitive, the sourceToolAssistantUUID
  // transcript-replay literal, and parent_tool_use_id (phantom_parent class)
  // all unchanged.
  v140_round_1: {
    binary_size_bytes: 231577296,
    binary_size_delta_v138: 999424,
    standalone_flag_delta_v138_v140: { added: 13, removed: 4 },
    default_true_v138: 16,
    default_true_v140: 15,
    default_true_lost: ["<mcp-retry-flag>"],
    reader_rotation_count_v138_to_v140: 2,    // bool case-flip + typed full rotate
    new_defense_class: "telemetry + fuzzy-normalize on existing Task()/subagent_launch agentType validation",
    new_defense_paths_added_v140: 3,  // miss + normalized + ambiguous (the 6 prior throw contexts existed in v138 byte-stable)
    new_defense_empirically_fires: true,
    prior_defenses_byte_stable_v138_v140: 6,  // not_found, denied, teammate_background_denied, teams_unavailable, nested_teammate, recursive_fork
    prior_findings_persistence_checked: 9,
    prior_findings_byte_stable_count: 9,
    prior_findings_byte_stable_pct: 100,
    sendmessage_ac3_variant_byte_stable: true,
    sendmessage_ac3_defended_in_v140: false,
    new_disclosures_v140: 0
  },

  // ---- v141/v142/v143 round-1 (consolidated 3-version stability chain) ----
  // Three consecutive stability releases v141 (build 2026-05-13) / v142 (build 2026-05-14) /
  // v143 (build 2026-05-15, current head). Binary size 232.5 → 232.6 → 233.0 MB. Reader
  // identifiers rotated: boolean reader rotated v140→v141, again v141→v142, then HELD
  // v142→v143 (first hold of the boolean reader since v126). Typed reader rotated each
  // release. Flag delta v140→v143 cumulative +37/−10 (per-step v140→v141 +17/−5,
  // v141→v142 +13/−6, v142→v143 +8/−0 — v143 is a pure-additive release with zero flag
  // removals). DEFAULT-TRUE 15 → 17 → 18 → 18 (+3 net additions across the chain).
  //
  // Persistence check (all 14 priority findings byte-stable v140→v143 via bounded-context
  // grep — feature-flag literals, telemetry event names, beta-header strings, SDK Zod
  // schema fields, CLI flags, error message prose, and protocol field names): the TUI
  // startup-notice injection (v140 Critical), the raw `_PROTO_` destructure egress, the
  // third-party logging gate, the forced-downgrade primitive, the mid-conversation system
  // mechanism, the SendMessage attribution-forge field, the hook-output nesting pattern,
  // the `--teleport` CLI flag, the harbor PR-status flag, the brief-mode stop-hook reader,
  // and the phantom-parent field — all unchanged. Two surface-drift entries decoded as
  // benign code-path consolidation in the remote-control bridge (no semantic remediation).
  //
  // 3 DEFENSIVE primitives added v141-v142 (orthogonal/adjacent to filed issues, not
  // remediations): v141 adds a remote-control bridge event-attestation enforcement layer
  // (enforce / accept-statuses / drop-unverified modes — ORTHOGONAL to the SendMessage
  // attribution-forge ghost-inbox path which is local-FleetView, not bridge); v142 adds a
  // settings-hierarchy defense that prevents repo-controllable project-local settings
  // from granting an auto-mode permission default (a real hardening of the
  // prompt-via-settings family); v142 also adds telemetry-only model-response keyword
  // detection (NOT a security primitive).
  //
  // 1 NEW CAPABILITY decoded as DEFENSE-WORKING (not filed as a finding): v143 introduces
  // a multi-store team-memory mirror gated by a JSON env var. Static decode confirms
  // triple-gate eligibility (trust-dialog + a default-FALSE GrowthBook flag + OAuth
  // presence) + a path-validator that requires server-relative paths and rejects external
  // origin pivots (verified blocked: `https://evil.com/foo`, `//evil.com/foo`; verified
  // accepted: `/api/...`) + server-side ACL enforcement (per "Forbidden by server policy"
  // / "Not authorized for team memory sync" error literals) + per-store mode (rw vs ro)
  // controlling push direction + a path-confinement guard on disk writes. Attacker-
  // controlled env var only chooses WHICH server-authorized store to mirror; cannot grant
  // authorization victim doesn't already have. Documented as DEFENSE-IN-DEPTH WORKING
  // AS DESIGNED, NOT a vulnerability under current static decode. Caveat: the
  // path-validator's defense depends on the API base URL being attacker-uncontrolled;
  // base URL IS configurable via env var (enterprise/proxy setup), but that env-poisoning
  // primitive is already documented as out-of-scope same-UID-attacker terrain.
  //
  // Zero new disclosures filed v141-v143. Zero remediations observed across the chain.
  v141_v143_round_1: {
    versions_covered: ["v2.1.141", "v2.1.142", "v2.1.143"],
    chain_kind: "3-version stability release",
    binary_sizes_bytes: [232572624, 232625872, 233088720],
    standalone_flag_delta_v140_v143_cumulative: { added: 37, removed: 10 },
    standalone_flag_delta_per_step: [
      { step: "v140→v141", added: 17, removed: 5 },
      { step: "v141→v142", added: 13, removed: 6 },
      { step: "v142→v143", added: 8, removed: 0 }
    ],
    default_true_chain: { v140: 15, v141: 17, v142: 18, v143: 18 },
    reader_rotation_count: 3,  // boolean v140→v141 + v141→v142 (then held v142→v143); typed every release
    boolean_reader_first_hold_since: "v126",
    prior_findings_persistence_checked: 14,
    prior_findings_byte_stable_count: 14,
    prior_findings_byte_stable_pct: 100,
    defensive_primitives_added: 3,            // bridge attestation + auto-mode untrusted-source enforcement + model-response keyword detect (last is telemetry-only)
    new_capability_decoded_safe: 1,           // multi-store team-memory mirror (defense-working per static decode)
    new_disclosures_v141_v143: 0,
    remediations_observed: 0,
    surface_drift_decoded_benign: 2,           // remote-control bridge code-path consolidation accounts for the only -1 drifts
    notes: "All persistence claims use bounded-context grep on semantic literals (flag names, telemetry events, beta-header strings, Zod field names, CLI flags, error-message prose). Minified identifier names rotate per release and are explicitly NOT used as cross-version proof."
  },

  // ---- v2.1.144 / v2.1.145 round-1 + sessions 55-59 runtime-probe campaign ----
  // Static round-1 chain v143→v144→v145 (v145 build 2026-05-19, npm latest).
  // Flag delta v143→v145 = +14 / -6 standalone (net +8). The boolean reader and
  // the typed reader each rotated identifiers across the chain; DEFAULT-TRUE
  // stable at 18. All 21 priority-finding literals byte-stable v143→v145 — NO
  // remediation observed.
  //
  // Runtime: a containerized MITM probe-sandbox (sessions 58) plus PTY keystroke
  // automation driving a real interactive Claude Code TUI (session 59)
  // wire-confirmed two findings on an interactive TUI: a server-pushed
  // forced-downgrade primitive (#113, the auto-updater performed the downgrade
  // with no user prompt) and a server-pushed terminal-notification injection
  // (#127, rendered verbatim with unsanitized ANSI escapes). A mid-conversation
  // system substring predicate (#115) was negative on a full interactive TUI and
  // relabeled informational. The runtime-probe queue is now empty.
  //
  // New signals decoded statically: a server-pushed plugin-name allowlist flag
  // (now wired — catalogued), a new third-party-logging event class (#105-adjacent),
  // and a skill self-recursion guard (defensive, orthogonal to #31 AC3).
  cross_version_v144_v145: {
    versions_probed: 7,                  // v138, v140, v141, v142, v143, v144, v145
    priority_findings_byte_stable: 21,
    remediations_observed: 0,
    runtime_wire_confirmed: 2,           // #113 forced-downgrade, #127 startup-notice
    runtime_negative: 1,                 // #115 mid-conversation system → informational
    new_tooling: 2,                      // containerized MITM probe-sandbox, PTY keystroke automation
    flag_delta_v143_v145: { added: 14, removed: 6, net: 8 },
    default_true: 18,
    runtime_probe_queue: 0,              // all runtime-probe-needed issues cleared
    docs_gap_analysis: "results/docs-gap-analysis-2026-05-20.md",  // server-controlled channels undocumented
    notes: "All persistence claims use bounded-context grep on semantic literals. Minified reader identifiers rotate per release and are NOT used as cross-version proof."
  },

  // ---- Session-61 v145 → v147 / v148 / v152 round-1 (2026-05-27) ----
  // Three new binaries on disk; four release-number skips (v146/v149/v150/v151
  // never installed locally). v145 baseline reconstituted from npm pack of the
  // linux-x64 sub-package (the host install auto-purges previous binaries).
  // Cumulative tengu-flag delta v145→v152: +49 / −5 (net +44); per-step v145→v147
  // +20/-3, v147→v148 +0/-1 (only a single-version typo-fix re-roll), v148→v152
  // +30/-2. Bool reader continues the case-flip recurrence; DEFAULT-TRUE grew
  // 18→19→19→20 across the chain (two new defaults: a workflows-master gate
  // at v147, a daemon-binary-takeover gate at v152). ALL 20 testable priority
  // literals byte-stable across the 4-binary chain — NO REMEDIATION.
  //
  // Three new capability families decoded — no new disclosures filed:
  //   - workflows family (10 flags v147): user-invoked multi-phase autonomous
  //     task runner with phase tracking + budget/agent caps + journal-respawn.
  //     Reuses subagent infra — #31 AC3 surface still applies.
  //   - skills-sync family (4 flags v152): org-scoped server-pushed skill
  //     content sync via an organisation-skills API path returning per-skill
  //     zip archives. Multistore-class defense-in-depth: org auth + path
  //     validator (rejects ../absolute/parent-escape) + zip-slip-defended
  //     extraction via a regex that blocks `..` traversal at start/middle/end
  //     + size/count limits + atomic rename. Surface REGISTERED with
  //     promotion-gate to disclosure-candidate: requires crafted-zip MITM
  //     probe to verify whether sync'd skills auto-register their own
  //     hooks/hooks.json (the multistore-vs-amber-lattice severity
  //     discriminator).
  //   - daemon binary takeover (DEFAULT-TRUE gate, v152): auto-update of the
  //     background daemon binary when host binary version differs. Not a
  //     security-posture inversion.
  cross_version_v147_v152: {
    versions_probed: 3,                  // v147, v148, v152 (v146/v149/v150/v151 skipped on disk)
    baseline: "v2.1.145",
    priority_findings_byte_stable: 20,
    remediations_observed: 0,
    new_disclosures_filed: 0,
    runtime_wire_confirmed: 0,           // no probes this cycle — no wire-confirmable new primitive surfaced
    flag_delta_v145_v147: { added: 20, removed: 3, net: 17 },
    flag_delta_v147_v148: { added: 0, removed: 1, net: -1 },
    flag_delta_v148_v152: { added: 30, removed: 2, net: 28 },
    flag_delta_cumulative_v145_v152: { added: 49, removed: 5, net: 44 },
    default_true_v145: 18,
    default_true_v147: 19,
    default_true_v148: 19,
    default_true_v152: 20,
    new_capabilities_decoded: 3,
    skills_sync_severity: "defense-working (multistore-class) — surface registered with promotion-gate to disclosure-candidate, requires crafted-zip MITM probe to verify whether sync'd skill hooks/hooks.json auto-registers command-type hooks"
  },

  // ---- Session-62 v152→v153→v156 round-1 flag-delta (2026-05-29) ----
  // v2.1.156 = npm latest (BUILD 2026-05-28); v153 (BUILD 2026-05-27); v154/v155 skipped.
  // Net +21/-12 flags v152→v156. The boolean reader rotated identifiers again.
  // NO new disclosure-grade injection primitives. 15 of 16 priority literals byte-stable;
  // the forced-downgrade telemetry (#113) expanded to a 2nd call site (same primitive,
  // still CRITICAL), plus a new daemon version-fallback telemetry event in the same subsystem.
  // #115 (the mid-conversation-system substring-trigger mechanism) REMEDIATED: flag + mechanism
  //   removed from the binary in v156 (not renamed) → GH #115 CLOSED. Was informational, so the
  //   security tally is UNCHANGED.
  // New product capabilities: Opus 4.8 (claude-opus-4-8; tier-eligible accounts resolve "opus"
  //   to 4-8, 4-7 as non-eligible fallback), an "ultracode" max-effort mode (top tier of the
  //   effort ladder + dynamic-workflow-by-default, client-side toggle with no server override),
  //   and a workflows keyword opt-in.
  // +2 DEFAULT-TRUE boolean defaults — both decoded to UX/startup (a terminal-render gate and a
  //   startup-sequencing gate), not safety inversions. 5 new codenames all benign (one extends
  //   the known auto-mode classifier-model override; one is the built-in Claude-Code-docs skill).
  // Live label counts re-derived 2026-05-29: 14C/29H/46M/8L/136 — UNCHANGED.
  // Result: results/v2.1.153-156-round-1-flag-delta.md.
  cross_version_v153_v156: {
    versions_probed: 2,                  // v153, v156 (v154/v155 skipped)
    baseline: "v2.1.152",
    priority_findings_byte_stable: 15,   // 15 of 16 (#113 forced-downgrade telemetry expanded)
    remediations_observed: 1,            // #115 mechanism removed v156
    new_disclosures_filed: 0,
    runtime_wire_confirmed: 0,           // static-only cycle; ultracode runtime not security-warranted
    flag_delta_v152_v153: { added: 8, removed: 4, net: 4 },
    flag_delta_v153_v156: { added: 15, removed: 10, net: 5 },
    flag_delta_cumulative_v152_v156: { added: 21, removed: 12, net: 9 },
    default_true_bool_v152: 17,
    default_true_bool_v153: 17,
    default_true_bool_v156: 19,
    findings: {
      "115": "REMEDIATED + CLOSED — mid-conversation-system substring flag + mechanism removed v156 (not renamed); was informational, tally unchanged",
      "113": "EXPANDED (not remediated) — forced-downgrade telemetry gained a 2nd call site + a new daemon version-fallback telemetry event; severity unchanged (CRITICAL)"
    },
    new_capabilities_decoded: ["Opus 4.8 (claude-opus-4-8)", "ultracode max-effort mode", "workflows keyword opt-in"],
    gh_label_counts_reverified_2026_05_29: { critical: 14, high: 29, medium: 46, low: 8, total: 136 }  // unchanged
  },

  // ---- Session-63 v156→v158 round-1 (2026-05-31). v2.1.157 skipped (never published latest). ----
  cross_version_v156_v158: {
    versions_probed: 1,                  // v158 (v157 skipped)
    baseline: "v2.1.156",
    priority_findings_byte_stable: "all",
    remediations_observed: 0,            // no prior finding touched
    new_disclosures_filed: 1,            // #140 (HIGH)
    runtime_wire_confirmed: 0,           // static-only cycle; #140 promotion-gate probe queued (runtime-probe-needed)
    flag_delta: { added: 17, removed: 2, net: 15 },
    default_true_total: 22,              // re-derived from v158 binary: 19 boolean + 3 typed; byte-stable COUNT v156→v158
    default_true_bool: 19,               // NET FLAT v156→v158 (one new UI default added, one boolean flipped to default-false)
    default_true_typed: 3,
    findings: {
      "140": "NEW (HIGH) — the v158-new plugin-sync leg headlessly registers an org's synced plugins' MCP servers (including subprocess-spawning ones) via a non-authoritative refresh with no consent prompt in the sync caller; asymmetric to the skills-sync sibling which deliberately suppresses hook registration. Gated by an environment-variable opt-in (default off) plus org auth — not server-flippable. Promotion-gate to CRITICAL = a runtime confirmation that the headless refresh bypasses the normal MCP first-use trust prompt for org-synced subprocess servers; chains #136 + #110"
    },
    scope_correction: "the server-pushed sync framework predates v158 (the skills-sync env-gate is present in v156); only the plugin leg is v158-new",
    benign_decoded: ["a new loop reschedule trigger (the 7-day age-out bound stays intact — not a persistence-bypass)", "a clamped byte-stream idle-timeout (cannot be zeroed)"],
    rule: "DEFAULT-TRUE re-derived directly from the binary (19 boolean + 3 typed = 22); the top-level flags.default_true scalar was stale-by-2 since v152 and is corrected to 22 above",
    gh_label_counts_rederived_2026_05_31: { critical: 14, high: 31, medium: 47, low: 9, total: 140 }  // +2H incl. #140 + pi-passport backlog
  },

  // ---- Session-65 v158→v159→v160 round-1 (2026-06-02). Both published+installed. ----
  cross_version_v158_v160: {
    versions_probed: 2,                  // v159 (trivial), v160 (major)
    baseline: "v2.1.158",
    remediations_observed: 0,
    new_disclosures_filed: 0,            // net-defensive / defended / local-dev; remote-bridge logged as runtime-probe target W2
    runtime_wire_confirmed: 0,
    flag_delta_v158_v159: { added: 1, removed: 1, net: 0 },   // trivial: a model-codename string flag in, an image-resize telemetry rename out
    flag_delta_v159_v160: { added: 13, removed: 0, net: 13 },
    binary_size_delta: { v158_v159: "+20KB", v159_v160: "+2.16MB" },
    size_reconciliation: "the v160 +2.16MB = ~400KB new strings + ~1.76MB new code; the bundled runtime is byte-identical across the two builds → feature growth, not a runtime bump",
    new_env_literals_count: 39,          // new client env-var literals added to the pre-existing accessor registry, 0 removed
    default_true_total: 22,              // UNCHANGED, re-derived DIRECTLY from the v160 binary (boolean set byte-identical to v158)
    default_true_bool: 19,
    default_true_typed: 3,
    headline_subsystems: ["Cowork/CCR-v2 remote-environment bridge (runner-side)", "two-stage auto-mode safety classifier (fail-CLOSED)"],
    classifier_verdict: "SAFETY STRENGTHENING — two-stage + fail-closed (blocks on uncertainty/unavailability), the opposite of the #108 single-stage fail-open inversion; a server flag still steers the permission classifier's model/staging but the gate stays fail-closed (watch W1). A separate per-surface disable knob governs the status-SUMMARY classifier, NOT the permission gate — no permission fail-open.",
    bridge_verdict: "large networked+credentialed surface, but RUNNER-SIDE ONLY (activates as a cloud remote environment, not the local CLI); its egress component is a CONNECT proxy whose allow/deny policy is UNVERIFIED (a captured CIDR list is a standard no-proxy BYPASS list, NOT an SSRF denylist — corrected mid-session); the session-ingress token sits in a secrets store. Below the local-reachability bar that #140 cleared → runtime-probe target W2, not a finding.",
    watch_items: {
      W1: "the auto-mode PERMISSION classifier's model/staging is server-steerable; confirm a pushed weak/odd model cannot weaken the fail-closed gate",
      W2: "the remote-environment bridge's egress-gateway allow/deny policy + ingress-bearer steering — runs in the cloud env, likely needs an actual remote session or vendor-side review, not local MITM",
      W3: "a mid-conversation-system env override — trace consumer, confirm it is dev/test-gated (it sits beside mock/override knobs)",
      W4: "a new authenticated-service bearer env — decode the service + base URL + what the bearer authenticates to",
      W5: "a new sub-agent-output security-warning surface — assess vs the #31 attribution-forgery class (likely an output content-check, orthogonal to inbox attribution)"
    },
    benign_decoded: ["an interactive-only composer model-routing triad (model catalog-bounded, disabled in non-interactive mode)", "a first-party model-refusal recovery (user-prompted path; auto path untraced — not asserting 'never silent')", "bounded daemon respawn-on-idle-stale resilience", "a remote-session transcript persistence-sync (inherent to remote-session reattach, not covert local exfil)"],
    methodology_rule: "a flag-name-only diff under-reads feature releases — the non-flag diff (client env vars, server-pushed client-cache keys, new API endpoints, runtime version) is now mandatory per release; reconcile the binary-size delta against the strings-byte delta to separate new code from new strings from a runtime bump",
    gh_label_counts_unchanged_2026_06_02: { critical: 14, high: 31, medium: 47, low: 9, total: 140 }  // no issue filed/closed this cycle
  }
});
