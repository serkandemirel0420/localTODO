package com.localtodo.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.uimanager.ViewManager
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private data class WidgetTodoItem(
  val id: String,
  val title: String,
  val dateKeys: Set<String>,
  val pinned: Boolean,
  val createdAt: Long,
)

private object LocalTodoWidgetStore {
  private const val PREFERENCES_NAME = "local_todo_widgets"
  private const val ITEMS_KEY = "items"

  fun replaceItems(context: Context, readableItems: ReadableArray) {
    val items = JSONArray()

    for (index in 0 until readableItems.size()) {
      val readableItem = readableItems.getMap(index) ?: continue
      val id = readableItem.getString("id")?.trim().orEmpty()
      val title = readableItem.getString("title")?.trim().orEmpty()
      if (id.isEmpty() || title.isEmpty()) {
        continue
      }

      val dateKeys = JSONArray()
      val readableDateKeys = readableItem.getArray("dateKeys")
      if (readableDateKeys != null) {
        for (dateIndex in 0 until readableDateKeys.size()) {
          val dateKey = readableDateKeys.getString(dateIndex)?.trim().orEmpty()
          if (dateKey.isNotEmpty()) {
            dateKeys.put(dateKey)
          }
        }
      }

      items.put(JSONObject().apply {
        put("id", id)
        put("title", title)
        put("dateKeys", dateKeys)
        put("pinned", readableItem.hasKey("pinned") && readableItem.getBoolean("pinned"))
        put(
          "createdAt",
          if (readableItem.hasKey("createdAt")) readableItem.getDouble("createdAt").toLong() else 0L,
        )
      })
    }

    context
      .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(ITEMS_KEY, items.toString())
      .apply()
  }

  fun loadItems(context: Context): List<WidgetTodoItem> {
    val rawItems = context
      .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
      .getString(ITEMS_KEY, "[]")
      .orEmpty()

    return try {
      val items = JSONArray(rawItems)
      buildList {
        for (index in 0 until items.length()) {
          val item = items.optJSONObject(index) ?: continue
          val id = item.optString("id").trim()
          val title = item.optString("title").trim()
          if (id.isEmpty() || title.isEmpty()) {
            continue
          }

          val rawDateKeys = item.optJSONArray("dateKeys") ?: JSONArray()
          val dateKeys = buildSet {
            for (dateIndex in 0 until rawDateKeys.length()) {
              val dateKey = rawDateKeys.optString(dateIndex).trim()
              if (dateKey.isNotEmpty()) {
                add(dateKey)
              }
            }
          }

          add(
            WidgetTodoItem(
              id = id,
              title = title,
              dateKeys = dateKeys,
              pinned = item.optBoolean("pinned", false),
              createdAt = item.optLong("createdAt", 0L),
            ),
          )
        }
      }
    } catch (_: Exception) {
      emptyList()
    }
  }
}

private object LocalTodoWidgetUpdater {
  private const val MAX_TODAY_ROWS = 6

  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val newItemIds = manager.getAppWidgetIds(
      ComponentName(context, NewItemWidgetProvider::class.java),
    )
    NewItemWidgetProvider.updateWidgets(context, manager, newItemIds)

    val todayIds = manager.getAppWidgetIds(
      ComponentName(context, TodayWidgetProvider::class.java),
    )
    TodayWidgetProvider.updateWidgets(context, manager, todayIds)
  }

  fun updateNewItemWidget(
    context: Context,
    manager: AppWidgetManager,
    appWidgetId: Int,
  ) {
    val views = RemoteViews(context.packageName, R.layout.widget_new_item)
    views.setOnClickPendingIntent(
      R.id.widget_new_item_root,
      createAppPendingIntent(context, appWidgetId, "new-item"),
    )
    manager.updateAppWidget(appWidgetId, views)
  }

  fun updateTodayWidget(
    context: Context,
    manager: AppWidgetManager,
    appWidgetId: Int,
  ) {
    val todayKey = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    val items = LocalTodoWidgetStore
      .loadItems(context)
      .filter { item -> item.dateKeys.contains(todayKey) }
      .sortedWith(
        compareByDescending<WidgetTodoItem> { it.pinned }
          .thenByDescending { it.createdAt },
      )

    val views = RemoteViews(context.packageName, R.layout.widget_today)
    val openTodayIntent = createAppPendingIntent(context, appWidgetId, "today")
    views.setOnClickPendingIntent(R.id.widget_today_header, openTodayIntent)
    views.setOnClickPendingIntent(R.id.widget_today_empty, openTodayIntent)
    views.setTextViewText(
      R.id.widget_today_count,
      context.resources.getQuantityString(
        R.plurals.widget_today_item_count,
        items.size,
        items.size,
      ),
    )
    views.removeAllViews(R.id.widget_today_rows)

    if (items.isEmpty()) {
      views.setViewVisibility(R.id.widget_today_rows, View.GONE)
      views.setViewVisibility(R.id.widget_today_empty, View.VISIBLE)
    } else {
      views.setViewVisibility(R.id.widget_today_rows, View.VISIBLE)
      views.setViewVisibility(R.id.widget_today_empty, View.GONE)
      val rowLimit = resolveVisibleRowCount(manager, appWidgetId)

      items.take(rowLimit).forEachIndexed { index, item ->
        val row = RemoteViews(context.packageName, R.layout.widget_today_row)
        row.setTextViewText(R.id.widget_today_row_title, item.title)
        row.setOnClickPendingIntent(
          R.id.widget_today_row_root,
          createAppPendingIntent(context, appWidgetId * 100 + index + 1, "today", item.id),
        )
        views.addView(R.id.widget_today_rows, row)
      }
    }

    manager.updateAppWidget(appWidgetId, views)
  }

  private fun resolveVisibleRowCount(manager: AppWidgetManager, appWidgetId: Int): Int {
    val minHeight = manager.getAppWidgetOptions(appWidgetId)
      .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 180)

    return when {
      minHeight < 145 -> 2
      minHeight < 185 -> 3
      minHeight < 225 -> 4
      minHeight < 265 -> 5
      else -> MAX_TODAY_ROWS
    }
  }

  private fun createAppPendingIntent(
    context: Context,
    requestCode: Int,
    route: String,
    todoId: String? = null,
  ): PendingIntent {
    val uri = Uri.Builder()
      .scheme(context.packageName)
      .authority("widget")
      .appendPath(route)
      .apply {
        if (todoId != null) {
          appendQueryParameter("id", todoId)
        }
      }
      .build()
    val intent = Intent(Intent.ACTION_VIEW, uri, context, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }

    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}

class LocalTodoWidgetModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "LocalTodoWidget"

  @ReactMethod
  fun syncItems(items: ReadableArray, promise: Promise) {
    try {
      LocalTodoWidgetStore.replaceItems(reactContext, items)
      LocalTodoWidgetUpdater.updateAll(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_WIDGET_SYNC", "Could not update Local Todo widgets.", error)
    }
  }
}

class LocalTodoWidgetPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(LocalTodoWidgetModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}

class NewItemWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    updateWidgets(context, appWidgetManager, appWidgetIds)
  }

  companion object {
    fun updateWidgets(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetIds: IntArray,
    ) {
      appWidgetIds.forEach { appWidgetId ->
        LocalTodoWidgetUpdater.updateNewItemWidget(context, appWidgetManager, appWidgetId)
      }
    }
  }
}

class TodayWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    updateWidgets(context, appWidgetManager, appWidgetIds)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle,
  ) {
    LocalTodoWidgetUpdater.updateTodayWidget(context, appWidgetManager, appWidgetId)
  }

  companion object {
    fun updateWidgets(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetIds: IntArray,
    ) {
      appWidgetIds.forEach { appWidgetId ->
        LocalTodoWidgetUpdater.updateTodayWidget(context, appWidgetManager, appWidgetId)
      }
    }
  }
}
