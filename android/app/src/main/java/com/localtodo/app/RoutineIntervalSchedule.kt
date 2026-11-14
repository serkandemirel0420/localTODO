package com.localtodo.app

import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.triggers.TimeIntervalTrigger

fun preserveRoutineIntervalSchedule(
  request: NotificationRequest,
  previous: NotificationRequest?,
  quiet: Boolean,
): NotificationRequest {
  val trigger = request.trigger as? TimeIntervalTrigger ?: return request
  if (!RoutineNotificationPolicy.isRoutine(request.identifier)) return request
  val previousTrigger = previous?.trigger as? TimeIntervalTrigger
  val continuingTrigger = previousTrigger?.takeIf {
    it.timeInterval == trigger.timeInterval && it.isRepeating == trigger.isRepeating
  } ?: trigger
  val nextDate = continuingTrigger.nextTriggerDate() ?: return request
  return NotificationRequest(
    request.identifier,
    request.content,
    TimeIntervalTrigger(
      trigger.channelId,
      trigger.timeInterval,
      trigger.isRepeating,
      RoutineNotificationPolicy.allowedDate(nextDate, quiet),
    ),
  )
}
