#pragma once
#include <stdint.h>

// Clap It! | 10-bit rising-envelope ADC
constexpr uint16_t BASELINE = 80;
constexpr uint16_t SENSITIVITY_X100 = 100;
constexpr uint16_t CLAP_THRESHOLD = 180;
constexpr uint8_t RELEASE_PERCENT = 70;
constexpr uint32_t DEBOUNCE_MS = 180;
constexpr uint32_t GESTURE_GAP_MS = 600;
constexpr uint32_t COLOR_STEP_MS = 5000;
constexpr uint8_t BRIGHTNESS[3] = { 64, 153, 255 };
struct RGB { uint8_t r, g, b; };
constexpr RGB WHITE = {255, 221, 170};
constexpr RGB COLORS[3] = {
  { 255, 0, 0 },
  { 0, 255, 0 },
  { 0, 0, 255 }
};
// Sleep: 1 clap wakes at level 1.
// Brightness: 1 clap -> level 2 -> level 3 -> sleep.
// Awake: 3 claps start colors at the current brightness.
// Colors: 1 clap freezes the current color; 2 claps turn off.
// Gestures commit after GESTURE_GAP_MS without another clap.
// Other gestures are ignored. Brightness is global, RGB unscaled.
