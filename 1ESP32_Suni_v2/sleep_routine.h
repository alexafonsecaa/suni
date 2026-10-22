#pragma once

// Pure functions shared by the sketch and host-side boundary tests.
// ISO day belongs to the bedtime, including when the preparation is yesterday.
constexpr int suniSecondsUntilSleep(int nowDay, int nowSeconds, int sleepDay, int sleepSeconds) {
  const int week = 7 * 86400;
  const int now = (nowDay - 1) * 86400 + nowSeconds;
  const int target = (sleepDay - 1) * 86400 + sleepSeconds;
  return (target - now + week) % week;
}

constexpr bool suniInSleepWindow(int remaining) {
  return remaining > 0 && remaining <= 3600;
}

constexpr bool suniSleepLightOn(int elapsedSeconds) {
  // 12 windows: [0,60), [300,360), ... [3300,3360).
  // Slow blink: 2 seconds on / 2 seconds off, with the existing PWM fade.
  return elapsedSeconds >= 0 && elapsedSeconds < 3600 &&
         elapsedSeconds % 300 < 60 && elapsedSeconds % 4 < 2;
}
