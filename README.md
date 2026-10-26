# Clap It! — Calibration Lab

A buildless calibration bench for an Arduino sound-reactive lamp. Serve the repository root through a static server. Run model checks with `npm test`.

## Lamp commands

| State | Gesture | Response |
| --- | --- | --- |
| Sleeping | Single clap | Wake at low brightness |
| Brightness | Single clap | Low → medium → high → sleep (LED off) |
| Brightness, awake | Triple clap | Enter RGB cycle at current brightness |
| Color cycle | Single clap | Freeze the current color; further single claps keep it frozen |
| Color cycle, including paused | Double clap | Sleep and turn LED off |

Other gestures, including double/triple claps while asleep, are ignored. Four or more claps in one gesture are ignored. The RGB palette defaults to red → green → blue, interpolating continuously over five seconds to each next color. Brightness mode uses warm white. Color mode retains the brightness level from before activation.

## Calibration model

- Assumes a 10-bit, rising-envelope signal (0–1023 ADC), not an unprocessed AC microphone waveform.
- Signal is `max(0, raw - baseline) × sensitivity`. A threshold crossing registers once; the reading must drop to 70% of the threshold to rearm. Debounce rejects echoes.
- The gesture is committed after 600 ms without another accepted clap (adjustable). Until then, individual claps do not change the lamp state. The minimum clap gap must be shorter than this quiet gap.
- The lamp state persists; it does not turn off because a count window expires. Calibration timing changes and Clear session reset the simulation to sleep.
- Brightness and palette edits update the current preview without resetting the state.

## Inputs and persistence

Manual input holds a reading steady. One Clap button records one clap per click, including rapid clicks. Click the same button twice or three times before the gesture quiet gap expires to issue those commands. Each click shows an illustrative chart pulse. Threshold and debounce filtering apply to manual and serial sensor readings; explicit button clicks bypass these filters. The demo stream still simulates sensor pulses. Demo stream is explicitly simulated. Optional Web Serial requires a supporting desktop browser, 115200 baud, and one ADC integer per line; close other serial monitors before connecting. Serial timing is based on browser arrival time and is intended for calibration, not high-frequency waveform analysis.

Settings use the v2 storage key; the previous rate-mapping configuration is not reused. Configuration is saved to this browser's local storage. Sensor readings stay in memory and are never sent to a server. The lamp is a visual approximation and does not drive hardware. Defaults are starting values, not measurements from a specific sensor.

The configuration and optional non-blocking detector helper can be copied separately. Paste the configuration first; apply the returned RGB and global brightness with the project's LED library. The website does not assign hardware pins or overwrite existing Arduino code.

## Run locally

No dependencies or build step are required. With Python 3 installed, run `python3 -m http.server 8000` (or `npm run dev`) from the repository root and open http://localhost:8000. Serve over HTTP rather than opening index.html directly, because the app uses JavaScript modules. Run `npm test` with Node.js 18 or later.

## Files and hosting

The site uses the existing root-level layout: `index.html`, `style.css`, `app.mjs`, `model.mjs`, and `microphone.mjs`. Tests live in `model.test.mjs`; the GitHub Actions workflow runs tests and syntax checks without deployment steps. The existing CNAME remains unchanged.

Standalone files have no authentication. The separate private Sites deployment keeps its existing access controls. No Sites identity, credentials, sensor readings, or captured audio are included in this repository.

## Arduino/C++ files

`firmware/ClapItConfig.h` and `firmware/ClapItController.h` contain the default configuration and hardware-independent non-blocking controller. Include `ClapItController.h` in one sketch translation unit, then call `updateLamp(rawReading, millis())` continuously. Apply the returned `.brightness` (0–255, global) and `.color.r/g/b` (unscaled RGB) with your LED library. Replace the configuration with the website's copied values after calibration. Pins and LED drivers depend on your hardware and are intentionally left to the sketch.

The C++ controller was compiled with C++11 and checked for brightness sequencing, blended RGB values, exact color holding, repeated pause commands, shutdown, and unsigned `millis()` rollover. Physical Arduino input remains untested.

## Microphone mode

Click **Start microphone**, grant browser permission, and clap near the microphone. Audio is processed locally with Web Audio and is not recorded or uploaded. RMS amplitude is converted into the sensor's ADC scale (baseline + RMS × 1023 × gain). The default microphone gain is 8×; adjust it and the existing threshold/sensitivity to separate room noise from claps. The same debounce and gesture controller drive the lamp. This is amplitude-based detection, so speech and other sharp sounds can trigger it. Press **Stop microphone**, select another source, or leave the page to stop the audio tracks. Microphone access requires HTTPS or localhost.

The command modes are exclusive: color-mode single claps never increase brightness, including when paused. Triple claps cannot wake a sleeping lamp and have no action once already in colors. To leave a paused color, double-clap to turn off, then single-clap to wake in brightness mode.
