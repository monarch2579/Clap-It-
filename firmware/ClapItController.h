#pragma once
#include "ClapItConfig.h"

enum class Mode { Sleep, Brightness, Colors };
Mode mode = Mode::Sleep;
uint8_t level = 0, pending = 0;
bool latched = false, hasClap = false, paused = false, hasTick = false;
uint32_t lastClap = 0, lastGesture = 0, lastTick = 0, colorPhase = 0;
struct LampOutput { uint8_t brightness; RGB color; };

void applyGesture(uint8_t count) {
  if (mode == Mode::Sleep) {
    if (count == 1) { mode = Mode::Brightness; level = 0; }
  } else if (mode == Mode::Brightness) {
    if (count == 1) {
      if (level < 2) ++level; else mode = Mode::Sleep;
    } else if (count == 3) {
      mode = Mode::Colors; colorPhase = 0; paused = false;
    }
  } else if (count == 2) { mode = Mode::Sleep; paused = false; }
  else if (count == 1) paused = true;
}

uint8_t mixChannel(uint8_t a, uint8_t b, uint32_t phase) {
  return (uint32_t(a) * (COLOR_STEP_MS - phase) + uint32_t(b) * phase) / COLOR_STEP_MS;
}

// Call continuously: LampOutput out = updateLamp(raw, millis());
LampOutput updateLamp(uint16_t raw, uint32_t now) {
  uint32_t elapsed = hasTick ? uint32_t(now - lastTick) : 0;
  hasTick = true; lastTick = now;
  if (mode == Mode::Colors && !paused)
    colorPhase = (colorPhase + elapsed % (3 * COLOR_STEP_MS)) % (3 * COLOR_STEP_MS);
  if (pending && uint32_t(now - lastGesture) >= GESTURE_GAP_MS) {
    uint8_t count = pending; pending = 0; applyGesture(count);
  }
  uint32_t signal = uint32_t(raw > BASELINE ? raw - BASELINE : 0) * SENSITIVITY_X100;
  if (signal <= uint32_t(CLAP_THRESHOLD) * RELEASE_PERCENT) latched = false;
  if (signal >= uint32_t(CLAP_THRESHOLD) * 100 && !latched) {
    latched = true;
    if (!hasClap || uint32_t(now - lastClap) >= DEBOUNCE_MS) {
      hasClap = true; lastClap = now; lastGesture = now;
      if (pending < 4) ++pending;
    }
  }
  if (mode == Mode::Sleep) return {0, {0, 0, 0}};
  RGB color = WHITE;
  if (mode == Mode::Colors) {
    uint8_t i = colorPhase / COLOR_STEP_MS;
    uint32_t phase = colorPhase % COLOR_STEP_MS;
    RGB a = COLORS[i], b = COLORS[(i + 1) % 3];
    color = {mixChannel(a.r, b.r, phase), mixChannel(a.g, b.g, phase), mixChannel(a.b, b.b, phase)};
  }
  return {BRIGHTNESS[level], color};
}
// Apply returned global brightness and RGB with your LED library.
// No delay(): keep sampling, even while a color is paused.
