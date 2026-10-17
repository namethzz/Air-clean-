---
id: 1
title: "find-skills reports 'No skills found' when the registry host is unreachable"
status: open
type: open-source
skill: [find-skills]
proposes_skill: []
target_file: []
siblings_checked: "none — find-skills belongs to no family in this project (no skill-families.md yet)"
area: "Step 3: Search for Skills / When No Skills Are Found"
date: 2026-10-17
session_context: "Installing and activating project skills in a cloud session with a restricted network policy"
parked_until:
resolved:
resolution:
reference:
commands_verified: "run: npx -y skills find react -> 'No skills found for \"react\"'; run: curl https://skills.sh/api/search?q=react -> CONNECT tunnel failed, 403 (egress proxy rejected skills.sh:443)"
---

**Issue:** In a cloud container whose egress proxy does not allow
`skills.sh`, `npx skills find react` printed `No skills found for "react"`
and exited normally. The CLI turned a refused connection into an empty
result. Following the skill as written, the agent would go to "When No
Skills Are Found" and tell the user that no React skill exists, which is
false.

**Suggested improvement:** In Step 3, add a sanity check: if a broad,
common query (e.g. `react`) returns nothing, treat the search as broken,
not empty. Probe the registry host once (or read the CLI's stderr / proxy
log) and tell the user the host may be blocked, naming it. "When No Skills
Are Found" should only apply after a query known to have results has
returned some.

**Principle:** An empty result from a network-backed search is a claim
about the tool until a query that must have results comes back non-empty.
Check reachability before reporting absence.
