package com.localtodo.app

import android.content.Context
import android.content.Intent
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.interfaces.PresentationDelegate
import expo.modules.notifications.service.interfaces.SchedulingDelegate
import java.util.Calendar

/** Keep Expo's storage, rescheduling and tap handling, with a delivery-time routine guard. */
class LocalTodoNotificationsService : NotificationsService() {
  private fun shouldSuppress(context: Context, intent: Intent): Boolean {
    val notification = intent.getParcelableExtra<Notification>(NOTIFICATION_KEY) ?: return false
    return RoutineNotificationPolicy.shouldSuppress(
      notification.notificationRequest.identifier,
      RoutineNotificationSettings.paused(context),
      RoutineNotificationSettings.quiet(context),
      Calendar.getInstance().get(Calendar.HOUR_OF_DAY),
    )
  }

  override fun onReceiveNotification(context: Context, intent: Intent) {
    if (!shouldSuppress(context, intent)) super.onReceiveNotification(context, intent)
  }

  override fun onPresentNotification(context: Context, intent: Intent) {
    if (!shouldSuppress(context, intent)) super.onPresentNotification(context, intent)
  }

  override fun getPresentationDelegate(context: Context): PresentationDelegate =
    LocalTodoPresentationDelegate(context)

  override fun getSchedulingDelegate(context: Context): SchedulingDelegate =
    RoutineSchedulingDelegate(context)
}
