#!/usr/bin/env bash
set -euo pipefail

repo="${GITHUB_REPOSITORY:-${FH2_GITHUB_REPOSITORY:-}}"
default_branch="${FH2_DEFAULT_BRANCH:-main}"
dry_run="${FH2_BRANCH_CLEANUP_DRY_RUN:-false}"

if [[ -z "$repo" ]]; then
  echo "FEHLER: GITHUB_REPOSITORY oder FH2_GITHUB_REPOSITORY fehlt." >&2
  exit 2
fi

command -v gh >/dev/null 2>&1 || {
  echo "FEHLER: gh CLI fehlt." >&2
  exit 1
}
command -v git >/dev/null 2>&1 || {
  echo "FEHLER: git fehlt." >&2
  exit 1
}

git fetch --prune origin "+refs/heads/*:refs/remotes/origin/*"

declare -A open_heads=()
while IFS= read -r branch; do
  [[ -n "$branch" ]] && open_heads["$branch"]=1
done < <(
  gh api --paginate "/repos/$repo/pulls?state=open&per_page=100" \
    --jq '.[] | [.head.repo.full_name, .head.ref] | @tsv' \
    | awk -F '\t' -v repo="$repo" '$1 == repo { print $2 }' \
    | sort -u
)

mapfile -t remote_branches < <(
  git for-each-ref \
    --format='%(refname:strip=3)' \
    refs/remotes/origin/ \
    | grep -v '^HEAD$' \
    | sort -u
)

deleted=0
eligible=0
skipped_open=0
skipped_unmerged_tip=0

for branch in "${remote_branches[@]}"; do
  [[ "$branch" == "$default_branch" ]] && continue

  if [[ -n "${open_heads[$branch]:-}" ]]; then
    echo "SKIP open-pr: $branch"
    ((skipped_open += 1))
    continue
  fi

  remote_ref="refs/remotes/origin/$branch"

  # Content-loss guard: every commit reachable from the branch tip must already
  # be reachable from the default branch. Diverged or ahead branches remain.
  if ! git merge-base --is-ancestor "$remote_ref" "refs/remotes/origin/$default_branch"; then
    echo "SKIP unmerged-tip: $branch"
    ((skipped_unmerged_tip += 1))
    continue
  fi

  ((eligible += 1))
  if [[ "$dry_run" == "true" ]]; then
    echo "DRY-RUN delete: $branch"
    continue
  fi

  echo "DELETE fully-merged branch: $branch"
  gh api --method DELETE "/repos/$repo/git/refs/heads/$branch" >/dev/null
  ((deleted += 1))
done

echo
echo "Repository-Hygiene:"
echo "  eligible=$eligible"
echo "  deleted=$deleted"
echo "  skipped_open=$skipped_open"
echo "  skipped_unmerged_tip=$skipped_unmerged_tip"
