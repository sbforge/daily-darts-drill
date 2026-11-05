#!/usr/bin/env bash
# Deletes feature/*, fix/* and docs/* branches that are fully merged into main, here and on GitHub.
# Run it after a stable release (docs/release-process.md). Shows the list first and asks; with --dry-run only lists.
# Nothing that isn't in main is touched: `git branch -d` refuses an unmerged branch anyway.
set -euo pipefail

dry=false
[ "${1:-}" = "--dry-run" ] && dry=true

git fetch --quiet --prune origin
git fetch --quiet origin main
base=origin/main
pattern='^(feature|fix|docs)/'

local_branches=$(git branch --format='%(refname:short)' --merged "$base" | grep -E "$pattern" || true)
remote_branches=$(git branch -r --format='%(refname:short)' --merged "$base" | sed -n 's#^origin/##p' | grep -E "$pattern" || true)

if [ -z "$local_branches$remote_branches" ]; then
  echo "No merged feature, fix or docs branches."
  exit 0
fi

echo "Merged into main:"
[ -n "$local_branches" ] && printf '  local   %s\n' $local_branches
[ -n "$remote_branches" ] && printf '  GitHub  %s\n' $remote_branches
$dry && exit 0

read -r -p "Delete these branches? [y/N] " answer
[ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "Nothing deleted."; exit 0; }

current=$(git branch --show-current)
for b in $local_branches; do
  if [ "$b" = "$current" ]; then echo "skipped $b (checked out)"; continue; fi
  git branch -d "$b"
done
for b in $remote_branches; do
  git push --quiet origin --delete "$b" && echo "deleted origin/$b"
done
# Local copies of tags the release workflow deleted.
git fetch --quiet --prune --prune-tags origin
