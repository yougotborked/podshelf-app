package com.podshelf.wear.progress

import android.content.Context
import androidx.core.content.edit
import com.podshelf.wearsync.WearProgressQueue
import com.podshelf.wearsync.WearProgressRecord
import com.podshelf.wearsync.mergeProgressRecord
import kotlinx.serialization.json.Json

/**
 * Listening the watch has done but not yet told the server about.
 *
 * On disk, because the entire point is a run with no connection: the records have to survive the
 * app being killed, the watch rebooting, and a day of nothing in range.
 */
class ProgressStore(context: Context) {
  private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private val json = Json { ignoreUnknownKeys = true }

  @Synchronized
  fun records(): List<WearProgressRecord> {
    val stored = prefs.getString(KEY_RECORDS, null) ?: return emptyList()
    return try {
      json.decodeFromString(WearProgressQueue.serializer(), stored).records
    } catch (e: Exception) {
      // A payload this build cannot read is not worth crashing a run over, and the server's
      // copy is never worse than nothing.
      emptyList()
    }
  }

  @Synchronized
  fun record(entry: WearProgressRecord) {
    write(mergeProgressRecord(records(), entry))
  }

  /** Drops the records that reached the server, keeping any that arrived while sending. */
  @Synchronized
  fun forget(sent: List<WearProgressRecord>) {
    val sentIds = sent.associate { it.episodeId to it.updatedAtMs }
    write(records().filterNot { sentIds[it.episodeId] == it.updatedAtMs })
  }

  private fun write(records: List<WearProgressRecord>) {
    prefs.edit {
      putString(
              KEY_RECORDS,
              json.encodeToString(WearProgressQueue.serializer(), WearProgressQueue(records))
      )
    }
  }

  companion object {
    private const val PREFS = "podshelf_wear_progress"
    private const val KEY_RECORDS = "records_json"
  }
}
