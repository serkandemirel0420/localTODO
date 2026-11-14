package com.localtodo.app

import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.triggers.TimeIntervalTrigger
import org.junit.Assert.*
import org.junit.Test
import java.util.Calendar
import java.util.Date
import java.util.TimeZone

class RoutineNotificationPolicyTest {
  private val routine = "local-todo:todo-alarm:todo-a:habit:2d"
  private val normal = "local-todo:todo-alarm:todo-a"

  private fun date(hour: Int, minute: Int = 0): Date = Calendar.getInstance().apply {
    set(2040, Calendar.SEPTEMBER, 7, hour, minute, 0)
    set(Calendar.MILLISECOND, 0)
  }.time

  private fun request(identifier: String, date: Date, seconds: Long = 172800) =
    NotificationRequest(identifier, null, TimeIntervalTrigger("todo-alarms", seconds, true, date))

  private fun next(request: NotificationRequest) = (request.trigger as TimeIntervalTrigger).nextTriggerDate()

  @Test fun quietHoursBlockEveryRoutineAtMidnightThrough0659() {
    for (id in listOf("0", "3", "1d", "2d", "1w", "2w", "1m")) {
      for (hour in 0..6) {
        assertTrue(RoutineNotificationPolicy.shouldSuppress("local-todo:todo-alarm:item:habit:$id", false, true, hour))
      }
    }
    assertFalse(RoutineNotificationPolicy.shouldSuppress(routine, false, true, 7))
    assertFalse(RoutineNotificationPolicy.shouldSuppress(routine, false, true, 23))
    assertFalse(RoutineNotificationPolicy.shouldSuppress(routine, false, false, 1))
  }

  @Test fun pauseBlocksRoutinesOnly() {
    for (hour in 0..23) {
      assertTrue(RoutineNotificationPolicy.shouldSuppress(routine, true, false, hour))
      assertFalse(RoutineNotificationPolicy.shouldSuppress(normal, true, true, hour))
      assertFalse(RoutineNotificationPolicy.shouldSuppress("another-app:habit:2d", true, true, hour))
    }
  }

  @Test fun openingAppOrEditingContentKeepsExistingMultiDayTimer() {
    val existing = request(routine, date(10))
    val incoming = request(routine, date(15))
    val result = preserveRoutineIntervalSchedule(incoming, existing, true)
    assertEquals(date(10), next(result))
    assertEquals(date(10), next(preserveRoutineIntervalSchedule(incoming, result, true)))
  }

  @Test fun quietHoursMoveNewAndExistingOvernightIntervalsTo0700() {
    val night = request(routine, date(1, 35))
    assertEquals(date(7), next(preserveRoutineIntervalSchedule(night, null, true)))
    assertEquals(date(7), next(preserveRoutineIntervalSchedule(request(routine, date(15)), night, true)))
    assertEquals(date(1, 35), next(preserveRoutineIntervalSchedule(night, null, false)))
  }

  @Test fun changedIntervalsUseNewTimerAndNormalRemindersStayUntouched() {
    val changed = request(routine, date(15), 259200)
    assertEquals(date(15), next(preserveRoutineIntervalSchedule(changed, request(routine, date(10)), true)))
    val reminder = request(normal, date(1))
    assertSame(reminder, preserveRoutineIntervalSchedule(reminder, null, true))
  }

  @Test fun quietBoundaryUsesLocalTimezone() {
    val original = TimeZone.getDefault()
    try {
      for (zone in listOf("Europe/Istanbul", "America/New_York")) {
        TimeZone.setDefault(TimeZone.getTimeZone(zone))
        assertEquals(date(7), RoutineNotificationPolicy.allowedDate(date(6, 59), true))
        assertEquals(date(7), RoutineNotificationPolicy.allowedDate(date(7), true))
        assertEquals(date(23), RoutineNotificationPolicy.allowedDate(date(23), true))
      }
    } finally {
      TimeZone.setDefault(original)
    }
  }
}
