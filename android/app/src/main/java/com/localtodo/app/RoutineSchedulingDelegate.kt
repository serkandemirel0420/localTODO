package com.localtodo.app

import android.app.AlarmManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.AlarmManagerCompat
import expo.modules.notifications.notifications.interfaces.SchedulableNotificationTrigger
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.triggers.DailyTrigger
import expo.modules.notifications.notifications.triggers.MonthlyTrigger
import expo.modules.notifications.notifications.triggers.WeeklyTrigger
import expo.modules.notifications.notifications.triggers.YearlyTrigger
import expo.modules.notifications.notifications.triggers.TimeIntervalTrigger
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoSchedulingDelegate
import expo.modules.notifications.service.delegates.SharedPreferencesNotificationsStore
import expo.modules.notifications.service.interfaces.SchedulingDelegate
import java.util.Calendar
import java.util.Date

/** Persist the occurrence being awaited, separately from Expo's relative calendar triggers. */
class RoutineSchedulingDelegate(private val context: Context) : SchedulingDelegate {
  companion object {
    // Expo dispatches every broadcast on a separate thread, including restore and cancel.
    private val lock = Any()
  }

  private val expo = ExpoSchedulingDelegate(context)
  private val store = SharedPreferencesNotificationsStore(context)
  private val deadlines = context.getSharedPreferences("localtodo-routine-deadlines", Context.MODE_PRIVATE)
  private val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  override fun getAllScheduledNotifications() = synchronized(lock) { expo.getAllScheduledNotifications() }
  override fun getScheduledNotification(identifier: String) = synchronized(lock) { expo.getScheduledNotification(identifier) }

  private fun sameSchedule(first: NotificationRequest, second: NotificationRequest): Boolean {
    val a = first.trigger?.toBundle() ?: return false
    val b = second.trigger?.toBundle() ?: return false
    return a.keySet() == b.keySet() && a.keySet().all { a.get(it) == b.get(it) }
  }

  private fun arm(identifier: String, due: Long) {
    val operation = NotificationsService.createNotificationTrigger(context, identifier)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
      AlarmManagerCompat.setExactAndAllowWhileIdle(alarms, AlarmManager.RTC_WAKEUP, due, operation)
    } else {
      AlarmManagerCompat.setAndAllowWhileIdle(alarms, AlarmManager.RTC_WAKEUP, due, operation)
    }
  }

  private fun save(request: NotificationRequest, due: Long) {
    store.saveNotificationRequest(request)
    check(deadlines.edit().putLong(request.identifier, due).commit()) { "Could not persist routine deadline" }
    arm(request.identifier, due)
  }

  override fun scheduleNotification(request: NotificationRequest) = synchronized(lock) {
    if (!RoutineNotificationPolicy.isRoutine(request.identifier) || request.trigger !is SchedulableNotificationTrigger) {
      val trigger = request.trigger
      val startAt = request.content.body?.optLong("dailyStartAt", 0L) ?: 0L
      val next = (trigger as? DailyTrigger)?.nextTriggerDate()?.time
      if (request.identifier.startsWith("local-todo:todo-alarm:") && next != null && startAt > next) {
        // Keep the repeating trigger, but delay its first wakeup until the selected start date.
        store.saveNotificationRequest(request)
        arm(request.identifier, startAt)
      } else {
        expo.scheduleNotification(request)
      }
      return@synchronized
    }
    val previous = expo.getScheduledNotification(request.identifier)
    val quiet = RoutineNotificationSettings.quiet(context)
    val continuing = preserveRoutineIntervalSchedule(request, previous, quiet)
    // Preserve even an overdue occurrence: replacing it with tomorrow's calendar
    // date on app resume would cancel a reminder Android has not delivered yet.
    val due = if (previous != null && sameSchedule(previous, request) && deadlines.contains(request.identifier)) {
      Date(deadlines.getLong(request.identifier, 0))
    } else {
      (continuing.trigger as SchedulableNotificationTrigger).nextTriggerDate()
    }
    if (due == null) removeScheduledNotifications(listOf(request.identifier))
    else save(continuing, RoutineNotificationPolicy.allowedDate(due, quiet).time)
  }

  override fun setupScheduledNotifications() = synchronized(lock) {
    expo.getAllScheduledNotifications().forEach { request ->
      try {
        scheduleNotification(request)
      } catch (error: Exception) {
        Log.w("todo-alarms", "Could not restore alarm ${request.identifier}", error)
      }
    }
  }

  override fun triggerNotification(identifier: String) = synchronized(lock) {
    if (!RoutineNotificationPolicy.isRoutine(identifier)) {
      expo.triggerNotification(identifier)
      return@synchronized
    }
    val now = System.currentTimeMillis()
    // Deliver routines due together in one wakeup. Android idle-mode alarm quotas
    // can otherwise delay one of several independent alarms for the same instant.
    val dueRequests = expo.getAllScheduledNotifications().filter {
      RoutineNotificationPolicy.isRoutine(it.identifier) && deadlines.contains(it.identifier) &&
        deadlines.getLong(it.identifier, Long.MAX_VALUE) <= now
    }
    // A device waking after multiple slots needs one current alert per routine.
    val latestByTodo = dueRequests.groupBy { it.identifier.substringBeforeLast(":habit:") }
      .mapValues { (_, requests) -> requests.maxBy { deadlines.getLong(it.identifier, 0) }.identifier }
    dueRequests.forEach { request ->
      try {
        val due = deadlines.getLong(request.identifier, 0)
        val trigger = request.trigger as? SchedulableNotificationTrigger
        var next = trigger?.nextTriggerDate()
        if (next != null && next.time <= now) {
          // Expo's calendar triggers can return the current occurrence when the
          // broadcast lands at the exact millisecond. Never delete a repeat then.
          val field = when (trigger) {
            is DailyTrigger -> Calendar.DATE
            is WeeklyTrigger -> Calendar.WEEK_OF_YEAR
            is MonthlyTrigger -> Calendar.MONTH
            is YearlyTrigger -> Calendar.YEAR
            else -> null
          }
          next = when {
            trigger is TimeIntervalTrigger && trigger.isRepeating -> Date(next.time + trigger.timeInterval * 1000)
            field != null -> Calendar.getInstance().apply { time = next; add(field, 1) }.time
            else -> null
          }
        }
        if (next == null || next.time <= now) {
          removeScheduledNotifications(listOf(request.identifier))
        } else {
          val allowed = RoutineNotificationPolicy.allowedDate(next, RoutineNotificationSettings.quiet(context))
          val nextRequest = if (trigger is TimeIntervalTrigger) NotificationRequest(
            request.identifier, request.content,
            TimeIntervalTrigger(trigger.channelId, trigger.timeInterval, trigger.isRepeating, allowed),
          ) else request
          // Advance synchronously before receiving. Duplicate/stale broadcasts now
          // see a future deadline, even after the process is restarted.
          save(nextRequest, allowed.time)
        }
        if (latestByTodo[request.identifier.substringBeforeLast(":habit:")] == request.identifier) {
          NotificationsService.receive(context, Notification(request, Date(due)))
        }
      } catch (error: Exception) {
        Log.w("todo-alarms", "Could not deliver routine ${request.identifier}", error)
      }
    }
    // Upgrade alarms created by older releases on their first delivery.
    if (dueRequests.none { it.identifier == identifier } && !deadlines.contains(identifier)) {
      expo.getScheduledNotification(identifier)?.let { request ->
        scheduleNotification(request)
        NotificationsService.receive(context, Notification(request))
      }
    }
  }

  override fun removeScheduledNotifications(identifiers: Collection<String>) = synchronized(lock) {
    expo.removeScheduledNotifications(identifiers)
    val editor = deadlines.edit()
    identifiers.forEach { editor.remove(it) }
    check(editor.commit())
  }

  override fun removeAllScheduledNotifications() = synchronized(lock) {
    expo.removeAllScheduledNotifications()
    check(deadlines.edit().clear().commit())
  }
}
