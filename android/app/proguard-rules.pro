# R8 for the phone app.
#
# Turned on because Play requires obfuscation from February 2027 ("DEX code optimization is below
# our threshold - Obfuscation 0%"). The aim is the library code - androidx, media3, Cast, OkHttp,
# coroutines - which is most of the dex and is safe to rename because each of those ships its own
# consumer rules for whatever it reaches by name.
#
# Our own code and a handful of libraries are kept whole instead. Not out of caution in general:
# each has something that is reached by name at runtime or written by name to disk, listed below.
# Narrowing any of these needs a reason to believe that has stopped being true.

# --- Stored by name on disk -----------------------------------------------------------------
#
# Paper (the device database) serialises with Kryo's CompatibleFieldSerializer, which writes each
# object's class name and field names into the stored bytes. Renaming a stored class or field
# makes every existing record unreadable - downloads, local progress, server connections - on the
# first launch after an update. Everything Paper stores is a model in our own package, and those
# models hold Kotlin collections - kept below with the rest of the standard library.
#
# Our package is also where Jackson builds objects from server JSON by reflection, where the
# Capacitor plugins live, and where the manifest, Cast (OPTIONS_PROVIDER_CLASS_NAME) and the
# widget name classes as strings - so it is kept whole rather than piece by piece.
-keep class com.audiobookshelf.app.** { *; }
-keep class com.podshelf.** { *; }

# --- Reflection ------------------------------------------------------------------------------
#
# Jackson ships no R8 rules. jackson-module-kotlin reads Kotlin metadata through kotlin-reflect
# (which ships its own rules) to construct data classes; that needs the metadata annotation,
# generic signatures and the inner class attributes intact.
-keep class com.fasterxml.jackson.** { *; }
-dontwarn com.fasterxml.jackson.**
#
# The Kotlin standard library is kept whole, for two reasons that each need it:
# - kotlin-reflect loads stdlib classes by name - kotlin.jvm.functions.Function1 among them - to
#   map Kotlin types onto Java ones. Renamed, its static initialiser fails and every Jackson parse
#   of a Kotlin model throws (NoClassDefFoundError: kotlin/jvm/functions/Function1); found by
#   running the minified build against real server JSON, not by reading the rules.
# - Paper stores Kotlin types by name inside our models (emptyList() is
#   kotlin.collections.EmptyList, not a java.util type).
-keep class kotlin.** { *; }
-keepattributes Signature,InnerClasses,EnclosingMethod,RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations,AnnotationDefault

# Capacitor ships rules for plugin classes; its bridge and core are kept too, because plugins are
# registered from assets/capacitor.plugins.json by class name and the bridge serialises across
# the webview boundary.
-keep class com.getcapacitor.** { *; }

# Cordova plugins are instantiated from res/xml/config.xml by class name
# (cordova.plugins.screenorientation.CDVOrientation).
-keep class * extends org.apache.cordova.CordovaPlugin { *; }
-keep class org.apache.cordova.** { *; }

# The webview calls these by name from JavaScript.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# SimpleStorage resolves document URIs through reflection on its own types.
-keep class com.anggrayudi.storage.** { *; }

# --- Play's static checks --------------------------------------------------------------------
#
# Play looks for androidx's enableEdgeToEdge() in the dex ("Edge-to-edge may not display for all
# users"). R8 inlines it into MainActivity.onCreate and the class disappears, so the check fails
# on a build that does call it. Kept by name and not inlined.
-keep class androidx.activity.EdgeToEdge {
    public static void enable(...);
}
# Its parameter types too: R8 renames ComponentActivity and SystemBarStyle otherwise, and the
# call in the dex reads EdgeToEdge.enable(Lhx;Ld43;Ld43;) - not the signature Play looks for.
-keepnames class androidx.activity.ComponentActivity
-keepnames class androidx.activity.SystemBarStyle

# --- Crash reports ---------------------------------------------------------------------------
#
# Readable traces in Play vitals once the mapping file is uploaded with the bundle.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
