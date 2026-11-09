#!/usr/bin/env python3
"""Checks that every class Android or a library creates by name still has its constructor.

    scripts/r8-check/constructors.py <release apk or aab>...

R8 can keep a class's name and still remove its no-argument constructor. Nothing calls that
constructor in code - the framework or a library builds the class reflectively - so the build
passes and the app dies on launch. That is how 0.14.0-dev.49 and every Play build of the watch
app closed on open: AGP 9 runs R8 in "strict full mode" for keep rules, Room's
`-keep class * extends androidx.room.RoomDatabase` stopped implying the constructor, and
androidx.work.impl.WorkDatabase_Impl lost it. WorkManager initialises from androidx.startup's
InitializationProvider, before Application.onCreate, so not even a crash handler saw it.

So this reads the dex R8 wrote, not the rules that produced it. It collects the classes the
platform instantiates by name - every manifest component, every androidx.startup initializer,
every Room database implementation, every META-INF/services provider - and fails if one of them
is missing from the dex or has no `<init>()V`.
"""
import glob
import os
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

SDK = os.environ.get("ANDROID_SDK_ROOT", "/opt/android-sdk")
BUILD_TOOLS = sorted(glob.glob(f"{SDK}/build-tools/*/"), key=lambda p: [int(x) if x.isdigit() else x for x in re.split(r"[.-]", os.path.basename(p.rstrip("/")))])[-1]
COMPONENT_TAGS = {"activity", "activity-alias", "service", "receiver", "provider", "application"}


ANDROID = "{http://schemas.android.com/apk/res/android}"


def manifest_classes(archive):
    """Class names the manifest asks the platform to build, plus androidx.startup initializers.

    Read from the merged manifest the build packaged, next to the archive's outputs/ directory:
    a bundle stores its manifest as protobuf, which aapt2 cannot dump from an .aab.
    """
    build_dir = archive[: archive.rindex(f"{os.sep}outputs{os.sep}")]
    manifest = f"{build_dir}/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml"
    root = ET.parse(manifest).getroot()
    package = root.get("package") or ""
    names = set()
    application = root.find("application")
    for element in [application, *application.iter()]:
        name = element.get(ANDROID + "name")
        if element.tag in COMPONENT_TAGS and name:
            names.add(package + name if name.startswith(".") else name)
        if element.get(ANDROID + "appComponentFactory"):
            names.add(element.get(ANDROID + "appComponentFactory"))
        if element.tag == "provider" and name == "androidx.startup.InitializationProvider":
            names.update(m.get(ANDROID + "name") for m in element.findall("meta-data"))
    return names


def dex_classes(archive, workdir):
    """{class name: has a no-argument constructor} for every class in the archive's dex files."""
    with zipfile.ZipFile(archive) as z:
        # An APK keeps dex and java resources at its root; a bundle under base/dex and base/root.
        dexes = [z.extract(n, workdir) for n in z.namelist() if re.fullmatch(r"(base/dex/)?classes\d*\.dex", n)]
        services = {}
        for n in z.namelist():
            if re.match(r"(base/root/)?META-INF/services/.", n):
                for line in z.read(n).decode().splitlines():
                    line = line.split("#")[0].strip()
                    if line:
                        services[line] = n
    classes, current, method, uses_service_loader = {}, None, None, False
    for dex in dexes:
        out = subprocess.run([f"{BUILD_TOOLS}dexdump", dex], capture_output=True, text=True, errors="replace").stdout
        uses_service_loader |= "Ljava/util/ServiceLoader;" in out
        for line in out.splitlines():
            m = re.match(r"\s*Class descriptor\s*: 'L(.+);'", line)
            if m:
                current = m.group(1).replace("/", ".")
                classes[current] = False
                continue
            m = re.match(r"\s*name\s*: '(.+)'", line)
            if m:
                method = m.group(1)
                continue
            if method == "<init>" and re.match(r"\s*type\s*: '\(\)V'", line):
                classes[current] = True
    # R8 rewrites ServiceLoader.load into direct construction and leaves the service files behind,
    # renamed and pointing at whatever the interface was merged into. With no ServiceLoader left
    # in the dex, nothing reads them.
    return classes, services if uses_service_loader else {}


def check(archive):
    with tempfile.TemporaryDirectory() as workdir:
        classes, services = dex_classes(archive, workdir)
    needed = {name: "manifest" for name in manifest_classes(archive)}
    needed.update({name: source for name, source in services.items()})
    # Room builds <Database>_Impl by name: Room.databaseBuilder -> Class.forName(name + "_Impl").
    needed.update({name: "Room" for name in classes if name.endswith("Database_Impl")})
    problems = []
    for name, source in sorted(needed.items()):
        if name not in classes:
            # A manifest entry for a class the build does not ship (a library's optional
            # component, removed by tools:node) is the platform's problem only if it is enabled.
            if source != "manifest":
                problems.append(f"{name} ({source}) is not in the dex")
        elif not classes[name]:
            problems.append(f"{name} ({source}) has no no-argument constructor")
    return len(needed), problems


def main():
    failed = False
    for archive in sys.argv[1:]:
        count, problems = check(archive)
        label = os.path.basename(archive)
        if problems:
            failed = True
            print(f"✗ {label}: {len(problems)} of {count} classes built by name cannot be built")
            for p in problems:
                print(f"    {p}")
        else:
            print(f"✓ {label}: all {count} classes built by name have their constructor")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
