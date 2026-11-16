package com.localtodo.app

import android.content.Context

object RoutineNotificationSettings {
  private fun preferences(context: Context) =
    context.getSharedPreferences("localtodo-routine-notifications", Context.MODE_PRIVATE)

  fun paused(context: Context): Boolean = preferences(context).getBoolean("paused", false)
  fun quiet(context: Context): Boolean = preferences(context).getBoolean("quiet", true)
  fun showContent(context: Context, routine: Boolean): Boolean =
    preferences(context).getBoolean(if (routine) "show-routine-content" else "show-item-content", false)
  fun saveContentVisibility(context: Context, routine: Boolean, item: Boolean): Boolean = preferences(context).edit()
    .putBoolean("show-routine-content", routine).putBoolean("show-item-content", item).commit()
  fun text(context: Context): String = preferences(context).getString("text", "Routine")
    ?.trim()?.takeIf { it.isNotEmpty() } ?: "Routine"

  fun saveText(context: Context, text: String): Boolean = preferences(context).edit()
    .putString("text", text.trim().take(120).ifEmpty { "Routine" }).commit()

  fun save(context: Context, paused: Boolean, quiet: Boolean): Boolean =
    preferences(context).edit().putBoolean("paused", paused).putBoolean("quiet", quiet).commit()
}
