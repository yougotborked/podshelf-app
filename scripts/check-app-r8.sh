#!/usr/bin/env bash
# Runs the phone app as R8 ships it, against the data the current app has already stored.
#
#   scripts/check-app-r8.sh
#
# R8's keep rules can only be judged by running what R8 produced: a class reached by name and
# renamed fails at runtime, never at build time. The phone app has two places where that would
# hurt someone:
#
#   - Paper stores each object's class and field names on disk. A rename makes every existing
#     download, progress record and server connection unreadable on the first launch after the
#     update.
#   - Jackson builds every Kotlin model from server JSON through kotlin-reflect, which loads
#     stdlib classes by name. A rename there fails every parse.
#
# and one that hurts every launch, on the watch too: a class the platform or a library builds by
# name (a manifest component, a startup initializer, a Room database) kept but with its
# constructor removed. scripts/r8-check/constructors.py reads both release APKs for that first.
#
# So this re-runs the release shrink with R8's own configuration, writes class files instead of
# dex, and runs scripts/r8-check/Smoke.java twice: once on the unminified app to parse a real
# server payload and store it with Paper's own Kryo, once on the shrunk app to parse the same
# payload and read those bytes back. The two outputs must be identical. This is how the
# kotlin.jvm.functions.Function1 rename was found, before it shipped.
#
# Needs the Android SDK and node_modules (run npm ci, and `npx cap sync android` once), like
# the release build itself. Takes a few minutes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
export ANDROID_HOME="$ANDROID_SDK_ROOT"
ANDROID_JAR="$(ls -d "$ANDROID_SDK_ROOT"/platforms/android-*/ | sort -V | tail -1)android.jar"
JDK="$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")"

echo "▶ Release build, printing R8's configuration and inputs"
R8_CHECK_OUT="$OUT" "$ROOT/android/gradlew" -p "$ROOT/android" --no-daemon -q \
  --init-script "$ROOT/scripts/gradle-mirror.init.gradle" \
  --init-script "$ROOT/scripts/r8-check/r8-inputs.init.gradle" \
  :app:assembleRelease :app:printR8Inputs :wear:assembleRelease

# Read the dex R8 actually wrote. The class-file run below cannot see this: AGP passes R8 options
# (strict full mode for keep rules among them) that a standalone R8 run does not get, and that
# option is what removed WorkDatabase_Impl's constructor from 0.14.0-dev.49 and every Play build
# of the watch app. Cheap, and meaningful for an unminified build too.
echo "▶ Classes built by name still have their constructor"
python3 "$ROOT/scripts/r8-check/constructors.py" \
  "$ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk" \
  "$ROOT/android/wear/build/outputs/apk/release/wear-release-unsigned.apk"

if [[ ! -f "$OUT/r8-config.txt" ]]; then
  echo "• R8 is off for :app (minifyEnabled false in android/app/build.gradle) - nothing to check"
  exit 0
fi

APP="$ROOT/android/app/build/intermediates"
R8_JAR="$(ls ~/.gradle/caches/modules-2/files-2.1/com.android.tools.build/builder/*/*/builder-*.jar | grep -v sources | sort -V | tail -1)"
mapfile -t LIBS < <(grep -v '^$' "$OUT/libs.txt")
(cd "$APP/built_in_kotlinc/release/compileReleaseKotlin/classes" && zip -qr "$OUT/app.jar" .)
(cd "$APP/javac/release/compileReleaseJavaWithJavac/classes" && zip -qr "$OUT/app.jar" .)
R_JAR="$APP/compile_and_runtime_r_class_jar/release/processReleaseResources/R.jar"

# Lambdas first: in class-file mode R8 keeps invokedynamic, and its optimisations can then
# break them in ways the dex build - which desugars before optimising - never sees.
echo "▶ Desugaring, then shrinking to class files"
java -Xmx6g -cp "$R8_JAR" com.android.tools.r8.D8 --classfile --min-api 26 --release \
  --lib "$ANDROID_JAR" --output "$OUT/desugared.jar" "$OUT/app.jar" "$R_JAR" "${LIBS[@]}" 2>&1 |
  grep -vE '^(Info in |Classes with missing EnclosingMethod)' || true
# D8 drops non-class resources, and META-INF/services is how coroutines finds its dispatcher.
mkdir -p "$OUT/res"
for jar in "$OUT/app.jar" "${LIBS[@]}"; do
  (cd "$OUT/res" && unzip -qo "$jar" -x '*.class' 'META-INF/*.SF' 'META-INF/*.RSA' 'META-INF/MANIFEST.MF' 2>/dev/null || true)
done
(cd "$OUT/res" && zip -qr "$OUT/desugared.jar" .)
grep -vE '^-print(configuration|mapping|usage|seeds)' "$OUT/r8-config.txt" > "$OUT/config.txt"
java -Xmx6g -cp "$R8_JAR" com.android.tools.r8.R8 --classfile --release \
  --lib "$ANDROID_JAR" --lib "$JDK" \
  --pg-conf "$OUT/config.txt" --pg-conf "$APP/aapt_proguard_file/release/processReleaseResources/aapt_rules.txt" \
  --output "$OUT/minified.jar" "$OUT/desugared.jar" 2>&1 | grep -v 'type variable is not in scope' || true

echo "▶ Parse and store with the current app, then parse and read back with the shrunk one"
FULL_CP="$(printf '%s:' "${LIBS[@]}")$OUT/app.jar:$ANDROID_JAR"
mkdir -p "$OUT/harness"
cp "$ROOT/scripts/r8-check/item.json" "$OUT/harness/"
javac -nowarn -cp "$FULL_CP" -d "$OUT/harness" "$ROOT/scripts/r8-check/Smoke.java" 2>/dev/null
# Kryo reaches into JDK internals; Android allows that, a desktop JVM has to be told.
OPENS=(--add-opens java.base/sun.misc=ALL-UNNAMED --add-opens java.base/java.util=ALL-UNNAMED
  --add-opens java.base/java.lang=ALL-UNNAMED --add-opens java.base/java.lang.reflect=ALL-UNNAMED
  --add-opens java.base/java.util.concurrent=ALL-UNNAMED --add-opens java.base/java.net=ALL-UNNAMED)
java "${OPENS[@]}" -cp "$OUT/harness:$FULL_CP" Smoke write "$OUT/harness" > "$OUT/current.txt"
java "${OPENS[@]}" -cp "$OUT/harness:$OUT/minified.jar:$ANDROID_JAR" Smoke read "$OUT/harness" > "$OUT/shrunk.txt" 2> "$OUT/shrunk.err" || true

if diff -q "$OUT/current.txt" "$OUT/shrunk.txt" > /dev/null; then
  echo "✓ The shrunk app parses the server payload and reads the stored records exactly as the current one does"
else
  echo "✗ The shrunk app disagrees with the current one:"
  grep -E 'Exception|Error|Caused by' "$OUT/shrunk.err" | head -5 || true
  diff <(tr ',' '\n' < "$OUT/current.txt") <(tr ',' '\n' < "$OUT/shrunk.txt") | head -40
  exit 1
fi
