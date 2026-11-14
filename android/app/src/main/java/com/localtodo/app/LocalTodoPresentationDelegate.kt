package com.localtodo.app

import android.content.Context
import android.service.notification.StatusBarNotification
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationBehaviorRecord
import expo.modules.notifications.service.delegates.ExpoPresentationDelegate
import java.util.Date

/** Keep receipt, tray readback, and tap response tied to the same history entry. */
class LocalTodoPresentationDelegate(context: Context) : ExpoPresentationDelegate(context) {
  private val originKey = "localtodo.notification-origin"
  private val appContext = context.applicationContext

  override suspend fun createNotification(notification: Notification, notificationBehavior: NotificationBehaviorRecord?): android.app.Notification {
    val built = super.createNotification(notification, notificationBehavior)
    val identifier = notification.notificationRequest.identifier
    val routine = RoutineNotificationPolicy.isRoutine(identifier) || identifier.startsWith("local-todo:routine-preview:")
    val presented = if (routine || identifier.startsWith("local-todo:todo-alarm:")) {
      val text = if (routine) RoutineNotificationSettings.text(appContext) else "Reminder"
      listOf(
        android.app.Notification.EXTRA_BIG_TEXT,
        android.app.Notification.EXTRA_TITLE_BIG,
        android.app.Notification.EXTRA_SUMMARY_TEXT,
        android.app.Notification.EXTRA_TEXT_LINES,
        android.app.Notification.EXTRA_TEMPLATE,
      ).forEach { built.extras.remove(it) }
      android.app.Notification.Builder.recoverBuilder(appContext, built)
        .setContentTitle(text)
        .setContentText(null)
        .setStyle(null)
        .setTicker(text)
        .build()
    } else {
      built
    }
    presented.extras.putLong(originKey, notification.originDate.time)
    return presented
  }

  override fun getNotification(statusBarNotification: StatusBarNotification): Notification? {
    val notification = super.getNotification(statusBarNotification) ?: return null
    val origin = statusBarNotification.notification.extras.getLong(originKey, notification.originDate.time)
    return Notification(notification.notificationRequest, Date(origin))
  }
}
