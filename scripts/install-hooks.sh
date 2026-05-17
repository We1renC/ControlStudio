#!/usr/bin/env bash
# Install the repo-tracked git hooks under scripts/git-hooks/ by pointing
# core.hooksPath at that directory. Idempotent.
#
# Usage:    bash scripts/install-hooks.sh
# Uninstall: git config --unset core.hooksPath

set -e

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

if [ ! -d scripts/git-hooks ]; then
  echo "[install-hooks] scripts/git-hooks/ not found"
  exit 1
fi

chmod +x scripts/git-hooks/* 2>/dev/null || true

git config core.hooksPath scripts/git-hooks
echo "[install-hooks] core.hooksPath set to scripts/git-hooks"
echo "[install-hooks] active hooks:"
ls -1 scripts/git-hooks/ | sed 's/^/  - /'
echo ""
echo "[install-hooks] verify:math will now run on every 'git push'"
echo "[install-hooks] override per-push with: git push --no-verify"
