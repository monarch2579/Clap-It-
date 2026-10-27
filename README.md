# Clap It! — Calibration Lab

A buildless sound-sensor calibration tool and lamp simulator with one Clap button, manual ADC input, microphone input, a simulated stream, and optional Arduino serial input.

## Lamp commands

| Current state | Consecutive claps | Response |
| --- | --- | --- |
| Sleeping | 1 | Wake in warm white at brightness level 1 |
| Sleeping | 2 or more | Wake directly into the RGB color cycle at level 1 |
| Brightness mode | 1 | Level 1 → level 2 → level 3 → sleep / LED off |
| Brightness mode | 3 or more | Start colors at the current brightness |
| Colors, cycling or paused | 1 | Pause at the current color, or resume from that exact color |
| Colors, cycling or paused | 2 or more | Sleep and turn off |

Two claps in brightness mode have no action. Commands are evaluated in the current mode: for example, four claps while sleeping start colors once; four claps while already in colors turn off once. Extra claps in one sequence never spill into a second command. Single claps do not adjust brightness in color mode.

The default RGB palette is red → green → blue. Each transition smoothly interpolates to the next color over five seconds. Pause holds the exact color indefinitely; resume continues the remaining transition without restarting. The palette and three brightness levels are editable. Warm white is used only in brightness mode.

## Human clap sequences

Clap consecutively at a normal rhythm, roughly 0.3–0.6 seconds between claps at the defaults. A 0.7-second quiet gap ends the sequence, executes its command once, and resets the count. Separate single claps never accumulate later. The interface shows the pending count, the time to finish, and confirmation that the sequence ended. Listening continues for the next command.

Sensor echo filtering defaults to 220 ms. The quiet gap is adjustable and must be longer than the minimum clap gap. The count saturates at 4+ internally, which preserves both the 3+ and 2+ command rules without unbounded counting.

## Inputs and calibration

- **Clap button:** each click explicitly records one clap, bypassing sensor threshold/debounce filtering. Click the same button multiple times in a row, then pause. The chart pulse is illustrative.
- **Manual:** enter a 0–1023 ADC reading. The detector assumes a rising-envelope signal: `max(0, reading - baseline) × sensitivity`. A crossing at the threshold counts once; the reading must return below 70% of the threshold to rearm. Echo filtering rejects repeats inside the minimum gap.
- **Microphone:** click Start microphone and grant browser permission. RMS amplitude maps to `baseline + RMS × 1023 × microphone gain`. Tune gain, sensitivity and threshold to separate room noise from claps. This detects amplitude; voices and other sharp sounds can trigger it. Audio is processed locally, never recorded or uploaded. Stop microphone, change source, or leave the page to release audio tracks. HTTPS or localhost is required.
- **Demo stream:** simulated sensor pulses; no microphone is used.
- **Arduino serial:** in supporting desktop browsers, connect at 115200 baud and send one integer reading per line with `Serial.println(reading)`. Close other serial monitors first. Arrival timing is for calibration, not high-frequency waveform analysis.

Configuration is stored in browser local storage under the v3 key. One-time migration retains v2 sensor calibration and updates timing defaults. Detection/timing edits and Clear session put the simulation to sleep. Brightness/palette edits preserve its current state. The preview approximates LED appearance and does not output to hardware.

## Run locally

No dependencies or build step are needed. From the project root:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Use HTTP rather than opening index.html directly, because the app uses JavaScript modules. With Node.js 18 or later, run `npm test`.

## Files

- `index.html`, `style.css` — interface, lamp illustration and responsive layout
- `app.mjs` — controls, live chart, preview and microphone/serial lifecycle
- `model.mjs` — sensor detection, gesture commands, color interpolation and C++ export
- `microphone.mjs` — RMS-to-ADC conversion
- `model.test.mjs` — 17 automated checks
- `firmware/ClapItConfig.h`, `firmware/ClapItController.h` — default non-blocking C++ controller

## Arduino integration

Include `ClapItController.h` in one sketch translation unit. Continuously call `updateLamp(rawReading, millis())`, then apply the returned global `.brightness` (0–255) and unscaled `.color.r/g/b` with your LED library. Use the website's copied configuration after calibration. Hardware pins and LED drivers belong in the sketch. Do not add blocking delays.

## Hosting and validation

Standalone files do not provide authentication. Access to the separate private Sites deployment is enforced by Sites. The GitHub version keeps its existing custom domain and root-level static layout; its Pages workflow deploys the current static web files.

Seventeen tests cover brightness steps, exact and state-dependent 2+/3+ gestures, mode separation, consecutive sequence boundaries, direct color wake, exact pause/resume, detector thresholds, microphone conversion and simulated audio gestures. The generated C++11 controller is compiled and checked against the same behavior. Physical microphone and Arduino input still need testing on the user's device.
