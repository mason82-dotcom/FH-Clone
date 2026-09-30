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

declare -A merged_pr_heads=()
while IFS=$'\t' read -r head_repo branch head_sha; do
  if [[ "$head_repo" == "$repo" && -n "$branch" && -n "$head_sha" ]]; then
    merged_pr_heads["$branch|$head_sha"]=1
  fi
done < <(
  gh api --paginate "/repos/$repo/pulls?state=closed&per_page=100&sort=updated&direction=desc" \
    --jq '.[] | select(.merged_at != null) | [.head.repo.full_name, .head.ref, .head.sha] | @tsv'
)

mapfile -t remote_branches < <(
  git for-each-ref \
    --format='%(refname:strip=3)' \
    refs/remotes/origin/ \
    | grep -v '^HEADdeleted=0
eligible=0
skipped_open=0
skipped_unmerged_tip=0

for branch in "${remote_branches[@]}"; do
  [[ "$branch" == "$default_branch" ]] && continue

  if [[ "$branch" == archive/* ]]; then
    echo "KEEP archive: $branch"
    continue
  fi

  if [[ -n "${open_heads[$branch]:-}" ]]; then
    echo "SKIP open-pr: $branch"
    ((skipped_open += 1))
    continue
  fi

  remote_ref="refs/remotes/origin/$branch"
  tip_sha="$(git rev-parse "$remote_ref")"
  merged_key="$branch|$tip_sha"
  safe_reason=""

  # Primary content-loss guard: the complete branch tip is already reachable
  # from main.
  if git merge-base --is-ancestor "$remote_ref" "refs/remotes/origin/$default_branch"; then
    safe_reason="ancestor-of-main"
  # Squash/rebase merges intentionally do not preserve branch ancestry.
  # They are safe to prune only when the current tip exactly equals a head
  # SHA recorded on a merged same-repository PR. Any later branch commit makes
  # this condition false and keeps the branch.
  elif [[ -n "${merged_pr_heads[$merged_key]:-}" ]]; then
    safe_reason="exact-merged-pr-head"
  else
    # Legacy branches can be intentionally archived outside main. The archive
    # ref itself is retained; only branch tips already reachable from such an
    # archive ref are eligible for removal.
    for archive_ref in "${archive_refs[@]}"; do
      if git merge-base --is-ancestor "$remote_ref" "$archive_ref"; then
        safe_reason="preserved-in-${archive_ref#refs/remotes/origin/}"
        break
      fi
    done

    if [[ -z "$safe_reason" ]]; then
      echo "SKIP unmerged-tip: $branch"
      ((skipped_unmerged_tip += 1))
      continue
    fi
  fi

  ((eligible += 1))
  if [[ "$dry_run" == "true" ]]; then
    echo "DRY-RUN delete ($safe_reason): $branch"
    continue
  fi

  echo "DELETE ($safe_reason): $branch"
  gh api --method DELETE "/repos/$repo/git/refs/heads/$branch" >/dev/null
  ((deleted += 1))
done

echo
echo "Repository-Hygiene:"
echo "  eligible=$eligible"
echo "  deleted=$deleted"
echo "  skipped_open=$skipped_open"
echo "  skipped_unmerged_tip=$skipped_unmerged_tip"
 \
    | sort -u
)

mapfile -t archive_refs < <(
  git for-each-ref \
    --format='%(refname)' \
    refs/remotes/origin/archive/
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
  tip_sha="$(git rev-parse "$remote_ref")"
  merged_key="$branch|$tip_sha"
  safe_reason=""

  # Primary content-loss guard: the complete branch tip is already reachable
  # from main.
  if git merge-base --is-ancestor "$remote_ref" "refs/remotes/origin/$default_branch"; then
    safe_reason="ancestor-of-main"
  # Squash/rebase merges intentionally do not preserve branch ancestry.
  # They are safe to prune only when the current tip exactly equals a head
  # SHA recorded on a merged same-repository PR. Any later branch commit makes
  # this condition false and keeps the branch.
  elif [[ -n "${merged_pr_heads[$merged_key]:-}" ]]; then
    safe_reason="exact-merged-pr-head"
  else
    echo "SKIP unmerged-tip: $branch"
    ((skipped_unmerged_tip += 1))
    continue
  fi

  ((eligible += 1))
  if [[ "$dry_run" == "true" ]]; then
    echo "DRY-RUN delete ($safe_reason): $branch"
    continue
  fi

  echo "DELETE ($safe_reason): $branch"
  gh api --method DELETE "/repos/$repo/git/refs/heads/$branch" >/dev/null
  ((deleted += 1))
done

echo
echo "Repository-Hygiene:"
echo "  eligible=$eligible"
echo "  deleted=$deleted"
echo "  skipped_open=$skipped_open"
echo "  skipped_unmerged_tip=$skipped_unmerged_tip"
