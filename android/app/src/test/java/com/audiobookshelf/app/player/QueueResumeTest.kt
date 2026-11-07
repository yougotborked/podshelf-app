package com.audiobookshelf.app.player

import org.junit.Assert.assertEquals
import org.junit.Test

class QueueResumeTest {
  @Test
  fun `an episode half-heard by streaming resumes when the queue reaches its download`() {
    // The report: no local record at all for the downloaded copy, 25 minutes on the server.
    assertEquals(1500.0, queuedResumeTime(null, false, null, 1500.0, 1_000L), 0.0)
  }

  @Test
  fun `a stale local record loses to a newer server position`() {
    assertEquals(1500.0, queuedResumeTime(120.0, false, 500L, 1500.0, 1_000L), 0.0)
  }

  @Test
  fun `listening on this device after the queue was built still wins`() {
    assertEquals(1800.0, queuedResumeTime(1800.0, false, 2_000L, 1500.0, 1_000L), 0.0)
  }

  @Test
  fun `nothing queued falls back to the local record, as before`() {
    assertEquals(300.0, queuedResumeTime(300.0, false, 2_000L, null, null), 0.0)
    assertEquals(0.0, queuedResumeTime(null, false, null, null, null), 0.0)
  }

  @Test
  fun `a finished local record starts from the top`() {
    assertEquals(0.0, queuedResumeTime(3600.0, true, 2_000L, null, null), 0.0)
  }
}
