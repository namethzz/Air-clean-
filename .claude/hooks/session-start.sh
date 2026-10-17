#!/bin/bash
# SessionStart hook: remind the session to activate task-observer and report
# the observation log's review state. Read-only apart from creating the
# workspace skeleton when it is missing.
root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
d="$root/skill-observations"
mkdir -p "$d/observation-log/archive" 2>/dev/null
[ -e "$d/last-review-date.txt" ] || printf 'never\n' > "$d/last-review-date.txt" 2>/dev/null

open=$(find "$d/observation-log" -maxdepth 1 -name '*.md' -exec grep -l '^status: open' {} + 2>/dev/null | wc -l | tr -d ' ')
last=$(head -1 "$d/last-review-date.txt" 2>/dev/null || echo never)

msg="Project skills: task-observer, ui-ux-pro-max, stop-slop, find-skills (see CLAUDE.md). Invoke the task-observer skill and run its Session Start Protocol before the first tool call. Workspace root: $root. Observation files are created only by $root/.claude/skills/task-observer/scripts/new-observation.sh. Commit skill-observations/ with your work before the session ends."
if [ "${open:-0}" -gt 0 ]; then
  msg="$msg $open open observations; last review: $last."
  cutoff=$(date -d '7 days ago' +%F 2>/dev/null || date -v-7d +%F)
  case "$last" in
    (never) msg="$msg Offer the review." ;;
    (*) [ "$(printf '%s\n%s\n' "$last" "$cutoff" | sort | head -1)" = "$last" ] && msg="$msg Offer the review." ;;
  esac
fi
msg=$(printf '%s' "$msg" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$msg"
