#include "../../1ESP32_Suni_v2/sleep_routine.h"
static_assert(suniSecondsUntilSleep(1, 21*3600, 1, 22*3600) == 3600, "one hour");
static_assert(suniInSleepWindow(3600), "inclusive start");
static_assert(!suniInSleepWindow(3601), "before window");
static_assert(!suniInSleepWindow(0), "exclusive bedtime");
static_assert(suniSecondsUntilSleep(7, 23*3600+30*60, 1, 30*60) == 3600, "Sunday to Monday");
static_assert(!suniInSleepWindow(suniSecondsUntilSleep(2, 21*3600, 1, 22*3600)), "never reuse yesterday");
constexpr int windows() {
  int count = 0;
  for (int i = 0; i < 3600; i += 300) if (suniSleepLightOn(i)) count++;
  return count;
}
constexpr bool checkEverySecond() {
  for (int i = 0; i < 3600; i++) {
    if (i % 300 >= 60 && suniSleepLightOn(i)) return false;
    if (i % 300 < 60 && suniSleepLightOn(i) != (i % 4 < 2)) return false;
  }
  return !suniSleepLightOn(-1) && !suniSleepLightOn(3600);
}
static_assert(windows() == 12, "12 blink intervals");
static_assert(checkEverySecond(), "2s on/off and 4 minutes rest");
