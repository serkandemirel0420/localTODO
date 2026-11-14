package com.localtodo.app

import java.util.Calendar
import java.util.Date

/** Local wall-clock policy, also used when React Native is not running. */
object RoutineNotificationPolicy {
  fun isRoutine(identifier: String): Boolean =
    identifier.startsWith("local-todo:todo-alarm:") && identifier.contains(":habit:")

  fun shouldSuppress(identifier: String, paused: Boolean, quiet: Boolean, hour: Int): Boolean =
    isRoutine(identifier) && (paused || (quiet && hour in 0..6))

  fun allowedDate(date: Date, quiet: Boolean): Date {
    val calendar = Calendar.getInstance().apply { time = date }
    if (quiet && calendar.get(Calendar.HOUR_OF_DAY) in 0..6) {
      calendar.set(Calendar.HOUR_OF_DAY, 7)
      calendar.set(Calendar.MINUTE, 0)
      calendar.set(Calendar.SECOND, 0)
      calendar.set(Calendar.MILLISECOND, 0)
    }
    return calendar.time
  }
}
