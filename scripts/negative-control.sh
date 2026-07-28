#!/usr/bin/env bash
# Prove that scripts/verify-package.sh can actually go red.
#
# A packaging check that cannot fail is worse than no check, because it is read
# as evidence. So this deliberately breaks the INSTALLED package in two ways
# that mirror defects this project really shipped, and asserts the verification
# notices each one:
#
#   missing-lib-file  a packaging rule that leaves out a module the generator
#                     requires at runtime. Source tree green, every consumer
#                     dead on the first `prisma generate`.
#   clobber-edits     the pre-0.2.0 behaviour: the reconciler stops seeing what
#                     is already on disk, so hand-written methods are destroyed
#                     on every regeneration.
#
# A mode counts as proven only when the sabotaged run:
#   1. exits non-zero,
#   2. never prints ALL CHECKS PASSED,
#   3. fails for the expected reason rather than because the sabotage itself
#      failed to apply, and
#   4. left the damage visible in the consumer project.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${1:-$(mktemp -d)}"
case "$BASE" in /*) ;; *) BASE="$PWD/$BASE" ;; esac
# Holds one throwaway consumer project and one log per mode. verify-package.sh
# wipes each per-mode subdirectory itself, so this only has to exist.
mkdir -p "$BASE"

say() { printf '\n########## %s ##########\n' "$1"; }
fail() { printf '\nNEGATIVE CONTROL FAILED: %s\n' "$1" >&2; exit 1; }

# Runs the verification with one mode of sabotage and returns its exit status
# instead of aborting, so the assertions below can inspect the outcome.
run_broken() {
  local mode="$1" work="$2" log="$3" status=0
  say "sabotage: $mode"
  SABOTAGE="$mode" "$ROOT/scripts/verify-package.sh" "$work" >"$log" 2>&1 || status=$?
  echo "verify-package.sh exited $status"
  tail -20 "$log"
  return "$status"
}

assert_broken_run() {
  local mode="$1" status="$2" log="$3"
  test "$status" -ne 0 \
    || fail "$mode: verify-package.sh passed with a deliberately broken package"
  if grep -q 'ALL CHECKS PASSED' "$log"; then
    fail "$mode: the run reported success despite the sabotage"
  fi
  if grep -q 'sabotage did not apply' "$log"; then
    fail "$mode: the sabotage never applied, so nothing was proven; the SABOTAGE mode needs updating"
  fi
  return 0
}

# ---------------------------------------------------------------------------
WORK="$BASE/missing-lib-file"
LOG="$BASE/missing-lib-file.log"
STATUS=0
run_broken missing-lib-file "$WORK" "$LOG" || STATUS=$?
assert_broken_run missing-lib-file "$STATUS" "$LOG"
grep -q "Cannot find module" "$LOG" \
  || fail "missing-lib-file: expected the generator to die loading a missing module; got: $(tail -5 "$LOG")"
# Not "no files were emitted": under Prisma 6, @prisma/client's postinstall runs
# `prisma generate` during `npm install`, which is before the sabotage, so
# pristine scaffolds legitimately exist by now. What has to be true is that the
# sabotaged run itself never got the generator to complete.
test -f "$WORK/generate-1.log" \
  || fail "missing-lib-file: the run never reached the generate step"
if grep -q "Generated Prisma Custom Models Generator" "$WORK/generate-1.log"; then
  fail "missing-lib-file: the generator completed even though a module it requires was deleted"
fi
echo "OK: an incompletely packaged generator fails the check."

# ---------------------------------------------------------------------------
WORK="$BASE/clobber-edits"
LOG="$BASE/clobber-edits.log"
STATUS=0
run_broken clobber-edits "$WORK" "$LOG" || STATUS=$?
assert_broken_run clobber-edits "$STATUS" "$LOG"
grep -q 'FAIL: generator did not report preserving the edit' "$LOG" \
  || fail "clobber-edits: expected the preservation assertion to trip; got: $(tail -5 "$LOG")"
test -f "$WORK/src/models/Users.ts" \
  || fail "clobber-edits: Users.ts is missing, so the run failed somewhere unrelated"
if grep -q 'HAND_WRITTEN_SENTINEL' "$WORK/src/models/Users.ts"; then
  fail "clobber-edits: the hand-written code survived, so the sabotage did not do what it claims"
fi
echo "OK: a generator that destroys hand-written code fails the check."

say "NEGATIVE CONTROL PASSED: both sabotaged packages were rejected"
