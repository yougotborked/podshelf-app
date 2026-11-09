#!/usr/bin/env bash
# One command that runs every check this repo can verify locally, including inside a bare
# container with no Android tooling preinstalled.
#
#   scripts/verify.sh                 lint, typecheck, i18n, theme, vitest, Kotlin unit tests
#   scripts/verify.sh lint typecheck  just those steps
#   scripts/verify.sh --list          show the available steps
#   scripts/verify.sh all             the default steps plus the debug APK and the R8 check
#
# Steps run to completion even after one fails, so a single run reports everything that is
# wrong rather than just the first thing.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEFAULT_STEPS=(lint typecheck i18n theme unit android)
ALL_STEPS=(lint typecheck i18n theme unit android apk r8)

usage() {
  cat <<'USAGE'
Steps:
  lint       eslint over the Nuxt sources
  typecheck  vue-tsc, compared against scripts/typecheck-baseline.json
  i18n       strings/*.json alphabetization (same rule as the i18n CI workflow)
  theme      no retired or off-palette colour classes (see check-theme-tokens.mjs)
  unit       vitest over the pure logic in composables/
  android    compile the Android sources (warnings are errors), run the Kotlin unit tests,
             and Android lint both apps
  apk        assemble the debug APK (slow; not in the default set)
  r8         run the phone app as R8 ships it against stored data (slow; see check-app-r8.sh)

Aliases: "all" = every step above. No arguments = lint typecheck i18n theme unit android.
USAGE
}

case "${1:-}" in
  --list | --help | -h)
    usage
    exit 0
    ;;
  all)
    STEPS=("${ALL_STEPS[@]}")
    ;;
  '')
    STEPS=("${DEFAULT_STEPS[@]}")
    ;;
  *)
    STEPS=("$@")
    ;;
esac

declare -a RESULTS=()
FAILED=0

run_step() {
  local name="$1"
  shift
  printf '\n\033[1m▶ %s\033[0m\n' "$name"
  local started=$SECONDS
  if "$@"; then
    local elapsed=$((SECONDS - started))
    RESULTS+=("pass ${name} ${elapsed}")
  else
    local elapsed=$((SECONDS - started))
    RESULTS+=("FAIL ${name} ${elapsed}")
    FAILED=1
  fi
}

step_lint() { npm run --silent lint; }
step_typecheck() { node scripts/typecheck.mjs; }
step_i18n() { node scripts/check-i18n-sorted.mjs; }
step_theme() { node scripts/check-theme-tokens.mjs; }
step_unit() { npx vitest run; }
step_android() { scripts/test-android.sh; }
step_r8() { scripts/check-app-r8.sh; }
step_apk() {
  export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
  export ANDROID_HOME="$ANDROID_SDK_ROOT"
  mkdir -p "$HOME/.android"
  [[ -f android/debug.keystore ]] && cp android/debug.keystore "$HOME/.android/debug.keystore"
  ./android/gradlew -p android --no-daemon \
    --init-script "$ROOT_DIR/scripts/gradle-mirror.init.gradle" \
    staticAnalysis assembleDebug
}

for step in "${STEPS[@]}"; do
  case "$step" in
    lint | typecheck | i18n | theme | unit | android | apk | r8) run_step "$step" "step_${step}" ;;
    *)
      echo "Unknown step: $step" >&2
      usage >&2
      exit 2
      ;;
  esac
done

printf '\n\033[1m── Summary ──\033[0m\n'
for row in "${RESULTS[@]}"; do
  read -r status name elapsed <<<"$row"
  if [[ "$status" == pass ]]; then
    printf '  \033[32m✓\033[0m %-12s %ss\n' "$name" "$elapsed"
  else
    printf '  \033[31m✗\033[0m %-12s %ss\n' "$name" "$elapsed"
  fi
done
printf '\n'

exit $FAILED
