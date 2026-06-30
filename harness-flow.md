# Claude Code Harness — Integrated Flow Map (Public)

**Scope**: composite structural map across v2.1.89 – v2.1.196. Redacted detail tier — feature-flag identifiers, the server config-push path, internal endpoint paths, and result-file references are replaced with role-level placeholders; per-release minified symbol names (which carry no meaning without the binary and rotate every build) are retained only as opaque cross-version anchors. Claude Desktop is out of scope; only Claude Code (WSL/binary) is mapped.

**Last updated**: 2026-06-30 (session 72). Brought forward to v2.1.196: the embedded diagram is refreshed to the full per-version detail map (now carrying the finding clusters through #155). Net change across the v178–v196 window: one new Critical (#154), one new High (#155), one upstream remediation (#108 at v179), one severity demotion (#127 Critical→High), and one hardening default-flip (v196). #154 (CRITICAL) — a new server-pushed string flag (empty default, no length cap) is wired verbatim into the system-prompt dynamic-section builder, reaching the `/v1/messages` system field (role:system) verbatim; wire-confirmed on an interactive TUI when an injected marker reached the system field (cluster AI; same channel class as #106 but a distinct flag and a role:system sink). #155 (HIGH) — a new server-pushed, schema-validated terminal-string array rendered in the startup banner via Ink `<Text>`; a byte-level test showed Ink/chalk strips the dangerous escape classes (cursor / clipboard / DSR / OSC 8 hyperlink) and only color survives, refuting the Critical/phishing reading — residual is server-controlled styled-text spoofing in the trusted startup banner (cluster AJ). #108 (CRITICAL) was remediated upstream at v179 — the default-true sandbox-classifier fail-open inversion was removed from the binary (0 occurrences v179+) and is retained in the census as a remediated Critical. #127 was demoted Critical→High — a byte-level re-test on the v191 image proved the startup-notification string renders through the same Ink `<Text>` path that strips the dangerous escape classes; the earlier Critical was a substring grep of one benign color class. v193–v195 produced zero new findings, zero remediations, zero regressions. v196 added zero findings and one hardening default-flip (an anti-MITM guard on artifact upload flipped default-off→on, the inverse of a fail-open) plus a benign first-party plugin binary-asset provisioning path (sha256-pinned, official-marketplaces-only, default-off, not executed by the harness — a WATCH, not a finding). Prior, 2026-06-15 (session 67), brought it to v2.1.177: added two abstract finding rows — #151 (a server-flippable git-credential-helper re-enable on the background plugin-marketplace auto-update fetch, High) and #152 (a server-flippable skip of the Edit/Write read-before-write guard, Low) — from the v161-177 retro-audit; the v160 Cowork remote-environment bridge + two-stage classifier and the v158 plugin-sync leg (#140) remain abstracted at the spine level. Prior, 2026-05-29 (session 62), brought it to v2.1.156: marked #115 (mid-conversation-system predicate) REMEDIATED — flag + mechanism removed from the binary in v156. Prior (2026-05-20, session 59) brought it to v2.1.145: added abstracted finding-status and cross-version-persistence summaries for the runtime-probe campaign (sessions 55–59), which wire-confirmed two findings on an interactive TUI and cleared the runtime-probe queue. Earlier additions retained: clusters for the v2.1.138 forced-downgrade primitive, the ghost-inbox AC3 partial defense, the mid-conversation system predicate, and the third-party-logging killswitch, plus the pi-passport research-tooling subsystem (post-hardening) and the server-side billing-tier classifier it exercises.

> **Version-composite disclaimer**: the three side-systems (buddy companion, advisor tool, Kairos self-continuation loop) were **never simultaneously live** in any single running build — the native buddy UI was removed mid-2.1 before the advisor feature-flag rolled out or the loop shipped. Read the diagram as a *structural map* of the harness's architectural surfaces, not as a snapshot of one installation.

---

## Diagram

```mermaid
flowchart LR
    %% ===== Startup Backbone =====
    subgraph SPINE["Startup Spine — gate every subsystem"]
        direction TB
        oauth["OAuth token<br/>~/.claude/.credentials.json"]:::core
        firstparty["firstParty check"]:::core
        orguuid["organizationUuid"]:::core
        providers["Provider registry resolveProvider()<br/>firstParty / bedrock / vertex / anthropicAws<br/>mantle / foundry(scaffolded)<br/>firstPartyEquivGate() firstParty-equivalence gate"]:::core
        mtls["mTLS envs (v2.1.101)<br/>CERT_STORE / CLIENT_CERT/KEY"]:::gap
        sdkrefresh["SDK OAuth refresh callback<br/>oauth-sdk-refresh-event"]:::gap
        flags["[feature-flag] feature flags — 7-layer resolution<br/>GrowthBook flagResolverA()/flagResolverB()/flagResolverC() + Statsig statsigResolver()<br/>grove /api/[internal-policy-endpoint]<br/>session/project/env overrides"]:::core
        envkill["[env-flag]* env kill switches"]:::core
        settings["~/.claude/settings.json<br/>~/.claude/.claude.json"]:::core
    end
    %% ===== Core Runtime A =====
    subgraph CORE["A — Core Runtime (per-turn loop)"]
        direction TB
        startup["Startup bootstrap<br/>getStartupInfo family"]:::core
        model_router["Model router modelRouterSelect() / resolveModelSpec(spec,mainLoop,override,permMode)<br/>opus-4-7 / opus-4-6 / sonnet-4-6 / haiku<br/>xhigh_effort→4-7 / max_effort→4-6<br/>[env-flag] override<br/>[1m] tier suffix: useOneMillionCtx()&&!suppressTierSuffix()<br/>inherit path via inheritModelSpec()"]:::core
        msgs_api["Messages API<br/>POST /v1/messages"]:::core
        turn_loop["Per-turn loop<br/>(ordering unverified)"]:::gap
        stream_handler["Streaming handler<br/>[advisor-response-type] / tool_result"]:::core
        hook_checkpoints["Hook checkpoints<br/>(7 named, 2 observed)"]:::gap
    end
    %% ===== D — Buddy =====
    subgraph BUDDY["D — Buddy [OUTSIDE]"]
        direction TB
        identity["Identity pipeline<br/>hash + Mulberry32"]:::core
        soul["Soul LLM call<br/>querySource: buddy_companion"]:::core
        companion_cfg["companion key<br/>(name, personality, hatchedAt)"]:::core
        turn_watcher["turnWatcher() turn watcher"]:::removed
        bi_sender["buddyDispatch() POST dispatcher"]:::removed
        buddy_api(["POST /buddy_react<br/>(API lives; UI removed v2.1.97)"]):::core
        sprite_ui["ASCII sprite + SpeechBubble"]:::removed
        intro_inject["companion_intro<br/>(dead filter v2.1.97+)"]:::removed
    end
    %% ===== E — Advisor =====
    subgraph ADVISOR["E — Advisor [INSIDE]"]
        direction TB
        advisor_gate["advisorGate() gate<br/>[advisor-gate]"]:::core
        advisor_schema["tool schema<br/>advisor_20260301"]:::core
        advisor_prompt["system prompt [advisor-prompt-A]/[advisor-prompt-B]"]:::core
        advisor_tool["advisor() tool-use<br/>inside Messages API"]:::core
        advisor_cost["[advisor-cost-tracker]/[advisor-cost-calc]/[advisor-cost-budget] cost tracking"]:::core
        advisor_cli["--advisor / /advisor<br/>(hidden until rollout)"]:::gap
    end
    %% ===== F — Kairos Loop =====
    subgraph LOOP["F — Kairos Loop [AROUND]"]
        direction TB
        sched_tool["ScheduleWakeup tool<br/>delaySeconds / prompt / reason"]:::core
        sentinels["4 sentinels<br/>autonomous-loop / loop.md / -dynamic"]:::core
        sched_fn["scheduleLoopWakeup<br/>clamp [60, 3600]"]:::core
        cron_create["CronCreate(kind: loop)"]:::core
        loop_state["state keyed by prompt hash<br/>recurringMaxAgeMs=7d"]:::core
        loop_slash["/loop slash command"]:::core
    end
    %% ===== G — MCP =====
    subgraph MCP["G — MCP (42 events)"]
        direction TB
        mcp_config["mcpServers key<br/>in .claude.json"]:::core
        mcp_client["MCP client mcpClient()<br/>8 transports: stdio/sse/sse-ide<br/>ws/ws-ide/http/claudeai-proxy/sdk"]:::core
        mcp_sandbox["mcpClient() allowlist<br/>[env-flag] + MCP_ALLOWLIST_ENV"]:::core
        mcp_bff["Registry BFF<br/>/mcp-registry/v0/servers"]:::core
        mcp_oauth["per-server OAuth (6 events)<br/>browser redirect → token → refresh"]:::core
        mcp_tools["MCP tools → tools array"]:::core
    end
    %% ===== H — Hooks + Skills =====
    subgraph EXTH["H — Hooks + Skills + Managed Agents"]
        direction TB
        hook_config["hooks config<br/>~/.claude/settings.json"]:::core
        hook_pipeline["Hook subprocess pipeline<br/>SessionStart / PreToolUse / PostToolUse<br/>UserPromptSubmit / Stop / SubagentStop / Notification"]:::gap
        skill_loader["Skill loader<br/>~/.claude/skills + almanac"]:::core
        dream_nightly["/dream nightly<br/>SessionStart consolidation"]:::gap
        ma_agents["POST [agents-endpoint] (doc-only,<br/>no live call-sites)"]:::gap
        async_stall["Async agent stall watchdog<br/>[agent-stall-gate]<br/>default 600s (CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS)<br/>aborts + marks task failed"]:::core
    end
    %% ===== I — State =====
    subgraph STATE["I — Session State"]
        direction TB
        claudejson["~/.claude/.claude.json"]:::core
        credsjson["~/.claude/.credentials.json"]:::core
        state_atomicity["write atomicity?<br/>(TOCTOU known, normal path untraced)"]:::gap
        transcript_mem["in-memory transcript"]:::core
    end
    %% ===== J — Telemetry =====
    subgraph TEL["J — Telemetry (fan-in)"]
        direction TB
        tel_main["advisor-events-5<br/>loop-events-3<br/>oauth-events-41<br/>mcp-events-42"]:::core
        tel_ccr["teleport-events-17+bridge_{30}+ccr_{7}<br/>[feature-flag]+autofix_{2}"]:::core
        tel_ext["plugin-events-22<br/>auto-dream-events-5<br/>[feature-flag]+file_{21}<br/>[feature-flag]+streaming_{7}+post_{9}"]:::core
        tel_v111["opus47-launch-shown<br/>ptl-surfaced<br/>velvet-moth-event<br/>unknown-command-suggestion"]:::core
        tel_team["Team telemetry (v2.1.112)<br/>16 events (was 0)<br/>team-events"]:::core
        tel_transport["Ingest: [event-logging-endpoint]<br/>+ Datadog [logs-endpoint]"]:::core
    end
    %% ===== L — CCR =====
    subgraph CCR["L — CCR Cloud-Runner"]
        direction TB
        ccr_gate["Gate: [ccr-gate]<br/>+ [remote-session-gate]<br/>+ allow_remote_sessions"]:::core
        teleport["Teleport (17 events)<br/>POST /v1/sessions/..."]:::core
        bridge["Bridge (30 events)<br/>POST /v1/environments/..."]:::core
        ultrareview["Ultrareview (5 events)<br/>GET [ultrareview-endpoint]<br/>SDK: {subtype:ultrareview_launch}"]:::core
        autofix_pr["Autofix-PR (2 events)<br/>POST [ccr-pr-endpoint]"]:::core
        remote_trigger["RemoteTrigger tool<br/>[remote-session-gate] gate<br/>ccr-triggers-2026-01-30<br/>actions: list/get/create/update/run"]:::core
        cobalt_lantern["[github-token-sync-gate]<br/>GitHub token-sync CCR access"]:::core
    end
    %% ===== M — Auto-Dream =====
    subgraph DREAM["M — Auto-Dream (5 events)"]
        direction TB
        dream_gate["dreamGate() gate:<br/>non-interactive / no autoMemory"]:::core
        dream_time["Time 24h + Session 5 gate<br/>PID lock dreamPidLock()"]:::core
        dream_agent["Dream agent<br/>forkLabel:auto_dream skipTranscript:true"]:::core
        dream_files["~/.claude/CLAUDE.md<br/>+ project memory tree"]:::core
    end
    %% ===== N — Plugins =====
    subgraph PLUGINS["N — Plugins (22 events)"]
        direction TB
        plugin_mkt["Marketplace GCS+git<br/>claude-plugins-official"]:::core
        plugin_load["Plugin loader<br/>skills+agents+hooks+mcp+lsp+monitors"]:::core
        plugin_hints["Hint system<br/>&lt;claude-code-hint&gt;"]:::core
        plugin_cli["claude plugin install|enable|disable<br/>list|update|marketplace"]:::core
        official_marketplace["Official MCP marketplace<br/>auto-installer (v2.1.112)<br/>[env-flag]<br/>[marketplace-autoinstall-gate]<br/>states: policy_blocked / already_installed / git_unavailable"]:::core
    end
    %% ===== P — v2.1.111+ New Systems =====
    subgraph NEW111["P — v2.1.111+ Systems"]
        direction TB
        opus47_launch["Opus 4.7 launch modal<br/>opus47-launch-shown<br/>opus47LaunchSeenCount"]:::core
        relay_chain["relay_chain_v1 flag<br/>strips parallel-Bash instructions<br/>from Bash tool description"]:::core
        cobalt_ridge["cobalt_ridge flag<br/>PowerShell tool on Windows<br/>[env-flag]"]:::core
        velvet_moth["velvet_moth / memory survey<br/>trigger: /memor(y|ies)/ regex<br/>co-event: [memory-survey-co-event]"]:::core
        proxy_auth["Corporate proxy auth<br/>PROXY_URL / PROXY_HOST<br/>PROXY_AUTH_HELPER + TTL<br/>trustAccepted / timed out"]:::core
        gb_sys_prompt["GrowthBook system prompt<br/>SYSTEM_PROMPT_GB_FEATURE<br/>remote-mode only: [env-flag]"]:::core
    end
    %% ===== K — TUI Renderer =====
    subgraph TUI["K — TUI Renderer (three-tier)"]
        direction TB
        tui_fullscreen["Tier 1: Ink Flexbox<br/>fullscreenGate()=true<br/>[ink-flexbox-gate] / [env-flag]<br/>OSC 8 hyperlinks"]:::core
        tui_decstbm["Tier 2: decstbmRenderer DECSTBM renderer<br/>[decstbm-gate] / [env-flag]<br/>scroll-region + nativeHistory[10K]<br/>syncViewport / tickPump / draw<br/>gate: TTY + not-tmux-CC + decstbmCapabilityCheck + not-Zellij + not-fullscreen"]:::gap
        tui_minimal["Tier 3: minimal Fragment<br/>(fallback)"]:::core
        tui_fullscreen -->|"fullscreenGate()=false"| tui_decstbm
        tui_decstbm -->|"decstbmGate()=false"| tui_minimal
    end
    %% ===== R — Background Daemon (v2.1.119) =====
    subgraph DAEMON["R — Background Daemon (v2.1.119 — 30 events)"]
        direction TB
        daemon_qqh["qqH() = return false (HARDCODED)<br/>isDaemonCliEnabled gate<br/>blocks 'claude daemon list/install/status/etc'<br/>'claude daemon run' BYPASSES<br/>'claude service install' BLOCKED"]:::removed
        daemon_czh["CZH() = serverMapBuilder('[feature-flag]',false)<br/>isAgentsFleetEnabled gate (GrowthBook)<br/>gates --bg/--background/logs/attach/kill/respawn/rm<br/>SERVER-FLIPPABLE without binary release<br/>current cohort: NOT PRESENT → defaults false"]:::gap
        daemon_dispatch_chain["Auto-spawn dispatch chain (fleet-enabled):<br/>claude --bg → mz8() spawnBackgroundFork<br/>→ b3H → J_5 → TN6 → C3H<br/>→ spawn claude daemon run --origin auto"]:::core
        daemon_sparewarm["Sz8() spare-worker pre-warm<br/>useEffect on Agents Fleet component mount<br/>auto-spawns on every session render<br/>(also gated by CZH — component hidden if false)"]:::gap
        daemon_gate["allow_remote_control<br/>managed-policy kill-switch<br/>fail-closed upstream"]:::core
        daemon_fn["Fn() resolver<br/>managedPolicy.remoteControlAtStartup<br/>?? userSettings.remoteControlAtStartup<br/>(project-scope NOT consulted)"]:::core
        daemon_dialog["r74() dialog gate<br/>!remoteDialogSeen && NT() && OAuth<br/>(non-interactive skips dialog)<br/>dialog component i74 — title 'Remote Control'<br/>useEffect: remoteDialogSeen=true on MOUNT"]:::gap
        daemon_spawn["Two install paths<br/>A: spawn-fork claude daemon run<br/>--origin auto (detached .unref())<br/>B: systemd-user / launchd<br/>--origin service; com.anthropic.claude-daemon"]:::core
        daemon_env["K_5() env redact (spawn-fork only)<br/>clears INVOCATION_ID always<br/>strips OAuth token + OAUTH_TOKEN_FILE_DESCRIPTOR<br/>on Linux/Windows if refresh token in keychain<br/>INHERITS both on macOS (#101)"]:::gap
        daemon_worker["LY4() main loop<br/>spawnMode: same-dir | worktree<br/>staleCheckIntervalMs / idleGraceMs"]:::core
        daemon_lock["Single-instance lock<br/>daemon.json + process.kill(pid,0)<br/>ESRCH=proceed, reachable=exit"]:::core
        daemon_persist["[feature-flag]<br/>JG6() binary-target watch<br/>systemd Restart=always RestartSec=1<br/>WantedBy=default.target (autostart)"]:::core
        daemon_zombie["Zombie recovery<br/>[feature-flag]<br/>PID-0 probe + 2s wait + respawn"]:::core
        daemon_sock_dir["Socket root /tmp/cc-daemon-&lt;uid&gt;/&lt;sha256(cfg-dir)[:8]&gt;<br/>_18() uid-ownership check<br/>chmod 0o700 enforced<br/>refuses to bind on foreign-uid dir"]:::core
        daemon_sock_ctl["control.sock — supervisor RPC<br/>15 ops: ping/nudge/lease/dispatch/list/has/kill<br/>reply/subscribe/attach/resize/ensure-spare<br/>permission-response/respawn-stale/await-ack"]:::core
        daemon_sock_rv["rv/&lt;short&gt;.sock — per-worker rendezvous"]:::core
        daemon_sock_pty["pty/&lt;short&gt;.sock — per-worker PTY passthrough"]:::core
        daemon_pipekey["~/.claude/daemon/pipe.key (16-hex)<br/>Windows: embedded in pipe name (auth)<br/>Linux: file created but UNUSED<br/>(fs perms on sock dir = auth)"]:::gap
        daemon_dispatch_schema["dispatch schema Y18<br/>env: Record&lt;string,string&gt; (arbitrary env)<br/>source: shell|slash|fleet|respawn<br/>isolation: none|worktree"]:::gap
        daemon_frame["DCS escape framing<br/>\x1B_cc-detach-msg;...\x1B\\<br/>PTY-compatible IPC"]:::core
    end
    %% ===== S — Harbor MCP Channels (v2.1.121, runtime-confirmed #102 + #104) =====
    subgraph HARBOR["S — Harbor MCP Channels (v2.1.121 #102 + #104 — runtime-confirmed; v126 unchanged)"]
        direction TB
        harbor_gate["kTH() = G$('[feature-flag]',false)<br/>master gate (v126: rotated T$→G$)<br/>current cohort: TRUE"]:::core
        harbor_ledger["hA8() = G$('[feature-flag]',[])<br/>4 entries: discord/telegram/fakechat/imessage<br/>GrowthBook-flippable per cohort"]:::core
        harbor_perms["Rr7() = G$('[feature-flag]',false)<br/>current cohort: TRUE<br/>gates pluginSyncHelper() React hook → channelPermissionCallbacks"]:::core
        harbor_policy["Enterprise policy gate<br/>policySettings.channelsEnabled<br/>+ allowedChannelPlugins allowlist"]:::core
        harbor_dev["CLI flag bypass<br/>--dangerously-load-development-channels"]:::gap
        harbor_cap["MCP server capability<br/>experimental[claude/channel]<br/>+ experimental[claude/channel/permission]<br/>both required for #104"]:::core
        harbor_check["Vw$() gate w/ 7 skip kinds<br/>capability/disabled/auth/policy/<br/>session/marketplace/allowlist"]:::core
        harbor_inj["#102 — channel injection<br/>vw$() wraps content as<br/>&lt;channel source=&quot;...&quot;&gt;...&lt;/channel&gt;<br/>round-12: model-defended<br/>round-13: content-escape weakness"]:::gap
        harbor_authz["#104 — channel permissions<br/>Cr7(toolUseID) → 5-char base-25 ID<br/>tool_name+description+input_preview<br/>round-14c: TUI-mode runtime-confirmed<br/>logged as source.type:'user' (laundered)"]:::gap
        harbor_tui_only["#104 TUI-only constraint<br/>SA8 React provider mounts pluginSyncHelper<br/>--print/SDK paths IMMUNE<br/>(round-14b probe-j confirmed)"]:::core
    end
    %% ===== T — Brief Stop-Hook GrowthBook Injection (v2.1.126 #106 CRITICAL) =====
    subgraph BRIEFINJ["T — Brief Stop-Hook GrowthBook Injection (v2.1.126 #106 CRITICAL)"]
        direction TB
        brief_gate["eZ('[feature-flag]',!1,FI_)<br/>brief-mode entry switch<br/>server-flippable, no user opt-in"]:::core
        brief_text_flag["G$('[feature-flag]','')<br/>byte 117293158 — string-default reader<br/>EMPTY DEFAULT (overrides hardcoded UI_)"]:::gap
        brief_inj["#106 — round-3 mitm-injection<br/>canary 145B → /v1/messages role:'user' verbatim<br/>round-7N empirical: 65,596B reaches verbatim<br/>NO CLIENT-SIDE LENGTH CAP"]:::gap
        brief_no_pin["#106 round-5: no cert pinning<br/>UNABLE_TO_VERIFY_LEAF_SIGNATURE uniform<br/>network-MITM threat realistic"]:::gap
        brief_targeting["per-account targeting<br/>accountUUID + email + organizationUUID<br/>+ subscriptionType + deviceID<br/>POST [config-channel-endpoint]* envelope"]:::core
    end
    %% ===== U — Datadog Third-Party Processor (v2.1.126 #105 High; extends #92) =====
    subgraph DATADOG["U — Datadog Third-Party Processor (v2.1.126 #105 — extends #92)"]
        direction TB
        dd_gate["G$('[feature-flag]',!1)<br/>RMK gate fn CMK()<br/>this account: source:'force', value:true"]:::gap
        dd_endpoint["http-intake.logs.us5.datadoghq.com<br/>[logs-endpoint]<br/>hardcoded byte 111788522<br/>public ingest key BM1=pubea5604...05bc"]:::gap
        dd_allowlist["QM1 allowlist — 110 events<br/>[feature-flag]/init/exit/timer/<br/>api_*/sdk_*/oauth_*/bg_*/daemon_*/<br/>tool_use_*/team_mem_*/voice_*"]:::core
        dd_body["body shape:<br/>ddsource:nodejs, ddtags(23-field dM1),<br/>message, service, hostname, env<br/>+ all event fields verbatim (IMK rename)"]:::gap
        dd_pii["round-7M empirical PII in body:<br/>session_id ×8/8 events<br/>subscription_type ×8/8 (search-indexed)<br/>last_session_id (cross-session correlation)<br/>+ 47 system fingerprint fields"]:::gap
    end
    %% ===== Q — Our Tooling =====
    subgraph OURS["Q — Our Tooling"]
        direction TB
        shingle_capture["shingle-capture (hook)"]:::ours
        shingle_mcp["shingle-mcp (bypasses binary)"]:::ours
        workspace_mcp["workspace-mcp transcript"]:::ours
        mempalace["mempalace-sync"]:::ours
    end
    %% ===== Q1 — Pi-Passport (OAuth-bypass + gate-evasion harness — OUR research tooling) =====
    %% Post-Q3Q4 review (2026-05-10) — 7-reviewer multi-perspective audit + empirical falsification
    subgraph PIPASS["Q1 — Pi-Passport (third-party gate evasion + Claude-Code bypass) [hardened postQ3Q4 2026-05-10]"]
        direction TB
        pp_creds["~/.claude/.credentials.json<br/>OAuth bearer + refreshToken<br/>(stolen-token threat surface)"]:::ours
        pp_refresh["refresh-token.mjs<br/>POST platform.claude.com[oauth-token-endpoint]<br/>client_id 9d1c250a-... (binary's<br/>secondary CLIENT_ID; primary fails)<br/>+S2 randomBytes tmp / +S3 redirect:error<br/>+S4 UUID-validate --client-id"]:::ours
        pp_launcher["evade-pi.sh<br/>+E1 absolute paths for jq/node/pi/timeout<br/>+E1 minimal hardcoded PATH in env-i<br/>+S1 require_uint() before arith<br/>defaults: opus-4-7 / thinking high"]:::ours
        pp_canary["First-call canary<br/>Pi's REAL system blocks<br/>L_N → 400 → bump to L_(N+1)<br/>cap at maxLevel<br/>+R2 refuses initialLevel>maxLevel"]:::ours
        pp_sanitizer["Sanitizer hook (applyEvasion in-place)<br/>before_provider_request<br/>L1: \bpi\b → 'the agent'<br/>L2: docs/.md links<br/>L3: ## /path.md + packages<br/>L4: nuclear (replace block 2)<br/>D1 byte-delta read-back warning"]:::ours
        pp_banner["suppress-banner.mjs<br/>warnings.anthropicExtraUsage=false<br/>(Pi's banner is misleading post-evade)<br/>+R6 preserves source mode 0o600"]:::ours
        pp_anthropic_api["anthropic-api.ts (A8)<br/>Single source for ANTHROPIC_VERSION,<br/>OAUTH_BETA, CANARY_MODEL<br/>+S3 redirect:error default"]:::ours
        pp_runner["classifier/node/runner.mjs<br/>Shared loadOauth/classifyOutcome/<br/>writeFileAtomic + GATE_PATTERN<br/>+R4 user:inference scope check<br/>+R5 single-source GATE_PATTERN"]:::ours
        pp_classifier["Classifier corpus + rule-fallback<br/>41 samples (22 mitm + 19 sensitivity)<br/>gate requires density+structure,<br/>not keyword OR-rule<br/>Path A executed: model.rds deleted,<br/>glm() retired, (?m) regex fixed"]:::ours
        pp_test_suite["54-test suite (was 41)<br/>+9 R7 index handler integration<br/>+4 R2/R5 unit"]:::ours
    end
    %% ===== Q2 — Anthropic Third-Party-App Classifier (third-party-app gate research) =====
    subgraph TPGATE["Q2 — Anthropic Third-Party-App Classifier"]
        direction TB
        tp_input["Inspects system[].text content<br/>(not headers / TLS / SDK identity)"]:::gap
        tp_features["Feature scoring<br/>{pi, docs, .md, packages}<br/>+ density + structural patterns<br/>+ total block size"]:::gap
        tp_verdict["200 = plan-billing<br/>400 = 'extra usage'<br/>cached on identical body"]:::gap
        tp_input --> tp_features --> tp_verdict
    end
    %% ===== V — v128 ShareOnboardingGuide unauth-public share URL (#107 HIGH) =====
    subgraph SHAREONBOARD["V — ShareOnboardingGuide unauth-public share URL (v2.1.128 #107 HIGH; round-3 incognito → CRITICAL contradicted by round-4 scrapling)"]
        direction TB
        share_gate["G$('[feature-flag]',!1)<br/>GrowthBook string-flag (default false)<br/>this account: server-flipped ON"]:::gap
        share_tool["ShareOnboardingGuide tool<br/>model-invocable (no disableModelInvocation)<br/>reads ONBOARDING.md from cwd<br/>64KB file-size cap"]:::gap
        share_endpoint["POST [onboarding-endpoint]<br/>mode:check is NOT idempotent-read<br/>PUT = update; NO DELETE in v128 binary"]:::gap
        share_url["https://claude.ai/claude-code/onboard/{12-char-short-code}<br/>UNAUTH-PUBLIC (round-3 anon-incognito test)<br/>round-4 scrapling no-cookies → /login redirect<br/>severity reverted CRITICAL → HIGH; promotion-gate open"]:::gap
        share_msg_inject["Tool result injects model-directive<br/>(Close with: '...' instruction)<br/>same channel class as brief stop-hook"]:::gap
    end
    %% ===== W — v128 iron_gate sandbox classifier fail-closed → fail-open inversion (#108 CRITICAL via probe-v2 MITM) =====
    subgraph IRONGATE["W — Sandbox classifier fail-closed inversion (v2.1.128 #108 — PROMOTED CRITICAL via probe-v2 MITM 2026-05-06)"]
        direction TB
        iron_classifier["Sandbox network classifier (L48 / p78)<br/>+ auto-mode permission classifier (0x70c79b8)<br/>2 call sites; site-2 wire-confirmed"]:::core
        iron_flag["G$('[feature-flag]',!0)<br/>DEFAULT-TRUE = deny when classifier unavailable<br/>server flip false → ALLOW (fail-open)"]:::gap
        iron_decision["Probe-v2 empirical: literal binary log line<br/>'Auto mode classifier unavailable, falling<br/>back to normal permission handling (fail open)'<br/>fires under documented attack input"]:::gap
        iron_x_neg["Probe-x interactive 5-min TUI session<br/>site-1 NEVER invoked despite all preconditions met<br/>(0 SandboxNetworkAccess classifier requests)"]:::core
    end
    %% ===== X — v128 harbor_prism PR-status path-switcher (#109 Med info) =====
    subgraph HARBORPRISM["X — PR-status path-switcher (v2.1.128 #109 Med info)"]
        direction TB
        prism_flag["G$('[feature-flag]','off')<br/>string-flag (default 'off')<br/>per-account decision-routing"]:::core
        prism_off["OFF path: local `gh pr view --json ...`<br/>ground truth"]:::core
        prism_on["ON path: direct GitHub API/GraphQL fetch from binary<br/>(qV7/Ak_ chain — React-component-only)<br/>requires interactive TUI in PR-context branch<br/>--print mode does NOT trigger"]:::gap
        prism_z_tui["Probe-z-tui: flag-injection PROVEN<br/>via rewrites.jsonl experiment-flip<br/>but canonical /ultrareview path-switcher branch UNRESOLVED<br/>(generic prompts → LLM picks gh pr view regardless)"]:::core
    end
    %% ===== Y — v129 _PROTO_ destructure-rename field-level leak (#110 PROMOTED CRITICAL via probe-r MITM) =====
    subgraph PROTOLEAK["Y — _PROTO_ destructure-rename leak (v2.1.129 #110 — PROMOTED CRITICAL via probe-r MITM 2026-05-06)"]
        direction TB
        proto_emitters["13 active emitters in v129<br/>(plugin install/uninstall/enable/disable/update_command,<br/>plugin_hint_*, plugin_folder_shadowed, plugin_name_collision,<br/>skill_loaded, skill_tool_invocation, slash_command_forked,<br/>input_command)<br/>Each adds _PROTO_plugin_name / _PROTO_skill_name /<br/>_PROTO_marketplace_name to event.additional"]:::gap
        proto_egress["Egress site destructures _PROTO_* into local vars<br/>then re-attaches as TOP-LEVEL event fields:<br/>plugin_name / skill_name / marketplace_name"]:::gap
        proto_endpoint["1P telemetry endpoint:<br/>api.anthropic.com[event-logging-endpoint]<br/>Top-level fields (raw): skill_name, plugin_name,<br/>marketplace_name, device_id, email, auth"]:::gap
        proto_redactor["Sibling redactor jyH() strips remaining _PROTO_*<br/>in residual j object but does NOT block<br/>the destructured raw values explicitly re-attached at egress"]:::core
        proto_wire["Probe-r empirical wire capture:<br/>356 raw skill_name (355 unique)<br/>+ 9 plugin_name (2 unique: caveman, rust-analyzer-lsp)<br/>+ 9 marketplace_name (2 unique: caveman, claude-plugins-official)<br/>on 2 event_logging batches from a single bootstrap"]:::gap
        proto_dormant["_PROTO_code → repl_code slot present at destructure<br/>but no emitter populates it in v123/v126/v128/v129/v131/v132/v138<br/>(forward-compat slot — escalate watch if setter ever added)"]:::core
    end
    %% ===== Z — v138 Forced-Downgrade + AC3 Skip-Persist Bypass (#113 + #114 HIGH) =====
    subgraph FORCED_DG["Z — Forced-Downgrade + AC3 Partial-Defense (v2.1.138 #113 + #114 HIGH)"]
        direction TB
        fd_reader["mo('[feature-flag]',{})<br/>typed eval-SDK reader (object form;<br/>alongside scalar reader J$)"]:::gap
        fd_parse["vP7() returns {maxVersion, forceDowngradeEnabled}<br/>RL6.parse(external semver)<br/>vflagReader() = startup downgrade decision"]:::gap
        fd_canary["Sister: Ek_() reads [feature-flag] semver<br/>same eval-SDK channel<br/>bidirectional version-pin (server controls<br/>both upgrade ceiling AND downgrade floor)"]:::gap
        fd_floor["User mitigation: settings.json<br/>minimumVersion floor via q7H(Z) check<br/>(default undefined; most users vulnerable)"]:::core
        fd_ac3["#114 insertMessageChain: M=null bypass<br/>shouldSkipPersistence chain:<br/>uDH() → tI() OR env [env-flag]<br/>tI() reads Q$.sessionPersistenceDisabled<br/>Trigger: --no-session-persistence (--print only)<br/>+ SDK persistSession:false<br/>+ env [env-flag]"]:::gap
        fd_wrappers["Round-3 SDK wrapper survey:<br/>97 third-party repos use --no-session-persistence<br/>5/7 sampled default UNCONDITIONALLY<br/>(lcm/claudebox/chunkhound/dyad/raptor)<br/>~71% of public ecosystem on bypass-vulnerable path"]:::gap
        fd_reader --> fd_parse --> fd_floor
        fd_canary --> fd_parse
        fd_ac3 --> fd_wrappers
    end
    %% ===== AA — v138 Mid-Conversation System Predicate (#115 — REMEDIATED v2.1.156) =====
    subgraph MIDCONV["AA — Mid-Conversation System Predicate (#115 — REMEDIATED v2.1.156)"]
        direction TB
        mc_env["[env-flag]<br/>(env override path)"]:::gap
        mc_cache["clientDataCache?.[feature-flag]<br/>(cached GrowthBook string)"]:::gap
        mc_live["J$('[feature-flag]','')<br/>(live eval-SDK fallback)"]:::gap
        mc_predicate["hQ$(H) predicate:<br/>extracts conversation $ via C7(H);<br/>if any of 3 sources match $.includes() → true"]:::gap
        mc_betahdr["Caller 1: Wt8 beta-headers assembler<br/>if predicate true → push JB$ beta-header<br/>(API feature gate via eval-SDK string)"]:::gap
        mc_sysprompt["Caller 2: hG system-prompt assembler<br/>predicate result K flows into prompt build path"]:::gap
        mc_env --> mc_predicate
        mc_cache --> mc_predicate
        mc_live --> mc_predicate
        mc_predicate --> mc_betahdr
        mc_predicate --> mc_sysprompt
    end
    %% ===== AB — v138 BYOC Datadog Killswitch (partial #105 remediation) =====
    subgraph BYOC_DD["AB — BYOC Datadog Killswitch (v2.1.138 partial #105 remediation, BYOC subset only)"]
        direction TB
        byoc_predicate["_PK() predicate:<br/>process.env.[env-flag]==='byoc'<br/>&& !EH(env.[env-flag])"]:::core
        byoc_scope["Customer-segment killswitch only<br/>(BYOC contract surface; main consumer<br/>Pro/Max remains exposed when<br/>[feature-flag] server-flipped on)"]:::gap
        byoc_predicate --> byoc_scope
    end
    %% ===== AC — v140 TUI Notification Injection (#127 HIGH — Critical refuted, session-70 byte-test) =====
    subgraph STARTUP_NOTICE["AC — TUI Startup-Notice Injection (v2.1.140 #127 HIGH — Critical refuted session-70: Ink &lt;Text&gt; strips dangerous escapes)"]
        direction TB
        sn_default["Default state on wire:<br/>{value:&#39;&#39;, on:false, off:true, source:&#39;defaultValue&#39;}<br/>(dormant for this account)"]:::baseline
        sn_inject["Server inject via [config-channel-endpoint]&lt;id&gt;:<br/>[feature-flag].value = &lt;attacker payload&gt;"]:::risk
        sn_render["Sole consumer cor() → Ink &lt;Text&gt; (children:t.text)<br/>cell-based screen buffer parses + re-emits<br/>(NOT a raw stdout.write sink)"]:::baseline
        sn_color["color: x1b[31m...x1b[0m → SURVIVES<br/>(chalk re-emits x1b[0m→x1b[39m: parsed, not raw)<br/>residual = styled-text spoofing in trusted banner"]:::gap
        sn_stripped["cursor x1b[9;1H / clipboard x1b]52 / DSR x1b[6n /<br/>OSC8 hyperlink x1b]8;; → ALL STRIPPED<br/>(byte-test session-70, v191 — same path as #155)"]:::baseline
        sn_cap["Width cap ~75 visible chars;<br/>only the surviving color SGR is zero-width"]:::baseline
        sn_markdown["Markdown rendered as literal text<br/>(defensive; no link parsing)"]:::baseline
        sn_default --> sn_inject
        sn_inject --> sn_render
        sn_render --> sn_color
        sn_render --> sn_stripped
        sn_render --> sn_cap
        sn_render --> sn_markdown
    end
    %% ===== AD — Runtime-Probe Harness (sessions 55-59, 2026-05; #113/#127 wire-confirmed) =====
    subgraph PROBESANDBOX["AD — Runtime-Probe Harness (probe-sandbox + PTY automation, sessions 55-59)"]
        direction TB
        ps_compose["tools/probe-sandbox/<br/>two-service docker compose<br/>mitm (mitmdump 12.2.2) + probe (claude-code)<br/>egress forced through mitm:8080 on probenet"]:::ours
        ps_creds["Bearer creds RO-mounted from host<br/>container-local writable copy<br/>TTL gate ≥1h (refuses near-expiry probes)"]:::ours
        ps_addon["MITM addon force-injects GrowthBook<br/>flag values into [config-channel-endpoint]* responses<br/>(get_text/set_text for gzip/zstd round-trip)"]:::ours
        ps_tui["probes/lib/tui-driver.exp<br/>expect-driven PTY keystroke automation<br/>seeds minimal $HOME/.claude.json<br/>walks onboarding past theme picker"]:::ours
        ps_113["#113 probe — inject [feature-flag]<br/>{external:2.1.137, external_force_downgrade:true}<br/>→ [feature-flag] fired<br/>{from:2.1.143, to:2.1.137}; Auto-updating… rendered<br/>WIRE-CONFIRMED v143 + v145"]:::risk
        ps_127["#127 probe — inject [feature-flag]<br/>session-59: bumped Critical on a color-only substring grep<br/>session-70 byte-test (v191): only color survives Ink &lt;Text&gt;<br/>cursor/clipboard/DSR/OSC8 STRIPPED → DEMOTED High"]:::gap
        ps_115["#115 probe — inject [feature-flag]<br/>predicate hQ$() never fires on --print OR TUI<br/>beta-headers byte-identical baseline vs canary<br/>NEGATIVE → informational; REMEDIATED v156:<br/>flag+mechanism removed (fennel_kite 3/3/0) → CLOSED"]:::baseline
        ps_compose --> ps_creds
        ps_creds --> ps_addon
        ps_addon --> ps_tui
        ps_tui --> ps_113
        ps_tui --> ps_127
        ps_tui --> ps_115
    end
    %% ===== AE — v158 Plugins-Sync Headless MCP Register (#140 HIGH; promotion-gate → CRITICAL pending runtime trust-prompt-bypass) =====
    subgraph PLUGINSYNC["AE — Plugins-Sync Headless stdio-MCP Register (v2.1.158 #140 HIGH — no consent prompt in sync caller; asymmetric to skills-sync hooks:void 0)"]
        direction TB
        psync_gate["pluginSyncGate() = CH(process.env.[env-flag])<br/>env-gated, DEFAULT OFF<br/>session init: if(pluginSyncGate()) pluginSyncTrigger()<br/>(NOT GrowthBook server-push)"]:::baseline
        psync_list["EBz()/YT9() desired-state fetch<br/>GET [org-oauth-endpoint]:orgUUID/<br/>plugins/list-plugins?enabled_only=true<br/>auth:'teleport-org' (org admin → member trust path)"]:::gap
        psync_dl["yBz download<br/>GET .../plugins/{name}/download<br/>arraybuffer, maxContentLength kBz<br/>nflagResolverA() name sanitizer + path-traversal reject<br/>512MB cap SBz=536870912<br/>manifest → ~/.claude/plugins/synced/manifest.json"]:::gap
        psync_register["tH() MCP-register (NO consent in caller)<br/>serverMapBuilder() builds server map incl. type==='stdio' (subprocess)<br/>mH(lH,{authoritative:!1,caller:vH}) headless refresh<br/>'Headless MCP refresh: added=N'<br/>timeout LT9 default 10s → plugins_sync_mcp_timeout"]:::risk
        psync_asym["Asymmetry: skills-sync sibling lIz()<br/>hardcodes hooks:void 0 (×2 in v158)<br/>→ synced skills CANNOT auto-register hooks;<br/>plugin leg has NO equivalent suppression"]:::gap
        psync_gate --> psync_list
        psync_list --> psync_dl
        psync_dl --> psync_register
        psync_register --> psync_asym
    end
    %% ===== Plugins-Sync edges (AE, v2.1.158 #140) =====
    startup -. "if(pluginSyncGate()) pluginSyncTrigger()" .-> psync_gate
    psync_register -. "headless mH refresh<br/>{authoritative:!1}" .-> mcp_client
    psync_dl -. "synced plugins" .-> plugin_load

    subgraph COWORKBRIDGE["AF — Cowork/CCR-v2 Remote-Environment Bridge + Two-Stage Classifier (v2.1.160 — no finding; runner-side; watch W1/W2)"]
        direction TB
        cb_gate["Bridge activation (RUNNER-SIDE only)<br/>[env-flag]==='bridge'<br/>|| IS_COWORK || [env-flag]<br/>(cloud env, NOT local CLI)"]:::baseline
        cb_api["Bridge lease/work protocol<br/>POST /v1/environments/...<br/>DELETE /v1/environments/... (deregister)<br/>POST /v1/sessions/...<br/>POST .../work/.../heartbeat (lease_extended)"]:::baseline
        cb_token["Session-ingress auth<br/>[ingress-token] in secrets store (secretsRead)<br/>[env-flag]<br/>[ingress-url] &larr; [config].[base-url-key]<br/>runner token [runner-token-path]"]:::gap
        cb_egress["[egress-gateway] CONNECT proxy (127.0.0.1)<br/>^CONNECT\s+(\S+)\s+HTTP — 405 non-CONNECT<br/>ALLOW/DENY POLICY UNVERIFIED → W2<br/>(169.254 literal = NO_PROXY bypass list,<br/>NOT an SSRF denylist — corrected)"]:::gap
        cb_classifier["Two-stage auto-mode classifier (DEFENSE)<br/>twoStageClassifierGate()=[feature-flag].twoStageClassifier ?? true<br/>stage1+stage2, FAIL-CLOSED<br/>'blocking it for safety' — opposite of #108<br/>+ sub-agent-output 'SECURITY WARNING' surface (W5)"]:::baseline
        cb_watch["Watch W1: server steers permission-classifier<br/>model/staging via [feature-flag].model<br/>+ [feature-flag] (fail-closed today)"]:::gap
        cb_gate --> cb_api
        cb_api --> cb_token
        cb_token --> cb_egress
        cb_gate --> cb_classifier
        cb_classifier --> cb_watch
    end
    subgraph PLUGINCRED["AG — Plugin-Autoupdate Git Credential-Helper Re-enable (v2.1.174 #151 HIGH — server-flippable; local, NOT CCR-gated; #136/#140 family; → W-CREDHELPER)"]
        direction TB
        pc_gate["Background plugin autoupdate pluginAutoupdate()<br/>gated autoUpdaterEnabledGate()=autoUpdaterEnabled() && !FORCE_AUTOUPDATE_PLUGINS<br/>LOCAL auto-updater (NOT REMOTE/bridge/IS_COWORK)<br/>background timer, no user interaction"]:::baseline
        pc_flag["flagReader('[feature-flag]',!1)<br/>GrowthBook server-push, DEFAULT FALSE<br/>[credential-helper-flag]:!_ → default true = SAFE<br/>(git -c credential.helper= suppresses helper)"]:::gap
        pc_flip["SERVER FLIP TRUE → [credential-helper-flag]=false<br/>→ user's git credential helper RUNS during<br/>automatic 'git fetch origin' (marketplaceFetch→gitFetchWrapper→p6)"]:::risk
        pc_host["Marketplace git host scope = arbitrary<br/>Hg6: new URL(H.url).hostname<br/>marketplaceHostValidator blocks ONLY backslash-host (UNC/traversal)<br/>extraKnownMarketplaces = managed/enterprise config"]:::risk
        pc_gate --> pc_flag
        pc_flag --> pc_flip
        pc_flip --> pc_host
    end
    subgraph VELVETGUARD["AH — Read-Before-Edit/Write Guard Skip (v2.1.166 #152 LOW — data-integrity only, no permission reach; → W-VELVET)"]
        direction TB
        vg_flag["flagReader('[feature-flag]',!1) (Edit)<br/>flagReader('[feature-flag]',!1) (Write)<br/>GrowthBook cachedGrowthBookFeatures, DEFAULT FALSE<br/>same channel as #108/#113"]:::gap
        vg_skip["SERVER FLIP TRUE → guardSkipped=true<br/>skips 'File has not been read yet' guard<br/>→ Edit/Write proceeds on un-Read file<br/>(blind-overwrite / stale-content)"]:::gap
        vg_nope["NO permission reach (verified)<br/>not co-located with iron_gate/acceptEdits/canUseTool<br/>data-integrity speed-bump, not a privilege gate"]:::baseline
        vg_flag --> vg_skip
        vg_skip --> vg_nope
    end
    %% ===== AI — v179 Heron-Brook System-Prompt Injection (#154 CRITICAL — W-HERON wire-confirmed) =====
    subgraph HERONBROOK["AI — Heron-Brook System-Prompt Injection (v2.1.179 #154 CRITICAL — server-pushed string reaches /v1/messages system prompt verbatim)"]
        direction TB
        hb_gate["[system-prompt-string-flag] server-push<br/>(GrowthBook eval-SDK response)"]:::gap
        hb_default["Default state: empty string or dormant<br/>no cap on payload size"]:::baseline
        hb_inject["Server inject via [config-channel-endpoint]*:<br/>[system-prompt-string-flag].value = &lt;attacker payload&gt;<br/>reaches /v1/messages system[0].text UNESCAPED"]:::risk
        hb_sink["Messages API system prompt assembly<br/>systemPromptSectionBuilder('[system-prompt-string]',…) dynamic-section builder<br/>#106-class but role:system (not role:user)<br/>W-HERON session-69: marker reached system field verbatim, system_len 27,537; byte-stable v179→v196"]:::core
        hb_gate --> hb_default
        hb_default --> hb_inject
        hb_inject --> hb_sink
    end
    %% ===== AJ — v187 Startup-Announcements ANSI Injection (#155 HIGH — W-ANNOUNCE styled-text spoof) =====
    subgraph STARTUPANNOUNCE["AJ — Startup-Announcements ANSI Injection (v2.1.187 #155 HIGH — server-pushed styled-text, Ink &lt;Text&gt; defends)"]
        direction TB
        sa_gate["[startup-banner-flag] server-push<br/>(GrowthBook eval-SDK response)"]:::gap
        sa_default["Default state: empty or dormant<br/>rendered early in startup"]:::baseline
        sa_inject["Server inject via [config-channel-endpoint]*:<br/>[startup-banner-flag].text = &lt;ANSI payload&gt;"]:::risk
        sa_render["Sole consumer → Ink &lt;Text&gt; (render context)<br/>cell-based screen buffer parses + re-emits<br/>(NOT raw stdout.write sink)"]:::baseline
        sa_stripped["cursor x1b[9;1H / clipboard x1b]52 / DSR x1b[6n /<br/>OSC8 hyperlink x1b]8;; → ALL STRIPPED<br/>(same Ink filtering as #127; W-ANNOUNCE session-69, byte-test v191+)"]:::baseline
        sa_color["color: x1b[31m...x1b[0m → SURVIVES<br/>(chalk re-emits; styled-text spoof only)"]:::gap
        sa_gate --> sa_default
        sa_default --> sa_inject
        sa_inject --> sa_render
        sa_render --> sa_stripped
        sa_render --> sa_color
    end
    %% ===== Cowork/CCR-v2 Bridge edges (AF, v2.1.160) =====
    startup -. "if ENVIRONMENT_KIND=='bridge'" .-> cb_gate
    cb_egress -. "sandbox egress (cloud-side, unverified)" .-> providers
    cb_classifier -. "gates auto-mode tool calls" .-> turn_loop
    %% ===== Plugin-credential / guard-skip edges (AG/AH, v2.1.174/166) =====
    startup -. "background autoupdate timer" .-> pc_gate
    pc_host -. "git fetch → credential helper handoff (W-CREDHELPER)" .-> providers
    turn_loop -. "Edit/Write validateInput" .-> vg_flag
    %% ===== Edges =====
    oauth --> firstparty
    firstparty --> orguuid
    oauth --> providers
    providers -. "BYOC" .-> mtls
    oauth -. "401 refresh" .-> sdkrefresh
    firstparty --> flags
    flags --> envkill
    settings --> flags
    oauth --> startup
    flags --> startup
    settings --> startup
    startup --> model_router
    model_router --> msgs_api
    msgs_api --> turn_loop
    turn_loop --> stream_handler
    turn_loop -. "unverified" .-> hook_checkpoints
    flags -. "date gate + firstParty" .-> identity
    flags -. "[advisor-gate]" .-> advisor_gate
    flags -. "[loop-tool-gate]" .-> sched_tool
    flags -. "mcp-namespace" .-> mcp_client
    flags --> hook_pipeline
    flags -. "[relay-chain-gate]" .-> relay_chain
    flags -. "[powershell-tool-gate]" .-> cobalt_ridge
    flags -. "[opus47-launch-gate]" .-> opus47_launch
    identity --> soul
    soul --> companion_cfg
    companion_cfg --> claudejson
    turn_loop -. "turn-end v<=96" .-> turn_watcher
    turn_watcher --> bi_sender
    bi_sender -- "POST /buddy_react" --> buddy_api
    companion_cfg -. "dead filter" .-> intro_inject
    advisor_gate --> advisor_schema
    advisor_schema -- "tools array" --> msgs_api
    advisor_prompt -- "appended to system" --> msgs_api
    stream_handler -. "[advisor-response-type](advisor)" .-> advisor_tool
    advisor_tool --> advisor_cost
    stream_handler -- "tool_use: ScheduleWakeup" --> sched_tool
    sched_tool --> sched_fn
    sched_fn --> cron_create
    cron_create --> loop_state
    loop_slash --> sched_fn
    loop_state -- "cron fires → new turn" --> turn_loop
    mcp_config --> mcp_client
    mcp_client --> mcp_sandbox
    mcp_client --> mcp_bff
    mcp_client --> mcp_oauth
    mcp_client --> mcp_tools
    mcp_tools --> msgs_api
    hook_config --> hook_pipeline
    turn_loop -- "checkpoint fires" --> hook_pipeline
    hook_pipeline -. "PreToolUse rewrite?" .-> stream_handler
    skill_loader -- "slash resolution" --> turn_loop
    hook_pipeline -. "SessionStart" .-> dream_nightly
    turn_loop -. "atomicity unverified" .-> state_atomicity
    state_atomicity -. "write" .-> claudejson
    sdkrefresh -. "writeback?" .-> credsjson
    transcript_mem -- "hook payload" --> hook_pipeline
    flags -. "[ccr-gate] + surreal_dali" .-> ccr_gate
    ccr_gate --> teleport
    ccr_gate --> bridge
    ccr_gate --> ultrareview
    ccr_gate --> autofix_pr
    teleport -. "workspace bundle" .-> msgs_api
    bridge -- "remote session events" --> stream_handler
    flags -. "[dream-gate]" .-> dream_gate
    dream_gate --> dream_time
    dream_time -- "gates met" --> dream_agent
    dream_agent -- "write" --> dream_files
    startup --> plugin_load
    plugin_mkt --> plugin_load
    plugin_load --> mcp_client
    plugin_load --> skill_loader
    plugin_load --> hook_pipeline
    plugin_hints -. "model hint" .-> stream_handler
    sched_fn --> tel_main
    msgs_api --> tel_main
    mcp_client --> tel_main
    teleport --> tel_ccr
    bridge --> tel_ccr
    ultrareview --> tel_ccr
    autofix_pr --> tel_ccr
    plugin_load --> tel_ext
    dream_agent --> tel_ext
    stream_handler --> tel_ext
    opus47_launch --> tel_v111
    velvet_moth --> tel_v111
    tel_main --> tel_transport
    tel_ccr --> tel_transport
    tel_ext --> tel_transport
    tel_v111 --> tel_transport
    oauth -. "PROXY_URL/HOST" .-> proxy_auth
    proxy_auth -- "auth token" --> msgs_api
    startup -. "SYSTEM_PROMPT_GB_FEATURE" .-> gb_sys_prompt
    gb_sys_prompt -. "override" .-> msgs_api
    relay_chain -. "when ON: strips instructions" .-> startup
    cobalt_ridge -. "Windows only" .-> model_router
    hook_pipeline -- "UserPromptSubmit/Stop" --> shingle_capture
    shingle_capture -- "API replay" --> buddy_api
    shingle_mcp -- "bypass binary" --> buddy_api
    workspace_mcp --> mcp_client
    shingle_capture --> mempalace
    ccr_gate --> remote_trigger
    ccr_gate --> cobalt_lantern
    cobalt_lantern -. "token sync" .-> teleport
    flags -. "[marketplace-autoinstall-gate]" .-> official_marketplace
    official_marketplace --> plugin_load
    flags -. "[agent-stall-gate]" .-> async_stall
    async_stall -. "abort on stall" .-> ma_agents
    flags -. "[ink-flexbox-gate]" .-> tui_fullscreen
    flags -. "[decstbm-gate]" .-> tui_decstbm
    startup --> tui_fullscreen
    tel_team --> tel_transport
    %% ===== Daemon edges (R, v2.1.119) =====
    daemon_qqh -. "blocks manual subcmds<br/>except 'run'" .-> daemon_spawn
    flags -. "[feature-flag]<br/>(GrowthBook)" .-> daemon_czh
    daemon_czh -- "if true: allow --bg" --> daemon_dispatch_chain
    daemon_dispatch_chain --> daemon_spawn
    daemon_czh -- "if true: mount fleet UI" --> daemon_sparewarm
    daemon_sparewarm -. "spare-worker pre-warm" .-> daemon_spawn
    flags -. "allow_remote_control" .-> daemon_gate
    daemon_gate --> daemon_fn
    daemon_fn --> daemon_dialog
    daemon_dialog -- "consent" --> daemon_spawn
    daemon_spawn --> daemon_env
    daemon_env --> daemon_worker
    daemon_worker --> daemon_lock
    daemon_spawn --> daemon_persist
    daemon_spawn --> daemon_zombie
    daemon_worker --> daemon_sock_dir
    daemon_sock_dir --> daemon_sock_ctl
    daemon_sock_dir --> daemon_sock_rv
    daemon_sock_dir --> daemon_sock_pty
    daemon_spawn -. "creates" .-> daemon_pipekey
    daemon_sock_ctl -. "DCS wrap" .-> daemon_frame
    daemon_sock_ctl -. "op: dispatch" .-> daemon_dispatch_schema
    daemon_sock_ctl -- "inbound triggers" --> turn_loop
    remote_trigger -. "outbound create<br/>[feature-flag]" .-> daemon_sock_ctl
    daemon_worker --> tel_ext
    %% ===== Harbor edges (S, v2.1.119 #102) =====
    flags -. "[feature-flag]" .-> harbor_gate
    flags -. "[feature-flag]" .-> harbor_ledger
    flags -. "[feature-flag]" .-> harbor_perms
    harbor_gate --> harbor_cap
    harbor_ledger --> harbor_check
    harbor_check --> harbor_cap
    harbor_perms --> harbor_authz
    harbor_perms --> harbor_tui_only
    harbor_policy -. "team/enterprise override" .-> harbor_cap
    harbor_dev -. "bypass allowlist" .-> harbor_cap
    harbor_cap --> harbor_inj
    harbor_cap --> harbor_authz
    mcp_client -. "experimental capability" .-> harbor_cap
    %% ===== Brief Stop-Hook GrowthBook injection edges (T, v2.1.126 #106) =====
    flags -. "[feature-flag]" .-> brief_gate
    flags -. "[feature-flag]" .-> brief_text_flag
    brief_targeting --> flags
    brief_gate --> brief_text_flag
    brief_text_flag --> brief_inj
    brief_inj --> msgs_api
    brief_no_pin -. "MITM realistic" .-> brief_text_flag
    %% ===== Datadog third-party processor edges (U, v2.1.126 #105) =====
    flags -. "[feature-flag]" .-> dd_gate
    dd_gate --> dd_allowlist
    dd_allowlist --> dd_body
    dd_body --> dd_endpoint
    dd_body --> dd_pii
    %% ===== Pi-Passport edges (V + W, 2026-05-07 #111 hardening) =====
    pp_creds -- "read accessToken" --> pp_launcher
    pp_creds -- "read refreshToken" --> pp_refresh
    pp_refresh -. "atomic write" .-> pp_creds
    pp_launcher -- "exec pi -e ./index.ts" --> pp_canary
    pp_canary --> pp_sanitizer
    pp_sanitizer -- "POST /v1/messages" --> tp_input
    pp_sanitizer -. "OAuth bearer<br/>BYPASSES Claude Code binary" .-> msgs_api
    tp_verdict -. "200 = locked level" .-> pp_canary
    pp_classifier -. "R GLM filter (overfit on N=41)" .-> pp_sanitizer
    pp_banner -. "writes ~/.pi/agent/settings.json" .-> pp_launcher
    %% ===== Runtime-Probe Harness edges (AD, sessions 55-59) =====
    ps_addon -. "rewrites eval-SDK response" .-> flags
    ps_113 -. "wire-confirms" .-> fd_reader
    ps_127 -. "wire-confirms" .-> sn_inject
    ps_115 -. "runtime-negative" .-> mc_predicate

    classDef core fill:#1f2937,stroke:#60a5fa,color:#f8fafc,stroke-width:1px
    classDef gap fill:#3f1d1d,stroke:#f87171,color:#fecaca,stroke-dasharray: 4 3,stroke-width:1px
    classDef removed fill:#1a1a1a,stroke:#6b7280,color:#9ca3af,stroke-dasharray: 2,stroke-width:1px
    classDef ours fill:#1e293b,stroke:#a78bfa,color:#e9d5ff,stroke-width:1px
    classDef baseline fill:#1f2937,stroke:#34d399,color:#d1fae5,stroke-width:1px
    classDef risk fill:#3f1d1d,stroke:#fb7185,color:#fecdd3,stroke-width:2px
```

---

## Cluster Legend

| Cluster | Role | Lifecycle position |
|---|---|---|
| **Startup Spine** | OAuth + provider registry + multi-layer flags + config; gates every subsystem | startup-only |
| **A — Core Runtime** | Runtime, model router, Messages API client, per-turn loop, streaming handler | startup → per-turn |
| **D — Buddy** `[OUTSIDE]` | Identity pipeline + reaction dispatch to a separate endpoint; native UI removed mid-2.1, API lives | startup + per-turn-end |
| **E — Advisor** `[INSIDE]` | Server-side tool inside Messages API; model-initiated consultation to stronger reviewer | per-turn (tool call) |
| **F — Kairos Loop** `[AROUND]` | `ScheduleWakeup` + `/loop`; ends turn, schedules future turn via cron | per-turn + background |
| **G — MCP** | Multi-transport client; per-server OAuth; BFF registry; sandbox allowlist | startup + per-turn |
| **H — Hooks + Skills + Managed Agents** | Extension surface: subprocess hooks, skill loader, nightly memory, Managed Agents API (documented only) | all three phases |
| **I — State** | Persisted config, credentials, backups, in-memory transcript, server-side loop state | all three phases |
| **J — Telemetry** | Fan-in from every subsystem; internal batch endpoint + third-party sink | per-turn + background |
| **K — Our Tooling / Replay** | Hook-subprocess capture, reaction-replay MCP, workspace MCP, cross-session memory sync, workspace UI | per-turn + offline |
| **L — CCR Cloud-Runner** | Teleport + Bridge + sub-surfaces (Ultrareview, Autofix-PR) | on-demand |
| **M — Auto-Dream** | Background memory consolidation scheduler; time + session gates with PID lock | background |
| **N — Plugins** | First-party extension distribution; marketplace + git fallback; six extension types | startup + on-demand |
| **Q1 — Pi-Passport** `[OURS]` | Research tooling: OAuth-bearer driven `/v1/messages` against the Pro/Max billing tier with a sanitiser ladder; multi-perspective audit + hardening 2026-05-10 (#111 disclosure batch) | on-demand |
| **Q2 — Billing-tier classifier** | Server-side gate that inspects `system[].text` content for density + structural patterns; 200 = plan-billing, 400 = extra-usage; cached on identical body | per-request |
| **R–AB — Per-version subsystems / findings** | Background daemon, Harbor MCP channels, and the v119–v138 finding clusters (#102 / #104 / #105 / #106 / #107 / #108 / #109 / #110 / #113 / #114 / #115) | startup + per-turn |
| **AC — TUI startup-notice** | Server-pushed notification string; #127 (Critical refuted — Ink `<Text>` strips the dangerous escape classes; styled-text spoofing only) | startup |
| **AD–AH — Probe harness + v158–v174 findings** | Runtime-probe harness, plugin-sync (#140), Cowork remote bridge, credential-helper re-enable (#151), read-guard skip (#152) | on-demand + per-turn |
| **AI — System-prompt-string injection** | A server-pushed string flag wired verbatim into the system-prompt dynamic-section builder, reaching `/v1/messages` system field (role:system); #154 CRITICAL (wire-confirmed) | per-turn |
| **AJ — Startup-banner styled-text** | A server-pushed schema-validated terminal-string array rendered via Ink `<Text>`; #155 HIGH (dangerous escapes stripped; styled-text spoofing only) | startup |

## Edge-Semantics Legend

| Style | Meaning |
|---|---|
| Solid arrow | Runtime data/control flow verified in source or empirically captured |
| Dashed arrow | Configuration, optional, inferred, or structurally unverified |
| Labeled edge | Semantics matter — endpoint, protocol, or trigger reason shown |
| `core` (blue) | Verified component |
| `gap` (red dashed) | Named but not traced, or structurally unresolved |
| `removed` (grey dashed) | Code removed mid-2.1; included to preserve historical structure |
| `ours` (violet) | Our tooling — replay against surfaces, not first-party |
| `baseline` (green) | Verified-benign or defended component, or a wire-confirmed baseline / dormant state |
| `risk` (red solid) | Confirmed or candidate injection / leak site within a security finding |

## The Three-Direction Figure

The dominant structural pattern in the harness:

- **INSIDE** the per-turn Messages API call → **Advisor** (server-side tool, full context, bidirectional)
- **OUTSIDE** the per-turn loop via a separate endpoint → **Buddy** (read-only observer, truncated context)
- **AROUND** the per-turn loop by ending and re-entering → **Kairos Loop** (self-continuation across turns)

The three side-systems clip onto the same spine (auth → flags → core runtime) but do not compose. They share OAuth + firstParty + org-scoping; otherwise they are wired independently, built by different teams, at different versions. **The harness grows by accretion, not composition.** Every new subsystem mapped across the v2.1.119–v2.1.196 window (background daemon, MCP channels, the server-controlled config-push primitives, the runtime-probe harness, the v179 system-prompt-string injection #154, and the v187 startup-banner styled-text array #155) confirms the pattern at scale: each clips onto the flag spine, and most are gated by a single server-flippable flag.

---

## Finding Status (current — 2026-06-30, session 72)

Several diagram clusters carry live security findings. After the sessions 55–59 runtime-probe campaign, their status — referred to by finding number, with abstract descriptions only:

| Finding | Severity | Status |
|---|---|---|
| #108 — a permission-classifier safety inversion (fail-open) | Critical (remediated) | wire-confirmed (MITM, v129); REMEDIATED upstream v179 — inversion removed from the binary, 0 occurrences v179+ |
| #110 — raw plugin/skill/marketplace identifier field-level egress | Critical | wire-confirmed (MITM, v129; byte-stable through v145) |
| #154 — a server-pushed system-prompt string flag wired verbatim into the dynamic-section builder, reaching `/v1/messages` system field (role:system) | Critical | wire-confirmed (interactive TUI, v179): injected marker reached the system field verbatim; byte-stable v179→v196 |
| #113 — a server-pushed forced-downgrade primitive | High | wire-confirmed (interactive TUI, v143 + v145) |
| #114 — a skip-persistence bypass opening a #31 AC3 partial-defense gap | High | static; a large share of the public SDK-wrapper ecosystem is on the vulnerable path |
| #155 — a server-pushed schema-validated terminal-string array rendered in the startup banner via Ink `<Text>` | High | Critical refuted (byte-test, v191): the same Ink filtering strips the dangerous escape classes; residual = styled-text spoofing in the startup banner |
| #127 — a server-pushed terminal-notification string (styled-text spoofing in the TUI banner) | High | Critical refuted (byte-test, v191): Ink `<Text>` strips cursor / clipboard / DSR / OSC 8; only color survives |
| #107 — a content-sharing tool with an unauth-public share URL | High | static; an earlier incognito test was contradicted by a later scrapling redirect-to-login result |
| #109 — a PR-status path-switcher | Med-info | flag-injection proven; canonical path-switcher branch unresolved |
| #115 — a mid-conversation-system substring predicate | REMEDIATED v2.1.156 (closed) | runtime-negative — the predicate never fired on `--print` or TUI; flag + mechanism removed from the binary in v156 |
| #31 AC3 — subagent ghost-inbox / attribution forgery | Critical | still undefended (through v196) — the v145 skill self-recursion guard is orthogonal; a v176 forged-turn detector is telemetry-only |
| #151 — a server-flippable git-credential-helper re-enable on the background plugin-marketplace auto-update fetch | High | static (v174); locally reachable, not cloud-runner-gated; #136/#140 family; runtime wire-confirm pending |
| #152 — a server-flippable skip of the Edit/Write read-before-write guard | Low | static (v166); data-integrity only, no permission reach |

**The runtime-probe queue (sessions 58–59) is empty;** the v161-177 retro-audit (session 67) re-opened it with two static findings (#151/#152), and the v178–v191 audit (session 69) added #154 (wire-confirmed CRITICAL on an interactive TUI) and #155 (HIGH). The v193–v196 audits (sessions 71–72) produced no new findings and one hardening default-flip; the only open items are functional WATCHes (a default-off, official-marketplaces-only plugin binary-asset provisioning path) rather than findings.

**Original note:** All five `runtime-probe-needed` issues closed across sessions 58–59 using a containerized MITM probe-sandbox plus PTY keystroke automation that drives the interactive TUI past onboarding so TUI-gated code paths can be exercised.

---

## Cross-Version Persistence (v2.1.126 → v2.1.196)

Across 9 binary rebuilds spanning v126–v145, **zero remediations** of any tracked finding were observed; all 21 priority-finding literals are byte-stable v143→v145. Two state-machine improvements landed at v138 but neither addresses a tracked finding. Flag-reader identifiers rotate cosmetically each release — per the methodology rule, cross-version checks use string-pool literals, not minified identifiers.

Extending the window to v2.1.196: the first two remediations of tracked findings landed — #115 at v156 (flag + mechanism removed) and #108 at v179 (the fail-open inversion removed from the binary). Two new findings were added in the v178–v191 window (#154 Critical, #155 High); all other priority-finding anchors remain byte-stable through v196, and v193–v196 added zero findings (v196 carried one hardening default-flip plus a benign, default-off plugin binary-asset provisioning path). The upstream source tag and the bundled runtime have been stable since v181 (v181→v196 are rebuilds of one source tag).

The net direction across the window is **attack surface added, not removed**: new server-flippable subsystems all landed in this window; the only remediation-shaped change covers a customer segment only and leaves the main Pro/Max population exposed.

---

## Documentation Gap (cross-cutting)

Official Claude Code docs are accurate for user-triggered data flows (documented opt-outs exist) but **silent on every server-controlled channel**: the server-to-client config-push channel is entirely undocumented, the forced-downgrade / startup-notice / third-party-sink mechanisms are absent, and identity metadata on default-on metrics is described only by exclusion. The pattern itself is the finding — see `results/docs-gap-analysis-2026-05-20.md`.

---

## Five Structural Findings

Available only from the panoramic view — none of these emerge from reading any single cluster:

1. **The harness grows by accretion, not composition.** The side-systems share OAuth + firstParty + org-scoping and nothing else. Every v119–v196 subsystem clips onto the flag spine independently. The three-direction figure (inside / outside / around) is the predictive shape.

2. **Feature flags are the actual backbone, not the core runtime.** Every subsystem's first inbound edge is from the flag layer. The runtime is what executes; flags decide what exists at all.

3. **Server-flippable single-flag gates are the dominant new-subsystem shape.** Most subsystems mapped across v119–v196 are each gated by one server-controlled flag — activatable per-cohort without a binary release or a release-audit.

4. **Our tooling is a parallel pipeline, not a downstream consumer.** The hook-subprocess capture enters via the extension surface; the reaction-replay MCP bypasses the binary entirely; the runtime-probe harness injects server config responses and drives the TUI to wire-confirm findings the static decode could only hypothesise.

5. **Telemetry is a fan-in with confirmed third-party egress.** Beyond the first-party event-logging endpoint, a third-party processor and the raw-identifier field-level leak are both wire-confirmed to ship raw identity metadata off the first-party boundary.

---

*Tier-2 public redraw. The private source map documents specific function names, flag identifiers, and internal endpoint paths; those have been generalised here to role-level descriptors.*
