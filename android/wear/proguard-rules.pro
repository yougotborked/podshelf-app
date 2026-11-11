# kotlinx.serialization generates a companion .serializer() for each @Serializable class and
# reaches it from the generated descriptors. R8 has rules for this built in since AGP 8, but the
# companions are only kept when the serializable classes themselves are, and nothing in this
# module holds a static reference to WearQueue at a point R8 can see.
-keepclassmembers class com.podshelf.wearsync.** {
    *** Companion;
}
-keepclasseswithmembers class com.podshelf.wearsync.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# AGP 9 runs R8 in strict full mode for keep rules: `-keep class X` no longer keeps X's default
# constructor. Room's consumer rule is `-keep class * extends androidx.room.RoomDatabase`, so
# WorkDatabase_Impl kept its name and lost the constructor Room calls by reflection, and
# WorkManager's startup initializer killed the app before Application.onCreate. Naming the
# constructor here is what the library's rule meant. scripts/r8-check/constructors.py reads the
# built dex for exactly this and fails the build if any class built by name has none.
-keepclassmembers class * extends androidx.room.RoomDatabase {
    <init>();
}
