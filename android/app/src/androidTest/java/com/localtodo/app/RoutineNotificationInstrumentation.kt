package com.localtodo.app

import android.app.Activity
import android.app.Instrumentation
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Bundle
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.triggers.DailyTrigger
import expo.modules.notifications.notifications.triggers.TimeIntervalTrigger
import expo.modules.notifications.notifications.triggers.DateTrigger
import expo.modules.notifications.service.NotificationsService
import java.util.Date
import java.util.Calendar
import java.util.SimpleTimeZone
import java.util.TimeZone

/** Native background delivery smoke test; no activity or React Native JS is started. */
class RoutineNotificationInstrumentation : Instrumentation() {
  private var textOnly = false
  override fun onCreate(arguments: Bundle?) {
    textOnly = arguments?.getString("routineTextOnly") == "true"
    super.onCreate(arguments)
    start()
  }

  private fun verifyNotificationText(ids: MutableList<String>, manager: NotificationManager) {
    val context = targetContext
    RoutineNotificationSettings.save(context, false, false)
    fun checkText(name: String, identifier: String, label: String, expected: String, hiddenBody: Boolean) {
      RoutineNotificationSettings.saveText(context, label)
      ids.add(identifier)
      val request = NotificationRequest(identifier,
        NotificationContent.Builder().setTitle("Private title").setText("Private notes").build(),
        DateTrigger("todo-alarms", System.currentTimeMillis() + 60000),
      )
      NotificationsService.present(context, Notification(request))
      Thread.sleep(1500)
      val extras = manager.activeNotifications.single { it.tag == identifier }.notification.extras
      check(extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString() == expected) { "$name title was not masked" }
      if (hiddenBody) {
        check(extras.getCharSequence(android.app.Notification.EXTRA_TEXT).isNullOrEmpty()) { "$name exposed notes" }
        check(extras.getCharSequence(android.app.Notification.EXTRA_BIG_TEXT).isNullOrEmpty()) { "$name exposed expanded notes" }
      } else check(extras.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString() == "Private notes")
      manager.cancel(identifier, 0)
    }
    checkText("default", "local-todo:todo-alarm:qa-text-default:habit:1d", "", "Routine", true)
    checkText("custom", "local-todo:todo-alarm:qa-text-custom:habit:1d", "Check in", "Check in", true)
    checkText("preview", "local-todo:routine-preview:qa-text-preview", "Check in", "Check in", true)
    checkText("normal", "local-todo:todo-alarm:qa-text-normal", "Check in", "Private title", false)
  }

  private fun verifyReliableScheduling(ids: MutableList<String>, manager: NotificationManager) {
    val context = targetContext
    RoutineNotificationSettings.save(context, false, false)
    val delegate = RoutineSchedulingDelegate(context)
    val deadlines = context.getSharedPreferences("localtodo-routine-deadlines", android.content.Context.MODE_PRIVATE)
    val due = System.currentTimeMillis() + 5500
    val a = "local-todo:todo-alarm:qa-reliable-a:habit:2d"
    val b = "local-todo:todo-alarm:qa-reliable-b:habit:2d"
    ids.addAll(listOf(a, b))
    val priorDue = deadlines.getLong(a, 0)
    delegate.removeScheduledNotifications(listOf(a, b))
    listOf(a, b).forEach { manager.cancel(it, 0) }
    fun request(id: String, title: String, date: Long) = NotificationRequest(
      id, NotificationContent.Builder().setTitle(title).setText("Routine reliability QA").build(),
      TimeIntervalTrigger("todo-alarms", 120, true, Date(date)),
    )
    delegate.scheduleNotification(request(a, "Routine A", due))
    delegate.scheduleNotification(request(b, "Routine B", due))
    // Simulate app resume/content edits with freshly constructed relative timers.
    RoutineSchedulingDelegate(context).scheduleNotification(request(a, "Updated routine A", due + 60000))
    check(deadlines.getLong(a, 0) == due) { "Content edit changed deadline: expected=$due actual=${deadlines.getLong(a, 0)} prior=$priorDue now=${System.currentTimeMillis()}" }
    Thread.sleep(8500)
    fun posted(id: String) = manager.activeNotifications.single { it.tag == id }
    val originalPosts = listOf(a, b).associateWith { posted(it).postTime }
    listOf(a, b).forEach { id ->
      check(posted(id).notification.extras.getLong("localtodo.notification-origin") == due) { "Missing shared-slot routine $id" }
      check(deadlines.getLong(id, 0) > due) { "Deadline did not advance" }
    }
    val recovered = LocalTodoPresentationDelegate(context).getAllPresentedNotifications()
    listOf(a, b).forEach { id ->
      check(recovered.single { it.notificationRequest.identifier == id }.originDate.time == due) {
        "History readback changed receipt timestamp"
      }
    }
    // Concurrent duplicate broadcasts and a new delegate instance must be harmless.
    val threads = (0..7).map { index -> Thread {
      RoutineSchedulingDelegate(context).triggerNotification(if (index % 2 == 0) a else b)
    }.apply { start() } }
    threads.forEach { it.join() }
    Thread.sleep(1000)
    listOf(a, b).forEach { check(posted(it).postTime == originalPosts[it]) { "Duplicate alert: $it" } }
    val next = deadlines.getLong(a, 0)
    RoutineSchedulingDelegate(context).setupScheduledNotifications()
    check(deadlines.getLong(a, 0) == next) { "Restore reset the interval" }

    // A pending alarm that became due before reconciliation must survive it.
    val overdue = System.currentTimeMillis() - 2000
    deadlines.edit().putLong(a, overdue).commit()
    delegate.scheduleNotification(request(a, "Overdue routine A", due + 60000))
    check(deadlines.getLong(a, 0) == overdue) { "Resume skipped an overdue occurrence" }
    Thread.sleep(8000)
    check(posted(a).notification.extras.getLong("localtodo.notification-origin") == overdue) { "Overdue routine was missed" }

    // Calendar triggers normally compute tomorrow once today's time has passed.
    // Reconciliation must keep the persisted overdue occurrence instead.
    val daily = "local-todo:todo-alarm:qa-calendar:habit:1d"
    ids.add(daily)
    val clock = Calendar.getInstance().apply { add(Calendar.MINUTE, 2) }
    val dailyRequest = NotificationRequest(daily,
      NotificationContent.Builder().setTitle("Daily routine QA").build(),
      DailyTrigger("todo-alarms", clock.get(Calendar.HOUR_OF_DAY), clock.get(Calendar.MINUTE)),
    )
    delegate.scheduleNotification(dailyRequest)
    val dailyDue = System.currentTimeMillis() - 1000
    deadlines.edit().putLong(daily, dailyDue).commit()
    RoutineSchedulingDelegate(context).scheduleNotification(dailyRequest)
    check(deadlines.getLong(daily, 0) == dailyDue) { "Calendar resume skipped the pending occurrence" }
    delegate.triggerNotification(daily)
    Thread.sleep(1500)
    check(posted(daily).notification.extras.getLong("localtodo.notification-origin") == dailyDue)
    check(deadlines.getLong(daily, 0) > System.currentTimeMillis()) { "Calendar repeat did not advance" }
    delegate.removeScheduledNotifications(listOf(daily))

    // One wakeup delivers every due routine, coalescing old slots of the same todo.
    val old = "local-todo:todo-alarm:qa-coalesce:habit:9"
    val latest = "local-todo:todo-alarm:qa-coalesce:habit:12"
    val other = "local-todo:todo-alarm:qa-independent:habit:12"
    ids.addAll(listOf(old, latest, other))
    listOf(old, latest, other).forEach { delegate.scheduleNotification(request(it, it, System.currentTimeMillis() + 120000)) }
    val now = System.currentTimeMillis()
    deadlines.edit().putLong(old, now - 60000).putLong(latest, now - 1000).putLong(other, now - 1000).commit()
    delegate.triggerNotification(latest)
    Thread.sleep(1500)
    check(manager.activeNotifications.none { it.tag == old }) { "Delivered obsolete catch-up slot" }
    posted(latest)
    posted(other)
    delegate.removeScheduledNotifications(listOf(a, b, old, latest, other))
    delegate.triggerNotification(a)
    check(delegate.getScheduledNotification(a) == null) { "Cancelled routine resurrected" }
  }

  override fun onStart() {
    val context = targetContext
    val manager = context.getSystemService(NotificationManager::class.java)
    val originalZone = TimeZone.getDefault()
    val originalPaused = RoutineNotificationSettings.paused(context)
    val originalQuiet = RoutineNotificationSettings.quiet(context)
    val originalText = RoutineNotificationSettings.text(context)
    val ids = mutableListOf<String>()
    val result = Bundle()
    var resultCode = Activity.RESULT_OK
    try {
      manager.createNotificationChannel(NotificationChannel("todo-alarms", "Todo alarms", NotificationManager.IMPORTANCE_HIGH))
      verifyNotificationText(ids, manager)
      if (textOnly) {
        result.putString("stream", "PASS: native default/custom routine labels, hidden notes and expanded text, previews, and unchanged normal reminders.\n")
      } else {
      val utcHour = Calendar.getInstance(TimeZone.getTimeZone("UTC")).get(Calendar.HOUR_OF_DAY)
      // Change only this test process's calendar zone, never the device clock/settings.
      TimeZone.setDefault(SimpleTimeZone(-utcHour * 3_600_000, "QA midnight"))
      check(Calendar.getInstance().get(Calendar.HOUR_OF_DAY) == 0)
      val receiver = NotificationsService.findDesignatedBroadcastReceiver(context, android.content.Intent(NotificationsService.NOTIFICATION_EVENT_ACTION))
      check(receiver?.name == LocalTodoNotificationsService::class.java.name) { "Wrong notification receiver: ${receiver?.name}" }

      fun deliver(name: String, routine: Boolean, expected: Boolean, direct: Boolean = false, scheduled: Boolean = false) {
        val id = "local-todo:todo-alarm:qa-$name" + if (routine) ":habit:1d" else ""
        ids.add(id)
        manager.cancel(id, 0)
        val request = NotificationRequest(id,
          NotificationContent.Builder().setTitle("Quiet-hours QA: $name").setText("Native background delivery check").build(),
          DateTrigger("todo-alarms", System.currentTimeMillis() + 5500),
        )
        if (direct) NotificationsService.present(context, Notification(request))
        else if (scheduled) NotificationsService.schedule(context, request)
        else NotificationsService.receive(context, Notification(request))
        // Android clamps imminent alarms to its minimum futurity; allow actual delivery.
        Thread.sleep(if (scheduled) 8000 else 1500)
        val shown = manager.activeNotifications.any { it.tag == id }
        check(shown == expected) { "$name: expected presented=$expected but was $shown" }
        manager.cancel(id, 0)
      }

      RoutineNotificationSettings.save(context, false, true)
      deliver("night-routine", true, false, scheduled = true)
      deliver("night-direct-presentation", true, false, true)
      deliver("normal-night-reminder", false, true, scheduled = true)
      RoutineNotificationSettings.save(context, false, false)
      deliver("quiet-disabled", true, true)
      RoutineNotificationSettings.save(context, true, false)
      deliver("paused", true, false)
      TimeZone.setDefault(SimpleTimeZone((7 - utcHour) * 3_600_000, "QA morning"))
      RoutineNotificationSettings.save(context, false, true)
      deliver("morning-routine", true, true)
      verifyReliableScheduling(ids, manager)
      result.putString("stream", "PASS: background quiet hours, normal reminders, pause, simultaneous routines, preserved deadlines, overdue resume, duplicate callbacks, and stable history timestamps.\n")
      }
    } catch (error: Throwable) {
      result.putString("stream", "FAIL: ${error.stackTraceToString()}\n")
      resultCode = Activity.RESULT_CANCELED
    } finally {
      TimeZone.setDefault(originalZone)
      RoutineNotificationSettings.save(context, originalPaused, originalQuiet)
      RoutineNotificationSettings.saveText(context, originalText)
      ids.forEach { manager.cancel(it, 0) }
      RoutineSchedulingDelegate(context).removeScheduledNotifications(ids)
    }
    finish(resultCode, result)
  }
}
