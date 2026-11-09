#!/usr/bin/env bash
# Compile the Android sources and run the Kotlin unit tests.
#
# This works in a bare container (including Claude Code remote sessions): it installs the
# Android SDK if it is missing and routes dependency resolution through the Maven Central
# mirror, which is what makes Gradle survive the 429s that shared outbound proxies produce.
#
#   scripts/test-android.sh                      compile + run every unit test
#   scripts/test-android.sh '*PauseEventFilter*'  run one test class
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
export ANDROID_HOME="$ANDROID_SDK_ROOT"

if [[ ! -x "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" ]]; then
  printf '▶ Installing Android SDK into %s (one-off, ~400MB)\n' "$ANDROID_SDK_ROOT"
  scripts/install-android-sdk.sh
fi

# capacitor.settings.gradle points at node_modules/**/android, so the Capacitor plugin
# projects have to be on disk before Gradle can configure the build.
if [[ ! -d node_modules/@capacitor/android ]]; then
  echo "✗ node_modules is missing — run npm ci first." >&2
  exit 1
fi

# :wear-sync is a plain JVM module (`test`, not `testDebugUnitTest`); :app and :wear are
# Android modules. All three in one invocation so Gradle configures the build once.
GRADLE_ARGS=(
  -p android
  --no-daemon
  --init-script "$ROOT_DIR/scripts/gradle-mirror.init.gradle"
  :app:testDebugUnitTest
  :wear:testDebugUnitTest
  :wear-sync:test
)

if [[ -n "${1:-}" ]]; then
  # --tests applies to every test task in the invocation, and a class lives in only one module.
  # The modules set failOnNoMatchingTests false so the other two report zero tests instead of
  # failing the run.
  GRADLE_ARGS+=(--tests "$1")
else
  # The whole run also lints both apps, as CI's staticAnalysis does: every check, warnings are
  # errors (see android/build.gradle). Skipped when asking for one test class.
  GRADLE_ARGS+=(:app:lintDebug :wear:lintDebug)
fi

printf '▶ ./gradlew %s\n' "${GRADLE_ARGS[*]}"
./android/gradlew "${GRADLE_ARGS[@]}"

printf '\n▶ Results\n'
for results_dir in \
    android/app/build/test-results/testDebugUnitTest \
    android/wear/build/test-results/testDebugUnitTest \
    android/wear-sync/build/test-results/test; do
  [[ -d "$results_dir" ]] || continue
  for xml in "$results_dir"/TEST-*.xml; do
    [[ -e "$xml" ]] || continue
    class="$(basename "$xml" .xml)"
    class="${class#TEST-}"
    summary="$(grep -o 'tests="[0-9]*" skipped="[0-9]*" failures="[0-9]*" errors="[0-9]*"' "$xml" | head -1)"
    printf '  %-70s %s\n' "$class" "$summary"
  done
done
printf '\nHTML reports under android/*/build/reports/tests/\n'
