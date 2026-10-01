package com.akshaerp.akshaconnect

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.text.format.DateFormat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Calendar

class AkshaConnectDateTimePickerModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String =
    "AkshaConnectDateTimePicker"

  @ReactMethod
  fun pick(
    initialEpochMs: Double,
    promise: Promise,
  ) {
    val activity = reactApplicationContext.currentActivity

    if (activity == null) {
      promise.reject(
        "AKSHACONNECT_DATE_TIME_ACTIVITY_UNAVAILABLE",
        "The Android date and time picker is unavailable.",
      )
      return
    }

    val now =
      System.currentTimeMillis()

    val initial =
      Calendar.getInstance().apply {
        timeInMillis =
          if (
            initialEpochMs.isFinite() &&
            initialEpochMs > now
          ) {
            initialEpochMs.toLong()
          } else {
            now + 60L * 60L * 1000L
          }
      }

    activity.runOnUiThread {
      var completed = false

      fun resolveCancelled() {
        if (!completed) {
          completed = true
          promise.resolve(null)
        }
      }

      val dateDialog =
        DatePickerDialog(
          activity,
          { _, year, month, day ->
            val timeDialog =
              TimePickerDialog(
                activity,
                { _, hour, minute ->
                  if (completed) {
                    return@TimePickerDialog
                  }

                  val selected =
                    Calendar.getInstance().apply {
                      set(
                        year,
                        month,
                        day,
                        hour,
                        minute,
                        0,
                      )
                      set(
                        Calendar.MILLISECOND,
                        0,
                      )
                    }

                  if (
                    selected.timeInMillis <=
                    System.currentTimeMillis()
                  ) {
                    completed = true
                    promise.reject(
                      "AKSHACONNECT_DATE_TIME_IN_PAST",
                      "Choose a future date and time.",
                    )
                    return@TimePickerDialog
                  }

                  val result =
                    Arguments.createMap().apply {
                      putDouble(
                        "epoch_ms",
                        selected.timeInMillis.toDouble(),
                      )
                    }

                  completed = true
                  promise.resolve(result)
                },
                initial.get(
                  Calendar.HOUR_OF_DAY,
                ),
                initial.get(
                  Calendar.MINUTE,
                ),
                DateFormat.is24HourFormat(
                  activity,
                ),
              )

            timeDialog.setOnCancelListener {
              resolveCancelled()
            }

            timeDialog.show()
          },
          initial.get(
            Calendar.YEAR,
          ),
          initial.get(
            Calendar.MONTH,
          ),
          initial.get(
            Calendar.DAY_OF_MONTH,
          ),
        )

      dateDialog.datePicker.minDate =
        now

      dateDialog.setOnCancelListener {
        resolveCancelled()
      }

      dateDialog.show()
    }
  }
}
