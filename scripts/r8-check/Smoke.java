import com.esotericsoftware.kryo.Kryo;
import com.esotericsoftware.kryo.io.Input;
import com.esotericsoftware.kryo.io.Output;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.io.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;

/**
 * mode "write" (run on the current, unminified app): parse server JSON with the app's Jackson
 * setup, store the models with Paper's own Kryo, print each as canonical JSON.
 * mode "read" (run on the R8 build): read those bytes back with Paper's Kryo and parse the same
 * JSON again, printing the same canonical JSON. Identical output = the R8 build reads existing
 * data and server responses exactly as the current app does.
 */
public class Smoke {
  static ObjectMapper mapper() throws Exception {
    // The app's own construction: jacksonObjectMapper() from jackson-module-kotlin.
    ObjectMapper m = (ObjectMapper) Class.forName("com.fasterxml.jackson.module.kotlin.ExtensionsKt").getMethod("jacksonObjectMapper").invoke(null);
    m.configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    m.configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
    m.configure(com.fasterxml.jackson.databind.MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true);
    return m;
  }

  static Kryo paperKryo() throws Exception {
    Class<?> storage = Class.forName("io.paperdb.DbStoragePlainFile");
    Field uf = Class.forName("sun.misc.Unsafe").getDeclaredField("theUnsafe"); uf.setAccessible(true);
    Object unsafe = uf.get(null);
    Object inst = unsafe.getClass().getMethod("allocateInstance", Class.class).invoke(unsafe, storage);
    Field cs = storage.getDeclaredField("mCustomSerializers"); cs.setAccessible(true); cs.set(inst, new HashMap<>());
    Method create = storage.getDeclaredMethod("createKryoInstance", boolean.class); create.setAccessible(true);
    return (Kryo) create.invoke(inst, false);
  }

  public static void main(String[] args) throws Exception {
    String mode = args[0]; Path dir = Paths.get(args[1]);
    ObjectMapper json = mapper();
    String itemJson = new String(Files.readAllBytes(dir.resolve("item.json")));
    Class<?> libraryItem = Class.forName("com.audiobookshelf.app.data.LibraryItem");
    Class<?> deviceData = Class.forName("com.audiobookshelf.app.data.DeviceData");
    Class<?> localProgress = Class.forName("com.audiobookshelf.app.data.LocalMediaProgress");

    Object item = json.readValue(itemJson, libraryItem);
    System.out.println("parsed item: " + json.writeValueAsString(item));

    if (mode.equals("write")) {
      Object settings = Class.forName("com.audiobookshelf.app.data.DeviceSettings").getField("Companion").get(null);
      settings = settings.getClass().getMethod("default").invoke(settings);
      Object config = json.readValue("{\"id\":\"cfg-1\",\"index\":0,\"name\":\"Home\",\"address\":\"https://abs.example\",\"version\":\"2.20.0\",\"userId\":\"u1\",\"username\":\"me\",\"token\":\"t\"}", Class.forName("com.audiobookshelf.app.data.ServerConnectionConfig"));
      List<Object> configs = new ArrayList<>(); configs.add(config);
      Object device = null;
      for (Constructor<?> c : deviceData.getConstructors()) if (c.getParameterCount() == 4) device = c.newInstance(configs, "cfg-1", settings, null);
      Object progress = json.readValue("{\"id\":\"local_li-local_ep\",\"localLibraryItemId\":\"local_li\",\"localEpisodeId\":\"local_ep\",\"duration\":4600.0,\"progress\":0.33,\"currentTime\":1500.0,\"isFinished\":false,\"lastUpdate\":1700000000000,\"startedAt\":1690000000000,\"finishedAt\":null,\"serverConnectionConfigId\":\"cfg-1\",\"serverAddress\":\"https://abs.example\",\"serverUserId\":\"u1\",\"libraryItemId\":\"li_hardcore\",\"episodeId\":\"ep_h1\"}", localProgress);
      try (Output out = new Output(new FileOutputStream(dir.resolve("paper.bin").toFile()))) {
        Kryo k = paperKryo();
        k.writeClassAndObject(out, item); k.writeClassAndObject(out, device); k.writeClassAndObject(out, progress);
      }
      for (Object o : new Object[] {item, device, progress}) System.out.println("stored: " + json.writeValueAsString(o));
    } else {
      try (Input in = new Input(new FileInputStream(dir.resolve("paper.bin").toFile()))) {
        Kryo k = paperKryo();
        for (int i = 0; i < 3; i++) System.out.println("stored: " + json.writeValueAsString(k.readClassAndObject(in)));
      }
    }
  }
}
