/*
 * Copyright (C) 2021 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
package com.audiobookshelf.app.player

import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.TrackGroup

// TODO(media3): TrackSelection interface was removed in Media3.  CastTrackSelection is no longer
// a formal TrackSelection — it is now a plain helper class used only internally by CastPlayer to
// map between TrackGroup indices and renderer slots.  A full rewrite of CastPlayer's track
// selection logic is deferred; this stub keeps the code compiling.

/** Helper that selects the first (and only) track of the provided [TrackGroup]. */
/* package */
internal class CastTrackSelection(val trackGroup: TrackGroup) {

  fun length(): Int = 1

  fun getFormat(index: Int): Format {
    require(index == 0)
    return trackGroup.getFormat(0)
  }

  fun getIndexInTrackGroup(index: Int): Int =
    if (index == 0) 0 else C.INDEX_UNSET

  fun indexOf(format: Format): Int =
    if (format === trackGroup.getFormat(0)) 0 else C.INDEX_UNSET

  fun indexOf(indexInTrackGroup: Int): Int =
    if (indexInTrackGroup == 0) 0 else C.INDEX_UNSET

  // Object overrides.
  override fun hashCode(): Int = System.identityHashCode(trackGroup)

  // Track groups are compared by identity not value, as distinct groups may have the same value.
  override fun equals(other: Any?): Boolean {
    if (this === other) return true
    if (other == null || javaClass != other.javaClass) return false
    return trackGroup === (other as CastTrackSelection).trackGroup
  }
}
