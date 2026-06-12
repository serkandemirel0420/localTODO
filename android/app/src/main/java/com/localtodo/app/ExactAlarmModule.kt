package com.localtodo.app

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ExactAlarmModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "LocalTodoExactAlarm"

  @ReactMethod
  fun canScheduleExactAlarms(promise: Promise) {
    try {
      promise.resolve(canScheduleExactAlarms())
    } catch (error: Exception) {
      promise.reject("E_EXACT_ALARM_CHECK", "Could not check exact alarm access.", error)
    }
  }

  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    try {
      val intent = createExactAlarmSettingsIntent()
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_EXACT_ALARM_SETTINGS", "Could not open exact alarm settings.", error)
    }
  }

  private fun canScheduleExactAlarms(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return true
    }

    val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return alarmManager.canScheduleExactAlarms()
  }

  private fun createExactAlarmSettingsIntent(): Intent {
    val packageUri = Uri.parse("package:${reactContext.packageName}")
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, packageUri)
    } else {
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri)
    }

    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (intent.resolveActivity(reactContext.packageManager) != null) {
      return intent
    }

    return Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
  }
}
