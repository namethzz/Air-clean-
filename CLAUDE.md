# AirClean — Claude instructions

Project skills live in `.claude/skills/`: `task-observer`, `ui-ux-pro-max`,
`stop-slop`, `find-skills`. The SessionStart hook in `.claude/settings.json`
reminds every session of the rules below.

## When to use each skill

- **task-observer**: every session. See the activation block below.
- **ui-ux-pro-max**: before designing, building, reviewing or fixing any UI in
  `frontend/` (pages, components, layout, colour, typography, accessibility).
  Its search script runs locally:
  `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system`
- **stop-slop**: before writing prose that ships: README, docs, UI copy,
  commit messages and PR descriptions.
- **find-skills**: when the user asks whether a skill exists for a task, or a
  task looks like it needs a capability no installed skill covers. It uses
  `npx skills find <query>`, which needs the host `skills.sh` in the cloud
  environment's network allowlist. If the search fails or returns nothing
  for an obvious query, say the host may be blocked; do not invent results.

## task-observer activation

Before the first tool call of any session — and before writing or proposing
a plan, not merely before executing one — invoke the task-observer skill AND
execute its Session Start Protocol (storage check, frontmatter scan, review
trigger). Loading the skill and running the protocol are separate steps; a
session that loads the file and stops has activated nothing. Any turn that
will involve a tool call counts; do not classify the session as "too simple"
from its opening message.

Select skills on the DECISION the request is about, not on the artefact it
arrived as.

After completing each task, list the observation records written this
session in the same turn and report a one-line summary from that listing
(ids and titles, or "none logged and why") — never from memory.

Loading a skill is not complete until you have queried the observation log
for OPEN observations naming it and read their bodies. The lookup and its
checkpoint line are one command, emitted in the same batch as the Skill
invocation:

    bash "$CLAUDE_PROJECT_DIR/.claude/skills/task-observer/scripts/skill-load.sh" "$CLAUDE_PROJECT_DIR" <skill-name>

Apply their insights to the current work. Editing the skill file, or writing
the rule into any other file a later session reads, is acting on the
observation and waits for the review.

The task-observer workspace for this project is the repository root
(`$CLAUDE_PROJECT_DIR`, in cloud sessions `/home/user/Air-clean-`):

    <repo root>/skill-observations/observation-log/   (the log)
    <repo root>/skill-observations/cross-cutting-principles.md
    <repo root>/skill-updates/                        (staging root)
    <repo root>/skill-updates/PENDING.md              (staging manifest)

Always pass the absolute repo root to the scripts, never a relative path.
These skills exist only in this project, so a per-project workspace is
correct.

An observation file comes into being only through

    bash "$CLAUDE_PROJECT_DIR/.claude/skills/task-observer/scripts/new-observation.sh" <slug> "$CLAUDE_PROJECT_DIR"

which prints the path to write into. Never copy another file's header or
count a listing.

A subagent dispatched by a session that already runs this protocol does not
run it again and does not write to the log; it reports findings to the
controller, which writes them.

### Keeping observations across cloud sessions

Cloud containers are discarded when a session ends. Observations survive
only once committed and pushed:

- Commit new or changed files under `skill-observations/` and
  `skill-updates/` together with the session's work, on the session's
  branch, before ending the session.
- They reach later sessions once that branch is merged into `main`.
- Never run `git clean`, `git reset --hard` or `git checkout -- .` with
  `skill-observations/` in scope; commit the log instead of reverting it.
