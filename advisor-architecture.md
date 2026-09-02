# Claude Code Advisor System — Technical Architecture

**Date**: 2026-04-10 · **Last revised**: 2026-09-02 (session 90, v2.1.258 currency pass)
**Version**: 2.0

> **Version scope:** The advisor tool infrastructure was already **code-complete in v2.1.96** (built 2026-04-03) — coexisting with the full buddy companion system. Both systems scored 75+/75+ in that build. The buddy UI was then removed in v2.1.97 (built 2026-04-08) while the advisor remained. The system prompt was refined in v2.1.98 (built 2026-04-10) and the feature gate bumped. The advisor is dark-launched behind a server-side feature flag and is not yet visible to all users.
>
> **Currency (v2.1.258, sessions 88–90, 2026-09-02):** the advisor surface is **byte-stable on string-pool literals** from v2.1.96 through v2.1.258 — the tool type `advisor_20260301`, the advisor feature gate, the kill-switch environment variable, the advisor telemetry event names, and the system-prompt body (§4) all remain byte-identical to the v2.1.98 extract. The advisor **core surface is unchanged across v2.1.241→v2.1.258**, and the valid advisor model list (`["opus", "sonnet"]`) gained **no new short-name**. The range covers **seventeen release slots from v2.1.242 through v2.1.258, eleven of which were actually published**. Audited coverage now reaches the installed binary, **v2.1.258**, with zero unaudited gaps — and that property is no longer a sentence someone advances by hand: it is **computed**, from a generated per-version coverage table with a failing check, so a released version with no audit document reads as *missing* rather than as covered. Census across the range: default-true gates **76 → 109** (107 boolean + 2 typed, up from 74 boolean) — and the boolean figure was **corrected mid-window**, because a third gate-reader shape (a hoisted name carrying an inline default) was invisible to *two independent instruments* at once, which is the substance of **#200**. Running tally: **15 critical / 51 high / 77 medium / 19 low across 205 repo issues**. Nothing in the range touches the advisor; the notes below are what a reader of this document should know about the surrounding harness. Function-reference §3 names are **minified identifiers that rotate per build** — see the §3 caveat.
>
> - **v2.1.242 — the release the first pass skipped, and the largest new surface in the range.** It grew the binary by +34.9 MB and split the bundle from 11 modules to roughly 1,385. **#195 (HIGH):** a new plugin-contributed hook-module runtime lets a registered handler **substitute** the tool description sent to the model, and prompt-section text, rather than append to it — no delimiter, no attribution, and validation amounting to a type check plus a 32,000-character cap. It sits behind a **default-off internal environment gate that is absent from the served configuration cache**, so the server can arm it. Filed HIGH with the promotion gate stated as **provenance** — whether a server-influenced plugin can carry such a module — rather than shape. That gate was **answered in session 89 and explicitly not cleared**: registration is *not* restricted to locally-installed plugins, but no path lets the server supply a module's **content**, so the server arms the mechanism and the plugin distribution channel supplies the text. **#201 (HIGH)** records that v2.1.251 widened the same surface: one substitution kind rewrites the trailer block appended to every commit message and pull-request body — **the first reach in this family that leaves the machine** — and another replaces whole skill bodies.
> - **#193 (HIGH, method) — why #195 was missed, which is the reusable part.** Every agent chose its targets from the standing anchor table, and that table is a list of the *previous* window's literals; the release's largest new subsystem was therefore invisible to the entire method **by construction**, not by oversight. There is still **no census of the model-context surface as a class**, and that absence is the open item.
> - **v2.1.243–v2.1.246 — zero findings; the window's content is a method result, and two counting traps that had been silently corrupting earlier censuses.** First, the extraction step read 7-bit single-byte literals only, so **every census this project had ever run was blind to the binary's UTF-16 text** — and the bias runs toward **false removals**, which read as remediation. A cached diff asserting 68 removed API endpoints was wrong on 65 of them; the extractor now emits both encodings and the whole cache was re-acquired. Second, a raw occurrence count is source copies **plus one bytecode-constant-pool copy per referencing code block**, and the pool term belongs to the *build*, not to the code — it moves whenever the bundler re-chunks. All **eight** anchor "drops" at v2.1.246 are packaging: none was a remediation, none was even a refactor, and the runtime revision is **not** the predictor. A dedicated tool now makes that split before any claim is drawn. v2.1.244 was never published for this platform.
> - **v2.1.246–v2.1.258 — one escalation of a standing finding, zero new vectors, and an unusually security-positive window.** Twelve release slots, seven published; v2.1.249 and v2.1.253–v2.1.256 never shipped, so anything introduced **and reverted** inside them is invisible and always will be.
> - **#182 escalated from server-flippable to shipped default.** The gate whose premise was "the server *could* flip this on" flipped its **compiled default** at v2.1.248, so that premise is now what ships. The mechanism is unchanged — the cross-session inbound check still trusts a permission-mode field authored by the **sender**, which the binary's own schema concedes is only "as declared by" the sending host. What changed is reach, and the channel **inverts**: the server would now have to push the flag **off** to restore the human-approval hold for a receiver running with permission prompts bypassed.
> - **#206 (HIGH) — of the messages in the cross-session approval family, the one that SETS THE RECEIVER'S PERMISSION MODE is the only one carrying no sender binding at all**, while its siblings all pin the sender identity to the envelope. This **overturned a "verified non-finding"** recorded earlier in the same window — and the evidence that refuted it was already in hand when the wrong conclusion was written, which is the part worth remembering.
> - **#203 (HIGH) — the system prompt is recorded once and reused verbatim** on every later request and on resume, with a corrected relaunch ignored until compaction. This adds no injection path of its own; it **multiplies the lifetime of every injection path this project already tracks**.
> - **#196, #197, #198 and #199 (HIGH), plus #200 and #204 (MEDIUM)** — four further server-pushed-string paths into model context, and two method/scope findings. **#199 is the sharpest shape:** serving its flag TRUE turns an auto-mode consent rule **off**, by excising a named rule from the safety classifier's own instruction text — so a census that reads compiled defaults scores a **consent-removing** control as benign.
> - **#154 upgraded on evidence rather than on severity.** Server-authored prompt text for this finding was found sitting in the local configuration cache **on disk**, verbatim in a live session's system prompt, while **the same text is absent from the current binary** — so the binary cannot be its source. That delivery arm is in routine production use and is cohort-targeted. This is the strongest evidentiary state any finding in the server-push-into-model-context class has reached.
> - **#202 (HIGH) — filed on v2.1.251's tracing fix, re-scoped out of HIGH by adversarial review, then RESTORED in session 90 once the deciding read was actually run.** The review was right that the first evidence was invalid and wrong to expect refutation: the project-scope filter consults its **own** blocklist, which omits the content-logging telemetry family, while the collection that *does* carry those names guards administrator settings tiers on a different path entirely. Scoped as a **stock-machine** finding — on a managed deployment a higher-trust telemetry claim reclaims the destination setting from lower-trust scopes; on an unmanaged one it does not.
> - **Security-positive movement, worth stating because it is rare.** v2.1.251 shipped five upstream fixes, all verified still present at v2.1.258, and v2.1.257 **deletes a bundled path-walking dependency outright**. The resulting drop in path-resolution call sites *reads* like a regression and is the opposite: the replacement primitive is a file-descriptor and handle check rather than path re-resolution, and every defence axis measured grew.
> - **Method rules earned in this range**, all of which change how future counts must be read: a flat occurrence count never proves a default is unchanged; **a default is not a state**, so every census must be diffed against the served configuration cache before severity is assigned; a literal count of zero is evidence of absence from the string pool and **never** proof of absence from the code; a property of the innermost stage of a composed filter is not a property of the filter; and in minified output a negated zero is TRUE, so it marks dead-code-elimination residue rather than an unreachable branch.
>
> **What this means for the advisor.** None of the issues filed in this range rides the advisor. They are plugin-channel, permission-path, telemetry-scope, prompt-lifetime and method findings, and **no advisor marker moved in any of the seventeen release slots**. The advisor prompt remains a **hardcoded in-binary literal with no server-push source**, which is exactly what keeps it out of the server-push-into-model-context class — a class that grew again this range, from #106 / #154 / #165 / #168 to include #195 / #196 / #197 / #198 / #199 / #201. One item bears on how this document should be read rather than on the advisor's own surface: **#203** means that if the advisor gate ever flips, the advisor's appended system-prompt text would inherit the same record-once-and-reuse lifetime as the rest of the system prompt. That inheritance was **not examined for the advisor path specifically and is not claimed either way** — it is noted so a future pass knows to check it.
>
> **Prior currency (v2.1.241, session 87, 2026-08-25):** the advisor surface was **byte-stable on string-pool literals** from v2.1.96 through v2.1.241 — re-verified session 87 across the twenty-four releases from v2.1.218 through v2.1.241: the tool type `advisor_20260301`, the advisor feature gate, the kill-switch environment variable, the advisor telemetry event names, and the system-prompt body (§4) are all byte-identical to the v2.1.98 extract. The advisor **core surface was unchanged across v2.1.217→v2.1.241**, and the valid advisor model list (`["opus", "sonnet"]`) gained **no new short-name**. Audited coverage then ran **v2.1.89 → v2.1.241** — the first move past v2.1.220 — so the "no unaudited gap" property this investigation rests on held again. Census across that range: default-true gates **45 → 76** (74 boolean + 2 typed). Running tally at that pass: **15 critical / 41 high / 68 medium / 18 low across 184 repo issues**. Nothing in the range touches the advisor; the notes below are what a reader of this document should know about the surrounding harness. Function-reference §3 names are **minified identifiers that rotate per build** — see the §3 caveat.
>
> - **v2.1.218 — zero findings, zero regressions, and a *silent* security fix that never reached the public changelog.** A new enforcement guard refuses to register hooks declared in an agent definition's frontmatter when that definition file came from a directory the user never accepted the trust dialog for. The refusal is applied at both the main-thread and the subagent call sites, and the registration routine itself is byte-equivalent — the change lives entirely in the callers. This **narrows #97 / #98 for the untrusted-origin case only**; hooks declared in settings files or contributed by plugins are unaffected, so **#97 / #98 remain open**. Two further hardening items landed in the same window: a memory mass-delete cap that drops an entire delete batch when the missing-locally count exceeds a threshold (its opt-out is read from the operator environment only, never through the server configuration channel), and a tokenizer-faithful asset-injection validator replacing regex script matching. **One near-miss is worth publishing as method:** a decode pass read a settings-source label as meaning "the server-pushed configuration channel", which would have made it a server-to-hook-command-execution CRITICAL — but that label denotes a *command-line* settings source, which is operator-controlled, and filing it as written would have produced a false Critical.
> - **v2.1.219–v2.1.220 — one finding (#171, LOW), zero security regressions, and one correction against ourselves.** The window's real content is v2.1.219 (a memory subsystem with pinned auto-injection, an on-disk keyword index, and organisation/team mounts); v2.1.220 is a near-no-op. **#171:** v2.1.220 is the first release to attach a dated beta header to *both* stages of the auto-mode permission classifier, but the strip-and-retry latch that exists precisely to survive the endpoint rejecting that header is bound to a value that is only ever assigned null — so its guard is unconditionally true and **the retry can never fire**. A server rejection therefore propagates into the fail-closed catch and blocks *every* auto-mode classification for the rest of the session. The direction is fail-**closed**, so this is explicitly *not* an authorization inversion; it is an availability regression on the permission path. This is the one item in the range whose mechanism rhymes with something the advisor does — the advisor also ships a dated beta header (`advisor-tool-2026-03-01`, §5) — so it is worth being precise: the dead latch belongs to the permission classifier's own request path, and every advisor marker (tool type, beta-header constant, gate, telemetry names, prompt body) is byte-stable across this window. Whether the advisor request path carries a latch of its own was not examined and is **not claimed either way**. **Anchor re-baseline:** the server-pushed system-prompt injection finding (#154) moved 7 → 8 occurrences, and the extra occurrence is a new *local* fallback branch injecting a hardcoded default when both server tiers return empty; both server tiers are unchanged, so **#154 remains unremediated** — the higher number is neither a regression nor a fix. Separately, a second finding held a **completely flat occurrence count while its underlying default value tripled** — structurally invisible to a count-based check, and caught only by reading the public changelog. **Correction filed as #172:** an earlier claim that team memory mounts arrive only through an operator environment variable was **wrong**; a second, pre-existing route exists whose returned stores become recall-eligible, so another same-organisation principal's content can be selected into a user's context without that user naming the store. It is still not a text-injection finding — the server selects *which* stores mount, it cannot supply the injected string.
> - **v2.1.221 → v2.1.241 — twenty windows decoded in one pass, ten issues filed (#176–#185).** **The most valuable result is a method gap, not a finding (#185).** Every configuration census this project had ever run read the *default* out of the binary and assigned severity from it. For a server-controlled configuration channel that answers the wrong question — and the client has held the right answer all along, in its own local cache of the values the server actually served. Diffing a census against that cache for the first time showed **17 of the 55 newly-added default-off gates are switched on for this account**, four of them paths that carry externally-authored text into model context. The inverse check was clean: of 76 default-on gates only three are served off, none of them a permission decision. This is now standing procedure, and it **reversed a severity call mid-session** — a finding filed HIGH, downgraded to LOW on the reasoning that it needed a second default-off gate flipped as well, then restored to HIGH when the cache showed both gates already on. The downgrade was right about defaults and wrong about reality.
> - **The same pass also had a scoping error, caught by its own completeness critic.** The planned sweep covered only the 35 newly-added **default-on** gates. That is backwards for this project's threat model: every wire-confirmed finding in the server-push injection lineage (#106 / #154 / #165 / #168) is an empty-or-false default that the server *fills in*, so the permissive state is reached by a push, not by a withhold. The default-off set was then swept properly — 54 of 54 sweep units covered — and under adversarial verification 8 escalations were confirmed, 21 were confirmed but overgraded, and 2 were refuted outright. Two thirds of the escalations were real mechanisms with inflated severity, which is exactly the distribution a verification stage exists to produce.
> - **#176 (HIGH) — a runner applies server-supplied command-line arguments to the child process it spawns through a *denylist*, not an allowlist.** The nine denied entries are all transport plumbing the runner sets for itself, so two security-relevant arguments remain reachable from the server: one that appends server-controlled text to the child's system prompt, and one that moves the child out of permission checking entirely. An honest bound keeps this from being larger than it is — the applier skips empty values and pushes each value as a separate argument, so bare boolean flags cannot be smuggled through. What argues it is unintended rather than by design is an asymmetry inside the same binary: a sibling subsystem consumes an identically-named argument map through a strict *allowlist* with its own telemetry, and that allowlist already existed before the runner shipped, so the newer subsystem chose the weaker of two in-house patterns. One denied entry bisects to a silent addition mid-range, which shows the surface is recognised internally as one to manage.
> - **#181 (HIGH) — a server-controlled, default-off gate converts a mandatory human approval prompt on destructive external-tool calls in automatic mode into a classifier decision.** Walked by hand: with the gate off the approval fallback fires; with it on the fallback is skipped and the call is routed to the automatic-mode classifier instead of to the user. In a remote or headless session there is no human on the other end of that prompt, so the flip is the difference between blocked and executed. It is fail-closed by default and the classifier still runs, so it is not a full inversion — and the served-value cache shows it currently **off** for this account, which is worth stating plainly rather than leaving a reader to assume the worst.
> - **#182 (HIGH) — a server-controlled gate makes a new cross-session message check trust a field the *sender* supplies about itself**, converting a hold-for-human-review into an automatic accept for a receiver running with permission prompts bypassed. This contradicts the subsystem's own in-source contract, which states in as many words that the sender-supplied origin field is forgeable by any process running as the same user and must never be used to key identity.
> - **#177, #178 and #184 (MEDIUM).** **#177:** a server-controlled gate whose off-state removes an identity-binding control and its teardown from a *live* remote-control channel, so a session survives a local sign-out and a different account signing in — graded MEDIUM rather than an inversion because the entire subsystem is new in this range, so turning it off restores the older baseline rather than inverting a standing guarantee. **#178:** a cross-tool permission-response confusion on the control channel, remediated in-range, with a residual that is still live: the new guard returns early when the tool-name field is not a string, so a response omitting the field entirely resolves whatever pending request matches its identifier. **#184:** a fast path that auto-approves writes into verified linked repository worktrees outside the declared working set, skipping the classifier — the only *confirmed* permission widening out of the whole default-off sweep.
> - **#183 (INFORMATIONAL + two LOW) — a new class of local execution.** A remote session can drive shell commands on the user's *local* machine over an outbound socket, with the output returning to the *remote* session's model rather than the local one. The design fact that matters is that this path **bypasses the local permission system entirely** — no per-call permission check, no permission mode, no allow/deny rules, no local pre- or post-tool hooks — substituting the operating-system sandbox instead, whose preconditions fail closed at six checkpoints, two of them guards written specifically against sandbox-escape pivots. It is inert on a stock install behind an explicit command-line action, two default-off server gates, an organisation policy that fails closed, a signed device binding whose server echo the client verifies, and a sandbox opt-in that is off by default. Filed as informational because the substitution is coherent and the gating is genuinely layered — but it belongs in the harness map, because a reviewer who assumes that all local tool execution passes the permission check would now be wrong.
> - **#31 is narrowed, not retired.** The inter-agent attribution-forgery finding gained a real defence in this range: a new inbound gate that fails closed on every ambiguity, keys peer identity on kernel socket credentials rather than on the message payload, and surfaces a *claimed* name separately from a *verified* process identity in a human approval dialog whose text sanitisation was attacked and held. The binary now concedes the finding's core claim in source. It is not retired, for four reasons the source itself concedes: the verified identity **never reaches the model** (the model-visible wrappers carry no such field); the in-process send path calls the delivery primitives directly and is therefore never classified by the gate; the verified identity is absent on some platforms and identifies the connecting process rather than the message author; and process identifiers are recyclable. Any statement that #31 is simply undefended is now **stale** and should not be repeated unqualified.
> - **Three counting traps fired in one session, all the same shape — a zero occurrence count read as novelty.** Names assembled at runtime from fragments never enter the string pool and so read as absent while the code is present; one apparent new subsystem turned out to be a telemetry *spelling* change over a subsystem that already had 172 occurrences in the older build; and a conclusion of ours that a raw-field leak fired on a new trigger was wrong, because the label was new but the underlying code path was not — making it a *retroactive* widening over behaviour the installed base was already running, which reads worse rather than better. The rule earned: **a literal count of zero is evidence of absence from the string pool, never proof of absence from the code**, and a negative case must be checked against the behaviour's own literals rather than against the name of the thing being looked for. This is the counting-discipline sibling of the flat-count trap recorded for v2.1.219–v2.1.220 above.
> - **Recorded as carefully as the findings: a defended vector.** The same runner subsystem behind #176 also ships the first named, logged sanitiser on the server-input channel anywhere in this codebase — it strips privileged operator tool names out of the server-supplied argument map before spawning, with an explicit log line, and the child-environment builders null out the subsystem's secrets so they are not inherited. It is now tracked as a *defence* anchor: an anchor whose **disappearance** is the alarm rather than its presence, which inverts how every other anchor in the set reads.
> - **Native-change attribution is complete for the range.** Five runtime build-revision bumps correspond exactly to the five windows whose native sections moved — no unattributed native change anywhere in twenty windows. The largest of those windows is also the largest *JavaScript* window in the range, which the "largest native change" framing had buried.
>
> **What this means for the advisor.** None of the ten issues filed in this range (#176–#185) rides the advisor — they are permission-path, execution-path, control-channel and method findings, and no advisor marker moved in any of the twenty windows. The advisor prompt remains a **hardcoded in-binary literal with no server-push source**, which is precisely what keeps it out of the server-push-into-model-context class that #106 / #154 / #165 / #168 belong to. The one consequence for this document is in §12: the served-value method behind #185 is now the right instrument for tracking the advisor gate's rollout state, replacing a bespoke per-flag probe.
>
> **Prior currency (v2.1.217, build 2026-07-22):** the advisor surface was **byte-stable on string-pool literals** from v2.1.96 through v2.1.217 — verified session 81: the tool type `advisor_20260301`, the advisor feature gate, the kill-switch environment variable, the advisor telemetry event names, and the system-prompt body (§4) are all byte-identical to the v2.1.98 extract, now across the chain extended through v2.1.215 → v2.1.217. The advisor **core surface was unchanged across v2.1.216→v2.1.217**, and the valid advisor model list (`["opus", "sonnet"]`) gained **no new short-name**. The v216–v217 window was a **pure-JavaScript** window across genuine per-release builds: every compiled native section is byte-identical, the section count is unchanged, the embedded runtime build revision is flat, and there are zero embedded executable blobs in the new strings. The binary grew +3.18 MiB while printable text grew only ~566 KB (17%); the binary-to-strings growth ratios across the two increments are 6.2× and 5.4× — consistent, which is the signature of embedded bytecode scaling with source rather than a hidden payload. The new source splits across roughly eight modest subsystems: no mega-feature, **no new versioned API endpoints, and no new egress hosts**. The window produced **two new findings and ZERO regressions**, and was the most remediation-dense window since v2.1.205. Four notes matter for reading this document, none of which touches the advisor:
>
> - **#168 (CRITICAL, new at v2.1.216) — another server-pushed string reaching model context, but not via the advisor.** A string-typed value on the server-to-client feature-configuration channel, with an **empty default**, is interpolated verbatim into the instruction text of the built-in multiple-choice question tool (the tool Claude Code uses to ask the user to pick between options), and that instruction text ships to the model on `/v1/messages`. Validation is a type check plus a whitespace trim — **no length cap, no schema, no allowlist**. A sibling value serving the same builder is read only inside a model-eligibility gate, whereas this one is read **unconditionally**, so it applies to every account regardless of model or tier. The empty default keeps the mechanism dormant until a server flip, making it invisible both in normal operation and in a static review of shipped behaviour; it **appends to** rather than overrides the base instruction text, which is a mitigation but not a change of class. This is the same primitive family as the earlier server-pushed-string findings (#106, #154, #165) and was filed **HIGH**, then **WIRE-CONFIRMED and promoted to CRITICAL** at session-82 — the injected value arrived in the outbound `/v1/messages` request inside the question tool's own description field, spliced mid-instruction between two paragraphs of the genuine text, while the model-eligibility-gated sibling arrived at its default in the same capture. Suggested remediation: cap the length, constrain the value to a server-side allowlist of known variants (or an enum index) rather than free text, and apply the same eligibility gate the sibling already has. **The advisor prompt is unaffected: it remains a hardcoded in-binary literal with no server-push source.**
> - **#169 (LOW, new at v2.1.217) — the subagent recursion-depth ceiling became a server-pushed integer with no upper bound.** The limit on how deeply subagents may nest stopped being a compiled-in constant; it now resolves as operator environment variable, else a server-pushed integer from the same configuration channel, else a local default, and the validator accepts any integer ≥ 1 with **no upper clamp**. The same accessor additionally decides whether nested workers are handed the spawn capability at all. Two things keep this LOW: it is explicitly **not** a permission or sandbox inversion (no authorization decision changes, only resource breadth), and the shipped posture actually **improved** — the previous release compared against a hardcoded depth of 5 while v2.1.217 defaults to 1, which strictly shrinks the nesting surface the standing subagent-attribution finding (#31) depends on. Anthropic documents both operator overrides in the public changelog (a maximum subagent spawn depth and a maximum concurrent-subagent count, the latter defaulting to 20); the finding is the unbounded **remote** knob, not the default. A candidate third issue was checked and **REFUTED**: the environment branch returns its value without an inline guard, which looked like a malformed value could disable the cap entirely, but the environment-registry entry is a validated positive-integer parser, so a bad value never reaches the comparison. Suggested remediation: clamp the server-pushed value against a compiled-in ceiling.
> - **Two family-name traps were refuted — worth recording as method, and one of them is advisor-adjacent.** Two of this window's new configuration flags share a naming prefix with previously reported findings, and in both cases the shared prefix turned out to be meaningless. One sits in the same naming family as the confirmed server-pushed system-prompt injection (#154), but its call site only selects between **two compiled-in English wordings** of a "this tool is not available" hint — no server-supplied string is involved. The other appeared adjacent to a **model-identifier comparison**, suggesting it might reroute which model serves a request; the adjacency is minifier placement, the declarations and the predicate have separate callers, and **no reader in that block touches model selection, catalog eligibility, or request routing** — so advisor model resolution (§3) is untouched. A third new flag that looked like an auto-mode permission gate turned out to be a telemetry **event name** rather than a feature flag; the auto-mode safety classifier still fails **CLOSED** when unavailable, verified directly.
> - **One candidate was refuted rather than filed, and is carried as a WATCH.** An environment-supplied session-provenance string, when set to a particular value and combined with a server-authored marker, does skip the organization-policy entitlement layer of the gate governing whether dynamic workflow scripts may run. The mechanism is real and new, but **no feature-flag read participates** — the discriminator is a process environment string plus a boolean literal set at one call site — so it is not a server-flippable flag inversion. Local reachability is effectively nil: the marker is set only by the remote-event launch handler, which requires remote transport plus two cloud-runner environment identifiers, then validates a hash- and size-checked artifact pointer, and the script still passes size and control-character filters. The enterprise-strongest layer, the managed-settings disable, is unchanged. Net assessment: the server bypassing its own entitlement layer is a design choice, not an attacker primitive. **Not advisor-related.**
>
> **Remediation shipped by Anthropic this window is unusually dense.** Three of the fixes are sandbox escapes of exactly the shape this investigation probes for: workflow saves and scheduled-task writes following a symlink at the project configuration directory (which could redirect writes outside the project); background-session isolation not canonicalizing symlinked working directories (which could let a session escape its workspace folder); and worktree-isolated subagents redirecting git into the shared checkout via the directory/git-dir command flags or the git directory and work-tree environment variables. Alongside those: Bash command permission checking for compound statements with redirects inside `&&` lists or negations; read-only commands on Windows reaching network paths without a permission prompt; permission validation of commands containing invisible Unicode characters; a stale daemon lockfile that could terminate an unrelated process; and a managed-settings fix so that lower-scope signal-specific overrides can no longer redirect telemetry away from an organization's managed OpenTelemetry exporter endpoint — directly relevant to the standing telemetry findings (#92 / #105).
>
> Census this window, re-derived from the binaries rather than carried forward: default-true gates **43 → 45** (43 boolean + 2 typed), re-derived at **member** level so a swap cannot hide beneath a flat total — the added set is exactly two flags and the removed set is empty. Both additions are benign: one gates local housekeeping of leftover placeholder records for an internal bridge surface, and the other gates whether MCP tool errors throw rather than return as an error object, where the default-TRUE branch is the **stricter** of the two — making the shipped default a small hardening. Neither reaches a permission, sandbox, egress, or credential sink. Server-pushed config-cache keys are **flat at 9 with identical members**. All twelve standing finding anchors are byte-stable across the window, and the memory secret-skip guard remains intact at a flat occurrence count on both the organization-memory and the new session-memory write paths. The then-current binary was **v2.1.217** (npm `latest` = `next` = 217; `stable` advanced v2.1.205 → **v2.1.206**). Function-reference §3 names are **minified identifiers that rotate per build** — see the §3 caveat.
>
> **Prior currency (v2.1.215, build 2026-07-20):** the advisor surface was **byte-stable on string-pool literals** from v2.1.96 through v2.1.215 — verified session 80: the tool type `advisor_20260301`, the advisor feature flag, the kill-switch env var, the advisor telemetry event names, and the system-prompt body (§4) are all byte-identical to the v2.1.98 extract, now across the chain extended through v2.1.213 → v2.1.215. The advisor **core surface is unchanged across v2.1.213→v2.1.215**, and the valid advisor model list (`["opus", "sonnet"]`) gained **no new short-name**. The v213–v215 window was three genuine per-release builds (a distinct application build id each) and produced **ZERO new findings, ZERO regressions, ZERO remediations**; method was a lead-owned factual spine plus a 16-unit decode-and-adversarially-verify fan-out, then two independent contrarian refinement passes on the surviving residuals. Two notes matter for reading this document, neither of which touches the advisor:
>
> - **This was NOT a pure-JavaScript window — the first since v198.** Every native section of the binary moved and one runtime-internal section was dropped. That shift is fully **ATTRIBUTED** to a bundler/runtime **build-revision bump under an unchanged semantic version**: the JavaScript share grew ~1.34 MiB while the binary grew only ~1.09 MiB, because the native side shrank, and no embedded-executable markers appear in the new strings. The distinction is now tracked per window — an ATTRIBUTED native shift (the runtime revision moved) is expected; an UNATTRIBUTED one would be first-party native code and a decode trigger. No advisor marker moved either way.
> - **A standing-finding anchor FELL, and the drop decoded as benign.** Two of the #110 raw-field-egress anchors dropped (10→6 and 13→9) — the shape a remediation takes, so it was decoded rather than welcomed. The cause is a DRY refactor: the prior version's five inline plugin-command telemetry emits were collapsed into one shared helper. All five events still fire with identical payloads and identical per-event counts, so **#110 STANDS, unremediated**; the finding thread records this so a future audit does not misread the lower number as a fix.
>
> Census that window (v213–v215): default-true gates **43, FLAT** (41 boolean + 2 typed), re-derived at **member** level rather than by count alone — a count-stable set can still hide a swap, and the added and removed sets were both empty. Server-pushed config-cache keys **9, flat**; the accessor identifier rotated again and was located by definition body, so the extractor was verified not blind. All other standing anchors are byte-stable and the #108 anchor stays at zero (remediated at v179). Two items are carried as **WATCH, neither filed as a finding** (both survived contrarian refinement as watch-only): (1) **server-selectable system-prompt text variants** — a family of gates whose condition is an OR rather than an AND, so a server flag alone suffices, and one member omits a cautionary clause from tool-use guidance that the prior version rendered unconditionally, making a previously-unconditional guard server-suppressible; it is **not** of the server-push-into-model-context class, because the server contributes only a boolean or a 3-value enum and every rendered sentence is a literal already compiled into the client — no server-authored text reaches model context — and it is watch-only because a fourth family member predates this window and because #106/#154/#165 strictly dominate it (tracked as new low-severity tracker issue **#166**); and (2) **a remote grant auto-resolving a local permission prompt** — default-off, triple-bounded in reach, no durable allow-rule, and the awaited grant is itself a real user action on another first-party surface, so it relocates an approval rather than fabricating one. **Neither WATCH item involves the advisor prompt, the advisor tool schema, or the advisor model list.** Hardening confirmed this window: an environment opt-out that hard-disables all model substitution fail-closed (a flagged message pauses the session rather than silently switching models — note this is *model* substitution generally, not an advisor-specific control), and the full retirement of the morning-brief surface with zero successor, completing a removal begun at v208. Benign new surfaces: a local-only config import command with an unusually defensive apply path (refuses paths escaping the source directory, refuses project-scope writes under a symlink, never overwrites an existing target, does not port hook definitions); organization-memory literals that are **telemetry, not flags**, mirroring server-to-local only with no upload path added; an operator-environment-only first-party cloud provider that no server flag can reach; and an OpenTelemetry content-length control that returns a **minimum**, so it can only shorten emitted content, never lengthen it. The advisor prompt remained a hardcoded in-binary literal with **no server-push source**. The then-current binary was **v2.1.215** (npm `latest` = `next` = 215; `stable` had advanced v2.1.197 → **v2.1.205**). Function-reference §3 names are **minified identifiers that rotate per build** — see the §3 caveat.
>
> **Prior currency (v2.1.212, build 2026-07-17):** the advisor surface was byte-stable on string-pool literals from v2.1.96 through v2.1.212 — verified session 79: the tool type `advisor_20260301`, the advisor feature flag, the kill-switch env var, the advisor telemetry event names, and the system-prompt body (§4) are all byte-identical to the v2.1.98 extract across the v152→v177→v191→v195→v196→v197→v200→v202→v203→v206→v212 chain (sessions 67/69/71/72/73/74/77/78/79). The advisor **core surface is unchanged across v2.1.207→v2.1.212** — the v207–v212 window was six genuine per-release builds (distinct app build id each) whose entire +5.27 MiB delta is compiled application JS confined to the bundle section (readelf-localized; the native-code and read-only-data sections are byte-identical across the installed releases, and no embedded blob appears in any of the six string-pair diffs). None of that work touched the advisor: the one new finding this window — **#165 (HIGH)**, a server-pushed configuration value that can override an official/built-in plugin's model-facing instructions (its server-instructions plus tool/parameter/prompt/skill descriptions) so that the override text lands verbatim in model context — is a new instance of the server-push-into-model-context class (kin to the earlier stop-hook #106 and system-prompt #154 instances) but rides a **plugin channel, not the advisor**. The advisor prompt remains a hardcoded in-binary literal with **no server-push source**. The current binary is v2.1.212 (npm `latest` = 212; `stable` = v2.1.197). Two benign notes carried forward: (1) **v2.1.198 added an advisor-settings passthrough** that carries only the advisor **model choice** (a model id) end-to-end — it does **not** move the advisor prompt or system-context, so there is no finding. (2) v2.1.197 included model-catalog preparation for a future model, but **v2.1.197→v2.1.212 added no new advisor model short-name** — the valid advisor model list (`["opus", "sonnet"]`) is unchanged. Function-reference §3 names are **minified identifiers that rotate per build** — see the §3 caveat. Each v181→v212 binary is a **genuine per-release build** (the app build id changes every release); the bundled runtime is unchanged.
>
> **See also:** `loop-architecture.md` for the Kairos loop system (`ScheduleWakeup` / `/loop`) that landed in v2.1.101 alongside but architecturally independent from the advisor.

---

## 1. System Overview

The Advisor system is a first-party "second opinion" feature in Claude Code v2.1.97+ that allows the executor model (Sonnet or Opus) to consult a stronger reviewer model at decision points during a task. Unlike the buddy companion system — which was a read-only observer with no influence on the conversation — the advisor is a **bidirectional decision gate** with full conversation context access and the ability to redirect the executor's approach.

The advisor operates as a **server-side tool** within the Messages API. When the executor model calls `advisor()`, the entire conversation history (including all tool calls and results) is forwarded to the advisor model, which returns guidance. The executor then resumes with that guidance incorporated.

**Key architectural difference from buddy**: The buddy system was a separate API endpoint (`buddy_react`) called client-side with a truncated transcript. The advisor is a tool type (`advisor_20260301`) within the standard Messages API — no separate endpoint, no client-side API call.

---

## 2. Data Flow Diagram

### 2.1 Advisor Tool Lifecycle

```
User Query
     |
     v
Query Source Gate ---- repl_main_thread* / agent:* / sdk / hook_agent / verification_agent
     |
     v
Advisor Feature Gate ---- kill-switch env var not set
     |                     + firstParty provider + logged in
     |                     + advisor feature gate enabled server-side
     v
Model Validator ---- validates both advisor and base are opus-4-6 or sonnet-4-6
     |
     v
Tool Schema Push ---- S.push({type: "advisor_20260301", name: "advisor", model: D})
     |
     v
Messages API Call ---- tools array includes advisor schema
     |                  + beta header: "advisor-tool-2026-03-01"
     |                  + advisor system prompt appended
     v
Streaming Response
     |
     +--- server-side tool-use response (name="advisor") ---- in-flight flag set, emit advisor tool-call telemetry
     |
     +--- advisor_tool_result ---- in-flight flag cleared
     |    |
     |    +--- advisor_result ---- verbose: full text / non-verbose: checkmark
     |    +--- advisor_redacted_result ---- always checkmark message
     |    +--- advisor_tool_result_error ---- "Advisor unavailable ({error_code})"
     |
     +--- advisor_message ---- iteration-level tracking in response
     |
     v
Cost Tracking
     |
     +--- advisor iteration extractor ---- pull advisor_message items from iterations
     +--- advisor cost calculator ---- compute per-advisor costs
     +--- token counter ---- accumulate tokens by {model, type}
     +--- advisor token-usage telemetry ---- emitted per response
```

### 2.2 Feature Gate Logic

```
advisorGate() {
  if <advisor-disable-env-var> is set ---- return false (kill switch)
  if provider !== "firstParty" ---- return false (no Bedrock/Vertex)
  if !loggedIn() ---- return false (OAuth required)
  return <advisor-feature-gate>.enabled ?? false
}
```

---

## 3. Function Reference

| Role | Notes |
|------|-------|
| Master feature gate | Checks env kill switch, firstParty auth, advisor feature gate |
| Base model validator | Returns true if model string contains `opus-4-6` or `sonnet-4-6` |
| Advisor model validator | Same check as the base validator — only Opus 4.6 and Sonnet 4.6 accepted |
| Combined validator | Validates both models, returns resolved model string or `undefined` |
| Settings reader | Reads persisted `advisorModel` from user settings schema |
| Iteration extractor | Filters response iterations for `advisor_message` type |
| Type guard | Identifies `advisor_tool_result` or the server-side tool-use response with name "advisor" |
| Cost calculator | Processes advisor costs, emits token usage telemetry |
| Token counter | Accumulates tokens by model and type (input/output/cacheRead/cacheCreation) |
| `/advisor` command handler | Sets/clears advisorModel in state and persists to settings |
| Advisor dialog UI | React component for model selection dialog |
| Model matcher | Fuzzy matches user input to valid advisor model from the shorthand array |

### Constants

| Constant | Value | Notes |
|----------|-------|-------|
| Valid model shorthand array | `["opus", "sonnet"]` | Valid advisor model shorthand names |
| Beta header constant | `"advisor-tool-2026-03-01"` | Beta header pushed to API requests |
| Advisor prompt variable | (system prompt) | Full advisor coaching prompt, see Section 4 |

---

## 4. System Prompt (Paraphrased, v2.1.98)

The following is a **paraphrased summary** of the prompt that is appended to system messages when advisor is enabled. The verbatim text is not reproduced here.

The prompt introduces the `advisor` tool, explaining that it forwards the full conversation history automatically (no parameters needed) so the reviewer sees the entire task, every tool invocation, and every result. It instructs the executor to call the advisor **before substantive work** — before writing, before committing to an interpretation, before building on an assumption — while noting that pure orientation work (locating files, fetching sources) does not require a call.

It lists additional call triggers:
- When the executor believes the task is complete, **after** making the deliverable durable (writing the file, saving the result, committing the change), so that a long advisor round-trip cannot cost unsaved work.
- When stuck with recurring errors, a non-converging approach, or results that don't fit.
- When considering a change of approach.

It sets cadence expectations: at least one pre-approach and one pre-completion call on multi-step tasks, and acknowledges that short reactive tasks don't benefit from repeated calls.

It instructs the executor to weight advisor guidance seriously, but to adapt when empirical evidence or primary sources contradict a specific claim. It warns that a passing self-test is not disconfirming evidence if the test doesn't check what the advice checks.

Finally, it handles the conflict case: if retrieved data points one way and the advisor points another, the executor should not silently switch but should surface the conflict in one more advisor call.

### Prompt Evolution (v2.1.97 → v2.1.98)

| Location | v2.1.97 | v2.1.98 | Interpretation |
|----------|---------|---------|----------------|
| Paragraph 1 | "when you call it" | "when you call advisor()" | Explicit function call syntax |
| Paragraph 1 | references "the advisor" | uses pronoun "they" | Humanizing pronoun |
| Paragraph 2 | "before writing code" | "before writing" | Broadened beyond code |
| Paragraph 2 | "reading code" | "fetching a source" | Broadened beyond code |
| Bullet 1 | "stage the change" | "commit the change" | Stronger durability instruction |
| Paragraph 6 | "the code does Y" | "the paper states Y" | Broadened to research tasks |

The direction is clear: **the advisor is being positioned for non-coding tasks** (research, writing, analysis), not just software engineering.

---

## 5. API Protocol

### Tool Schema

The advisor tool is registered in the Messages API `tools` array:

```json
{
  "type": "advisor_20260301",
  "name": "advisor",
  "model": "<resolved-model-id>"
}
```

The tool takes **no parameters**. When the executor model calls `advisor()`, the entire conversation context is forwarded server-side.

### Beta Header

When advisor is enabled, the beta header `advisor-tool-2026-03-01` is pushed to the API request's betas array.

### Response Content Block Types

| Type | Purpose | UI Rendering |
|------|---------|-------------|
| Server-side tool-use response (name: "advisor") | Executor calling the advisor | Sets in-flight flag |
| `advisor_tool_result` | Successful advisor response | Container for result/redacted |
| `advisor_result` | Advisor text content | Verbose: full text / Non-verbose: checkmark |
| `advisor_redacted_result` | Privacy-safe display | Always: "Advisor has reviewed the conversation and will apply the feedback" |
| `advisor_tool_result_error` | Advisor call failure | "Advisor unavailable ({error_code})" |
| `advisor_message` | Iteration-level cost tracking | Not rendered — used for token accounting |

### Error Messages

```
"${model} cannot be used as an advisor. Valid options: opus, sonnet, off"
"${model} is not a valid advisor model"
"${model} does not support the advisor tool."
"Note: the current main model (${model}) does not support the advisor.
 It will activate when you switch to a supported main model."
```

---

## 6. User Interface

### CLI Flag

```
--advisor <model>    Enable the server-side advisor tool with the specified model
                     (alias or full ID)
```

Hidden behind the advisor feature gate — not visible in `--help` until the gate is enabled.

### Slash Command

```
/advisor [opus|sonnet|off]    Configure the Advisor Tool to consult a stronger
                              model for guidance at key moments during a task
```

Registered as a local-jsx command. `isEnabled` and `isHidden` both defer to the advisor feature gate.

### Dialog UI

When `/advisor` is invoked without arguments, a dialog renders with:

1. **Title**: "Advisor Tool"
2. **Description**: "When Claude needs stronger judgment — a complex decision, an ambiguous failure, a problem it's circling without progress — it escalates to the advisor model for guidance, then resumes. The advisor runs server-side and uses additional tokens."
3. **Marketing**: "For certain workloads, pairing Sonnet as the main model with Opus as the advisor gives you near-Opus performance with reduced token usage."
4. **Warning** (conditional): "The current main model ({model}) does not support the advisor."
5. **Options**: Dynamic list from the shorthand array + "No advisor" (off)
6. **Learn more**: Empty string placeholder

Emits an advisor dialog-shown telemetry event on mount.

### Settings Persistence

The selected advisor model is persisted as `advisorModel` in the user settings schema:

```javascript
advisorModel: E.string().optional().describe("Advisor model for the server-side advisor tool.")
```

Read via the settings-reader function.

---

## 7. Telemetry

Five advisor telemetry events fire at distinct points in the lifecycle:

| Event purpose | Trigger | Payload |
|---------------|---------|---------|
| Command invocation | User invokes `/advisor` | Command context |
| Dialog shown | Advisor config dialog renders | Mount event |
| Tool call | Executor calls advisor() | Tool call context |
| Tool interrupted | User aborts during advisor execution | Interruption context |
| Token usage | Advisor response processed | See below |

### Token Usage Payload

```javascript
{
  advisor_model: string,                   // e.g. "claude-opus-4-6"
  input_tokens: number,
  output_tokens: number,
  cache_read_input_tokens: number,         // ?? 0
  cache_creation_input_tokens: number,     // ?? 0
  <per-call-cost-field>: number            // Math.round(cost * 1e6)
}
```

Token accounting is recursive — nested advisor iterations are individually reported.

---

## 8. Kill Switches

| Mechanism | Scope | Effect |
|-----------|-------|--------|
| Advisor-disable environment variable | Client | First check in the advisor gate — disables entire feature |
| Advisor feature gate (server-side) | Server | Server-side rollout gate — advisor gate returns false if disabled |
| `/advisor off` | Session | Clears `advisorModel` in state and settings |

---

## 9. Buddy ↔ Advisor Comparison

| Dimension | Buddy (v2.1.89–v2.1.96) | Advisor (v2.1.97+) |
|-----------|-------------------------|---------------------|
| Architecture | Client-side observer + separate API | Server-side tool in Messages API |
| Direction | Unidirectional (read-only) | Bidirectional (decision gate) |
| Context | Last 12 msgs, 300 chars each | Full conversation history |
| Model | Haiku-class (server-chosen) | Opus or Sonnet (user-specified) |
| Trigger | Automatic (turn, error, test-fail, etc.) | Model-initiated (tool call) |
| UI | ASCII sprite + speech bubble | Inline text or checkmark |
| Cost | Hidden from user | Explicit per-call cost field |
| Identity | Deterministic hash-derived (species, stats, traits) | None (stateless tool) |
| Kill switch | Non-essential-traffic disable env var | Advisor-disable env var |
| Feature gate | Date gate + firstParty + plan tier | firstParty + advisor feature gate |
| Telemetry | Buddy telemetry family (removed) | Advisor telemetry family (5 events) |
| Config key | `companion`, companion mute config key | `advisorModel` |
| Binary API type | Custom endpoint (`buddy_react`) | Messages API tool (`advisor_20260301`) |
| Persistence | name, personality, hatchedAt | advisorModel only |
| Beta header | `oauth-2025-04-20` | `advisor-tool-2026-03-01` |

**No code path connects the two systems.** They share only the substrate of OAuth authentication, firstParty distribution gating, and org-scoped access. The `companion_intro` attachment type survives as a dead filter entry in v2.1.97+.

---

## 10. Version Timeline

```
v2.1.89 (2026-04-01)   Buddy system launched (April Fools positioning)
v2.1.92 (2026-04-02)   Full companion system (analyzed version)
v2.1.96 (2026-04-03)   Last version with complete buddy code
                        Advisor infrastructure ALREADY CODE-COMPLETE:
                          - Companion: FULL (81/100)
                          - Advisor: FULL (75/75)
                          - Both systems coexist in same binary
v2.1.97 (2026-04-08)   Buddy UI surgically removed from binary
                        Advisor infrastructure unchanged:
                          - advisor_20260301 tool type
                          - 5 telemetry events
                          - 5 response types
                          - /advisor slash command
                          - --advisor CLI flag
                          - advisor feature gate (v1)
                        companion_intro survives as ghost attachment type
                        buddy_react API alive server-side
v2.1.98 (2026-04-10)   Advisor prompt refined (code-specific → domain-agnostic)
                        Advisor feature gate bumped to v2
                        Blog post published: claude.com/blog/the-advisor-strategy
                        Google Vertex AI integration added (10 telemetry events)
                        ALL buddy API strings removed (buddy_react, hash salt,
                          companion mute key, hatchedAt = 0 hits)
                        companion_intro ghost survives
v2.1.99                NEVER PUBLISHED — npm registry skips from 2.1.98 to 2.1.100
                        Likely internal-only build or intentionally skipped version
v2.1.100 (2026-04-10)  Advisor code identical to v2.1.98
                        Minor binary size change (-4KB)
v2.1.100 → v2.1.195    Advisor surface BYTE-STABLE on string-pool literals.
                        Every minified identifier has rotated one or more
                        times; no functional change. Catalogued: the Opus
                        default migrated to the Opus 4.7 short-name path
                        (see §3 Model Resolution). The advisor feature flag
                        is still NOT flipped on for this account.
v2.1.196 (2026-06-30)  Re-verified session 72: advisor markers unchanged
                        across the v152→v177→v191→v195→v196 chain, system
                        prompt body byte-identical to v2.1.98.
v2.1.197 (2026-07-01)  Session 73. Model-catalog preparation for a future
                        model; NO new advisor model short-name — valid
                        advisor model list unchanged. Advisor surface
                        byte-stable.
v2.1.198 → v2.1.200    Session 74. Advisor core surface BYTE-STABLE
                        (v197→v200). v2.1.198 added an advisor-settings
                        passthrough carrying ONLY the advisor model choice
                        (a model id) end-to-end — the advisor prompt stays a
                        hardcoded in-binary literal; no server-push of prompt
                        or system-context; benign, no finding. Current binary
                        v2.1.199 (npm latest); coverage through v2.1.200
                        (npm next). Advisor feature flag still NOT flipped on
                        for this account. Genuine per-release builds; bundled
                        runtime unchanged.
v2.1.201 → v2.1.206    Sessions 77–78. Advisor core surface BYTE-STABLE
                        (v200→v206). NO new advisor model short-name; the
                        valid advisor model list is unchanged. The version
                        churn was feature/rebuild work UNRELATED to the
                        advisor: v2.1.202 shipped a diagram-in-Artifacts
                        feature (with its own XSS sanitizer); v2.1.203
                        retired a preview/render engine (~5 MiB pure code
                        shrink, no embedded blob) and left every advisor
                        marker untouched. Then-current binary v2.1.206 (npm
                        latest/next); stable = v2.1.197. Advisor feature flag
                        still NOT flipped on for this account. Genuine
                        per-release builds; bundled runtime unchanged.
v2.1.207 → v2.1.212    Session 79. Advisor core surface BYTE-STABLE
                        (v206→v212). NO new advisor model short-name; the
                        valid advisor model list is unchanged. Six genuine
                        per-release builds (distinct app build id each); the
                        entire +5.27 MiB delta is compiled application JS
                        confined to the bundle section (native-code and
                        read-only-data sections byte-identical, no embedded
                        blob). The window's work was UNRELATED to the advisor
                        — the one new finding (#165 HIGH) is a server-pushed
                        override of an official/built-in plugin's model-facing
                        instructions into model context (a plugin channel, not
                        the advisor; kin to #106/#154). Current binary
                        v2.1.212 (npm latest = 212); stable = v2.1.197.
                        Advisor feature flag still NOT flipped on for this
                        account.
v2.1.213 → v2.1.215    Session 80. Advisor core surface BYTE-STABLE
                        (v212→v215). NO new advisor model short-name; the
                        valid advisor model list is unchanged. Three genuine
                        per-release builds (distinct app build id each);
                        ZERO new findings, ZERO regressions, ZERO
                        remediations. NOT a pure-JS window (first since
                        v198): every native section moved and one
                        runtime-internal section was dropped, fully
                        ATTRIBUTED to a bundler/runtime build-revision bump
                        under an unchanged semantic version (JS share
                        +~1.34 MiB vs binary +~1.09 MiB — the native side
                        shrank; no embedded-executable markers). Two #110
                        raw-field-egress anchors FELL (10->6, 13->9) but
                        decoded as a DRY refactor — five inline
                        plugin-command telemetry emits collapsed into one
                        shared helper, all five still firing with identical
                        payloads and per-event counts — so #110 STANDS,
                        unremediated. Default-true gates 43 FLAT, re-derived
                        at MEMBER level (added and removed sets both empty);
                        server-pushed config-cache keys 9 flat. Two WATCH
                        items, neither a finding and neither advisor-related
                        (server-selectable system-prompt text VARIANTS over
                        in-binary literals -> low-severity tracker #166; a
                        default-off remote grant that auto-resolves a local
                        permission prompt). Current binary v2.1.215 (npm
                        latest = next = 215); stable advanced v2.1.197 ->
                        v2.1.205. Advisor feature flag still NOT flipped on
                        for this account.
v2.1.216 -> v2.1.217   Session 81. Advisor core surface BYTE-STABLE
                        (v215->v217). NO new advisor model short-name; the
                        valid advisor model list is unchanged. Genuine
                        per-release builds and a PURE-JAVASCRIPT window:
                        every native section byte-identical, section count
                        unchanged, embedded runtime build revision flat, no
                        embedded executable blob. Binary +3.18 MiB vs
                        printable text +~566 KB (17%); binary-to-strings
                        growth ratios 6.2x and 5.4x -- consistent, the
                        signature of embedded bytecode scaling with source.
                        New source spread over ~8 modest subsystems; NO new
                        versioned API endpoints and NO new egress hosts.
                        TWO new findings, ZERO regressions, and the most
                        remediation-dense window since v2.1.205 -- neither
                        finding is advisor-related: #168 (CRITICAL, v216) is a
                        server-pushed configuration STRING with an empty
                        default interpolated verbatim into the built-in
                        multiple-choice question tool's instruction text,
                        which ships to the model on /v1/messages (no length
                        cap, no schema/allowlist, read unconditionally where
                        its sibling is model-gated; appends rather than
                        overrides; same class as #106/#154/#165, filed HIGH
                        pending wire confirmation); #169 (LOW, v217) is the
                        subagent recursion-depth ceiling becoming a
                        server-pushed integer with NO upper clamp (not a
                        permission inversion, and the shipped default
                        TIGHTENED from a hardcoded 5 to 1, shrinking the
                        nesting surface #31 depends on). Two family-name
                        traps refuted, one of them advisor-adjacent: a flag
                        sharing the #154 naming family only selects between
                        two compiled-in English wordings of a "tool not
                        available" hint, and a flag adjacent to a
                        model-identifier comparison touches NO model
                        selection, catalog eligibility, or request routing
                        (minifier placement only). A third new flag that
                        looked like an auto-mode permission gate is a
                        telemetry EVENT name; the auto-mode safety
                        classifier still fails CLOSED. Default-true gates
                        43 -> 45, re-derived at MEMBER level (added set
                        exactly two, removed set empty; both benign and one
                        a small hardening); server-pushed config-cache keys
                        9 flat with identical members; all twelve standing
                        anchors byte-stable. One WATCH carried, not filed
                        (an environment-supplied session-provenance string
                        plus a server-authored marker skipping the
                        organization-policy entitlement layer of the
                        dynamic-workflow-script gate -- no flag read
                        participates, local reachability effectively nil).
                        Current binary v2.1.217 (npm latest = next = 217);
                        stable advanced v2.1.205 -> v2.1.206. Advisor
                        feature flag still NOT flipped on for this account.
v2.1.218                Session 83. Advisor core surface BYTE-STABLE
                        (v217->v218). NO new advisor model short-name; the
                        valid advisor model list is unchanged. ZERO findings,
                        ZERO regressions. The window's headline is a SILENT
                        security fix absent from the public changelog: a new
                        enforcement guard refuses to register hooks declared
                        in an agent definition's frontmatter when that
                        definition file came from a directory the user never
                        accepted the trust dialog for, applied at both the
                        main-thread and the subagent call sites (the
                        registration routine itself is byte-equivalent).
                        NARROWS #97/#98 for the untrusted-origin case ONLY --
                        settings-file and plugin hooks are unaffected, so
                        #97/#98 REMAIN OPEN. Also hardening: a memory
                        mass-delete cap whose opt-out is read from the
                        operator environment only, and a tokenizer-faithful
                        asset-injection validator replacing regex script
                        matching. METHOD near-miss: a settings-source label
                        was read as the server-push configuration channel,
                        which would have produced a false CRITICAL -- the
                        label denotes a COMMAND-LINE settings source, which
                        is operator-controlled. Advisor feature flag still
                        NOT flipped on for this account.
v2.1.219 -> v2.1.220    Session 84. Advisor core surface BYTE-STABLE
                        (v218->v220). NO new advisor model short-name; the
                        valid advisor model list is unchanged. ONE finding
                        (#171 LOW), ZERO security regressions. The window's
                        real content is v2.1.219 (memory subsystem: pinned
                        auto-injection, on-disk keyword index, org/team
                        mounts); v2.1.220 is a near-no-op. #171: v2.1.220 is
                        the first release to attach a dated beta header to
                        BOTH stages of the auto-mode permission classifier,
                        but the strip-and-retry latch that exists to survive
                        the endpoint rejecting that header is bound to a
                        value only ever assigned null, so its guard is
                        unconditionally true and the retry can NEVER fire; a
                        server rejection then propagates into the fail-closed
                        catch and blocks EVERY auto-mode classification for
                        the rest of the session. Fail-CLOSED, so explicitly
                        NOT an authorization inversion -- an availability
                        regression on the permission path. The advisor also
                        ships a dated beta header (advisor-tool-2026-03-01),
                        but the dead latch sits on the classifier's own
                        request path and every advisor marker is byte-stable
                        across the window. ANCHOR RE-BASELINE: #154 moved
                        7 -> 8 occurrences, the extra being a new LOCAL
                        fallback branch injecting a hardcoded default when
                        both server tiers return empty; both server tiers
                        unchanged, so #154 REMAINS UNREMEDIATED. A second
                        finding held a FLAT occurrence count while its
                        default TRIPLED -- invisible to a count-based check,
                        caught only by reading the public changelog.
                        CORRECTION #172: an earlier claim that team memory
                        mounts arrive only via an operator environment
                        variable was WRONG; a second, pre-existing route
                        returns stores that become recall-eligible, so
                        another same-org principal's content can be selected
                        into a user's context without that user naming the
                        store (still not text-injection: the server picks
                        WHICH stores mount, it cannot supply the string).
                        Advisor feature flag still NOT flipped on for this
                        account.
v2.1.221 -> v2.1.241    Session 87. Advisor core surface BYTE-STABLE
                        (v220->v241). NO new advisor model short-name; the
                        valid advisor model list is unchanged. Twenty windows
                        decoded in ONE pass; TEN issues filed (#176-#185);
                        coverage moves to v2.1.241, the first move since
                        v2.1.220, restoring the no-unaudited-gap property.
                        The most valuable result is a METHOD GAP, not a
                        finding (#185): every census this project had run
                        read the DEFAULT out of the binary and graded from
                        it, which is the wrong question for a
                        server-controlled channel -- the client has held the
                        right answer all along, in its own local cache of the
                        values the server actually SERVED. First diff of a
                        census against that cache: 17 of 55 newly-added
                        default-off gates are served ON for this account,
                        four of them paths carrying externally-authored text
                        into model context; the inverse check was clean (3 of
                        76 default-on gates served off, none a permission
                        decision). Now standing procedure, and it REVERSED a
                        severity call mid-session. SCOPING ERROR caught by
                        the pass's own completeness critic: the planned sweep
                        covered only the 35 newly-added DEFAULT-ON gates,
                        backwards for this threat model, since every
                        wire-confirmed server-push injection finding
                        (#106/#154/#165/#168) is an empty-or-false default
                        the server FILLS IN; the default-off set was then
                        swept properly (54 of 54 units), verification
                        confirming 8, overgrading 21, refuting 2. Findings,
                        none advisor-related: #176 HIGH (server-supplied
                        child command-line arguments applied through a
                        DENYLIST, leaving reachable one argument that appends
                        server text to the child's system prompt and one that
                        removes the child from permission checking); #181
                        HIGH (a default-off server gate turns a mandatory
                        human approval on destructive external-tool calls in
                        auto mode into a classifier decision; served OFF for
                        this account); #182 HIGH (a server gate makes a new
                        cross-session message check trust a field the SENDER
                        supplies about itself, against the subsystem's own
                        in-source contract); #177/#178/#184 MEDIUM; #183
                        INFORMATIONAL + two LOW (a remote session driving
                        shell commands on the LOCAL machine over an outbound
                        socket, output returning to the REMOTE model,
                        bypassing the local permission system entirely and
                        substituting the OS sandbox; inert on a stock install
                        behind six fail-closed layers). #31 is NARROWED, NOT
                        RETIRED -- a new inbound gate keys peer identity on
                        kernel socket credentials rather than the payload,
                        but the verified identity never reaches the model, so
                        calling #31 simply undefended is now STALE. THREE
                        counting traps fired, all the same shape (a zero
                        occurrence count read as novelty); rule earned: a
                        literal count of zero is evidence of absence from the
                        string pool, NEVER proof of absence from the code. A
                        DEFENDED VECTOR is recorded alongside the findings
                        (the first named, logged sanitiser on the
                        server-input channel in this codebase), tracked as an
                        anchor whose DISAPPEARANCE is the alarm.
                        Native-change attribution COMPLETE: five runtime
                        build-revision bumps map exactly to the five windows
                        whose native sections moved. Default-true gates
                        45 -> 76 (74 boolean + 2 typed); tally 15C/41H/68M/
                        18L across 184 issues. Then-current binary
                        v2.1.241; audited coverage v2.1.89 -> v2.1.241.
                        Advisor feature flag still NOT flipped on for this
                        account (status carried forward from session 81,
                        not re-probed -- see Section 12).
v2.1.242 -> v2.1.246    Sessions 88-89. Advisor core surface BYTE-STABLE
                        (v241->v246). NO new advisor model short-name; the
                        valid advisor model list is unchanged. v2.1.242 is
                        the release the first pass SKIPPED: +34.9 MB and a
                        bundle split from 11 modules to roughly 1,385.
                        #195 (HIGH) -- a new plugin-contributed hook-module
                        runtime lets a registered handler SUBSTITUTE the
                        tool description sent to the model, and
                        prompt-section text, rather than append to it: no
                        delimiter, no attribution, validation amounting to
                        a type check plus a 32,000-character cap. It sits
                        behind a default-off internal environment gate that
                        is ABSENT from the served configuration cache, so
                        the server can arm it. Promotion gate stated as
                        PROVENANCE, answered in session 89 and NOT cleared:
                        registration is not restricted to locally-installed
                        plugins, but no path lets the server supply module
                        CONTENT -- the server arms, the plugin distribution
                        channel supplies. #193 (HIGH, method) is why it was
                        missed, and is the reusable part: every agent chose
                        its targets from the standing anchor table, which
                        is a list of the PREVIOUS window's literals, so the
                        release's largest new subsystem was invisible to
                        the whole method BY CONSTRUCTION; there is still no
                        census of the model-context surface as a class.
                        v2.1.243 -> v2.1.246 produced ZERO findings and the
                        window's content is a METHOD result -- two counting
                        traps that had been silently corrupting earlier
                        censuses. (1) The extraction step read 7-bit
                        single-byte literals only, so every census this
                        project had ever run was blind to the binary's
                        UTF-16 text, biased toward FALSE REMOVALS, which
                        read as remediation: a cached diff asserting 68
                        removed API endpoints was wrong on 65 of them. The
                        extractor now emits both encodings and the whole
                        cache was re-acquired. (2) A raw occurrence count
                        is source copies PLUS one bytecode-constant-pool
                        copy per referencing code block, and the pool term
                        belongs to the BUILD, not the code -- it moves
                        whenever the bundler re-chunks. All EIGHT anchor
                        "drops" at v2.1.246 are packaging: no remediation,
                        not even a refactor, and the runtime revision is
                        NOT the predictor. A dedicated tool now makes that
                        split before any claim is drawn. v2.1.244 was never
                        published for this platform. Advisor feature flag
                        still NOT flipped on for this account (carried
                        forward from session 81, not re-probed -- see
                        Section 12).
v2.1.247 -> v2.1.258    Sessions 89-90. Advisor core surface BYTE-STABLE
                        (v246->v258); decoded as the v2.1.246 -> v2.1.258
                        window. NO new advisor model short-name; the valid
                        advisor model list is unchanged. Twelve release
                        slots, SEVEN published -- v2.1.249 and
                        v2.1.253-v2.1.256 never shipped, so anything
                        introduced AND REVERTED inside them is invisible
                        and always will be. ONE escalation of a standing
                        finding, ZERO new vectors, and an unusually
                        security-positive window. #182 escalated from
                        server-flippable to SHIPPED DEFAULT at v2.1.248:
                        the mechanism is unchanged (the cross-session
                        inbound check still trusts a permission-mode field
                        authored by the SENDER, which the binary's own
                        schema concedes is only "as declared by" the
                        sending host) but the channel INVERTS -- the server
                        would now have to push the flag OFF to restore the
                        human-approval hold for a receiver running with
                        permission prompts bypassed. #206 (HIGH): of the
                        cross-session approval family, the message that
                        SETS THE RECEIVER'S PERMISSION MODE is the only one
                        carrying no sender binding at all, its siblings all
                        pinning the sender identity to the envelope; this
                        overturned a "verified non-finding" recorded
                        earlier in the same window, on evidence already in
                        hand when the wrong conclusion was written. #203
                        (HIGH): the system prompt is recorded once and
                        reused verbatim on every later request and on
                        resume, a corrected relaunch ignored until
                        compaction -- no new injection path, but it
                        MULTIPLIES THE LIFETIME of every injection path
                        this project already tracks. #196/#197/#198/#199
                        (HIGH) and #200/#204 (MEDIUM): four further
                        server-pushed-string paths into model context plus
                        two method/scope findings, #199 the sharpest shape
                        -- serving its flag TRUE turns an auto-mode consent
                        rule OFF by excising a named rule from the safety
                        classifier's own instruction text, so a census that
                        reads compiled defaults scores a CONSENT-REMOVING
                        control as benign. #201 (HIGH): v2.1.251 widened
                        the #195 surface -- one substitution kind rewrites
                        the trailer block appended to every commit message
                        and pull-request body, the FIRST reach in this
                        family that LEAVES THE MACHINE, and another
                        replaces whole skill bodies. #154 UPGRADED ON
                        EVIDENCE, not on severity: server-authored prompt
                        text for it was found in the local configuration
                        cache ON DISK, verbatim in a live session's system
                        prompt, while the same text is ABSENT from the
                        current binary -- so the binary cannot be its
                        source; that delivery arm is in routine production
                        use and is cohort-targeted. #202 (HIGH): filed on
                        v2.1.251's tracing fix, re-scoped out of HIGH by
                        adversarial review, then RESTORED in session 90
                        once the deciding read was actually run -- the
                        project-scope filter consults its OWN blocklist,
                        which omits the content-logging telemetry family,
                        while the collection that does carry those names
                        guards administrator settings tiers on a different
                        path entirely; scoped as a STOCK-MACHINE finding.
                        SECURITY-POSITIVE movement, rare enough to state
                        plainly: v2.1.251 shipped five upstream fixes, all
                        verified still present at v2.1.258, and v2.1.257
                        DELETES a bundled path-walking dependency outright
                        -- the resulting drop in path-resolution call sites
                        reads like a regression and is the opposite, the
                        replacement primitive being a file-descriptor and
                        handle check rather than path re-resolution, with
                        every defence axis measured GROWING. Default-true
                        gates 76 -> 109 (107 boolean + 2 typed, up from 74
                        boolean), the boolean figure CORRECTED MID-WINDOW
                        because a third gate-reader shape was invisible to
                        two independent instruments (#200); tally
                        15C/51H/77M/19L across 205 issues. Current binary
                        v2.1.258 (npm latest = next); audited coverage
                        v2.1.89 -> v2.1.258 with ZERO unaudited gaps --
                        now a COMPUTED property, from a generated
                        per-version coverage table with a failing check,
                        rather than a hand-advanced claim. Advisor feature
                        flag still NOT flipped on for this account (carried
                        forward from session 81, not re-probed -- see
                        Section 12).
```

---

## 11. Blog Post Connection

The [blog post](https://claude.com/blog/the-advisor-strategy) describes the advisor as a new Messages API feature:

- Tool type: `advisor_20260301` with `model` and `max_uses` parameters
- Executor model drives the task; advisor provides guidance without tools or user-facing output
- Cost: advisor tokens bill at advisor model rates
- Performance: Sonnet + Opus advisor = +2.7pp on SWE-bench, -11.9% cost

The blog makes **zero mention** of the buddy/companion/Shingle system. The advisor is presented as entirely new. Binary evidence confirms: no code path connects the two features. However, the timeline is even more revealing than initially understood — **advisor infrastructure was already code-complete in v2.1.96**, the same build that had the full buddy system. Both coexisted. The buddy wasn't removed to make room for the advisor; the advisor was developed in parallel and dark-launched behind a feature flag while the buddy was a visible, active feature.

---

## 12. Runtime Status

The advisor was tracked through GitHub issue #21 ("Advisor empirical capture") and closed via static spec. End-to-end runtime capture of an advisor `tool_call` → `tool_result` round-trip remains **blocked on the feature flag**: the advisor feature flag is not flipped on for this account. A server-controlled config-eval probe confirms the flag's server-side value; until it flips, the advisor tool is never pushed into the Messages API `tools` array for this user, so no live telemetry or wire capture is possible without the `--advisor` CLI flag (also gated by the advisor feature gate).

This is **the opposite posture from the Kairos loop**, where the dynamic-loop gate resolves DEFAULT-TRUE and dynamic loops fire empirically in-session (see `loop-architecture.md` §12).

### Documentation status

Unlike the server-controlled config-push, forced-downgrade, and third-party telemetry primitives catalogued in the documentation-gap analysis — all of which are server-controlled channels the official documentation does not describe — the advisor is a **user-triggered surface that the official docs do cover** (via the `--advisor` flag and `/advisor` slash command once rolled out). When the advisor feature flag flips, the advisor becomes a visible, user-controllable feature with a documented opt-out (`/advisor off`, the kill-switch env var). It is therefore *not* part of the disclosure-asymmetry finding; the advisor doc-gap is small and closes on rollout.

**Doc-gap analysis refreshed 2026-07-20 (session 80)** against the official Claude Code documentation corpus (170 pages), replacing the 2026-05-20 assessment. **The asymmetry narrowed but did not close.** Three prior gaps closed outright: the server-to-client feature-flag channel is now **named on the record as Anthropic's feature-flag service, with a documented opt-out environment variable**; the teleport flag is now fully documented; and the pre-tool-use hook's input-**rewrite** surface is documented in detail. What did not move: across all 170 pages there is still **nothing** describing a server-pushed string that reaches the model's context or system prompt (#106 / #154 / #165), a server-pushed notice rendered in the terminal (#127 / #155), or a server-initiated version **downgrade** (#113) — and the Anthropic-bound operational metrics channel is still described only by what it excludes, never by the identity metadata it carries (#92 / #110). Notably, the docs now make **affirmative security claims in two places where this repo holds contrary evidence** (background marketplace refresh disabling git credential helpers, and a teammate's relayed approval being treated as untrusted), which strengthens rather than weakens the disclosure posture for #151 and #31. **None of these movements touch the advisor**, whose documentation posture is unchanged: covered on rollout, opt-out documented, not part of the asymmetry.

**Session 81 (v2.1.216–v2.1.217) update.** The undocumented-server-pushed-string gap **widened rather than closed**: #168 joins #106 / #154 / #165 as a fourth instance of a server-pushed string reaching the model's context — this one through the built-in multiple-choice question tool's instruction text — and the official documentation still describes no such channel. #169 is the counter-case and is noted for balance: both operator-side overrides of the subagent nesting limit **are** documented in the public changelog; only the server-pushed knob behind them is not. The advisor's own documentation posture is again **unchanged** — the advisor prompt is still a hardcoded in-binary literal with no server-push source, so none of the widening applies to it.

**Session 87 (v2.1.218–v2.1.241) update.** Two things changed in how this section should be read.

*First, the instrument improved.* Until this range, the claim "the advisor gate is not flipped on for this account" rested on a bespoke server-side config-eval probe run one gate at a time. Session 87 established that the client keeps its own local cache of the values the server actually **served**, and that diffing a binary-derived census against that cache is a far better instrument (#185) — no network round-trip, and it covers every gate at once rather than one at a time. Applied to the gates newly added in this range it showed **17 of 55 default-off gates served ON** for this account and only **3 of 76 default-on gates served OFF**, which is the empirical case for never reading a compiled-in default as a statement of posture. Two honest qualifications belong here. The advisor gate is **not among the gates newly added in this range**, so that diff does not itself re-confirm it; and the standing status — **advisor gate not flipped on for this account** — is therefore **carried forward from session 81 rather than re-probed**, with nothing observed in v2.1.218–v2.1.241 to indicate a flip. Re-running the served-value diff against the advisor gate specifically is the obvious next step and has not yet been done.

*Second, the undocumented-server-pushed-string gap did not close.* #106 / #154 / #165 / #168 all still stand. #154 in particular was re-baselined 7 → 8 occurrences in this range, but the added occurrence is a **local** fallback branch and both server tiers are unchanged, so it is unremediated rather than fixed. The range also added a further server-controlled path by which server-supplied text can be appended to a spawned child session's system prompt (#176), and the official documentation still describes no such channel. **The advisor's documentation posture is unchanged for the third consecutive currency pass**: the prompt is a hardcoded in-binary literal with no server-push source, the surface is user-triggered and doc-covered on rollout, and the opt-out is documented — so none of the widening applies to it.

**Sessions 88–90 (v2.1.242–v2.1.258) update.** Three things, in order of how much they change this section.

*The undocumented-server-pushed-string gap widened again, and in a new direction.* Until this range every instance in the class **appended** to text the client had compiled in. **#195** and **#201** introduce a plugin-contributed hook-module runtime whose registered handlers **substitute** the tool description sent to the model, prompt-section text, and — at v2.1.251 — whole skill bodies, with no delimiter, no attribution, and validation amounting to a type check plus a 32,000-character cap. One of #201's substitution kinds rewrites the trailer block appended to every commit message and pull-request body, which is **the first reach in this family that leaves the machine**. Alongside them, **#196 / #197 / #198 / #199** add four further server-pushed-string paths into model context; #199 is the one to remember, because serving its flag TRUE **removes** a named consent rule from the auto-mode safety classifier's own instruction text. And **#154 moved from inference to observation**: server-authored prompt text for it was found sitting in the local configuration cache on disk, verbatim in a live session's system prompt, while the same text is absent from the current binary — so the binary cannot be its source, and that delivery arm is in routine, cohort-targeted production use. Across all of it the official documentation still describes no such channel.

*#203 changes the shape of every one of those.* The system prompt is recorded once and reused verbatim on every later request and on resume, with a corrected relaunch ignored until compaction. It adds no injection path; it multiplies the **lifetime** of each one already tracked. For this document the consequence is conditional and worth writing down before it can be forgotten: if the advisor gate ever flips, the advisor's appended system-prompt text would inherit that same record-once-and-reuse lifetime. That was **not examined for the advisor path specifically** and is not claimed either way.

*The advisor's own status did not move — and neither did the instrument.* The served-value diff against the advisor gate specifically, named as the obvious next step in the session-87 note above, has **still not been run**. The standing status — **advisor gate not flipped on for this account** — is therefore still carried forward from session 81, as it was at session 87, with nothing observed across v2.1.242–v2.1.258 to indicate a flip. What did improve is the bookkeeping around it: audited coverage reaching the installed binary with zero unaudited gaps is now a **computed** property, generated from a per-version coverage table with a failing check, so a released version with no audit document can no longer be silently read as covered. **The advisor's documentation posture is unchanged for the fourth consecutive currency pass**: hardcoded in-binary prompt, no server-push source, user-triggered surface, documented opt-out — so none of the widening above applies to it.

### Redaction tooling (session 80)

The publish-time enforcer behind this mirror was rebuilt in session 80: it was inverted from a hand-enumerated list of known-sensitive tokens to a **scan-and-subtract** design, extracting every internal-shaped identifier from the mirror and subtracting everything the official documentation publishes, so a newly-invented internal name is caught on day one rather than whenever someone remembers to add it to a list. The governing rule is explicit — a name published in the official docs is not sensitive and is used verbatim. The publish-time redactors additionally **fail closed**, aborting the build rather than emitting an identifier no mapping table happens to cover. The change immediately caught a class of leak the enumerated list had structurally never looked for.

---

*Investigation conducted 2026-04-10; revised 2026-09-02 (session 90). Binary analysis on v2.1.96, v2.1.97, v2.1.98, v2.1.100; currency re-verified against v2.1.258 (current binary v2.1.258, npm `latest` = `next`; audited coverage v2.1.89 → v2.1.258 with no unaudited gap — now a computed property from a generated per-version coverage table with a failing check, not a hand-advanced claim). System prompt paraphrased from v2.1.98 (verbatim text withheld) and confirmed byte-identical through v2.1.258. Advisor confirmed code-complete in v2.1.96 (coexisting with full buddy system — both scored FULL). Feature-gate status: advisor gate still not rolled out to this account as of session 90 — still carried forward from session 81 rather than re-probed, as it was at session 87 (see §12). buddy_react API confirmed alive (200 OK, 1331ms latency) at original investigation. Companion config intact in `~/.claude/.claude.json`.*
