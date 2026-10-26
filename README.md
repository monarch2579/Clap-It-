# Clap It! — Calibration Lab

A private, buildless calibration bench for an Arduino sound-reactive lamp. Open `dist/index.html` through a static server. Run model checks with `npm test`.

## Calibration model

- Assumes a 10-bit, rising-envelope sound signal (0–1023 ADC), rather than a raw AC microphone waveform.
- Signal is `max(0, raw - baseline) × sensitivity`. A crossing at or above the threshold registers once; readings must return to 70% of the threshold to rearm. The minimum gap suppresses echoes.
- Claps younger than the rolling window determine the last matching range. A count below the first range turns the lamp off. Brightness (0–255) is global and RGB values are unscaled.
- Integer hundredths for sensitivity keep the JavaScript detector and generated C++ helper consistent. The helper uses unsigned elapsed-time arithmetic for `millis()` rollover.

## Inputs and persistence

Manual input holds a reading steady. Test clap produces a short pulse. Demo stream is explicitly simulated. Optional Web Serial requires a supporting desktop browser, 115200 baud, and one ADC integer per line; close other serial monitors before connecting. Serial timing is based on browser arrival time and is intended for calibration, not high-frequency waveform analysis.

Configuration is saved to this browser's local storage. Sensor readings stay in memory and are never sent to a server. The lamp is a visual approximation and does not drive hardware. Defaults are starting values, not measurements from a specific sensor.

The configuration and optional non-blocking detector helper can be copied separately. Paste the configuration first; apply the returned RGB and global brightness with the project's LED library. The website does not assign hardware pins or overwrite existing Arduino code.

## Run locally

No npm dependencies or build step are required. With Python 3 installed:

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000. Serve over HTTP rather than opening index.html directly, because the app uses JavaScript modules. Alternatively, run `npm run dev` (requires Python 3). Tests require Node.js 18 or later:

```sh
npm test
```

## Project files

- `dist/index.html` — interface and lamp illustration
- `dist/style.css` — responsive layout and visual styling
- `dist/app.mjs` — controls, chart, preview, serial input, persistence, and copying
- `dist/model.mjs` — detector rules, rate mapping, and C++ export
- `tests/model.test.mjs` — detector and configuration checks
- `.github/workflows/check.yml` — tests on pushes and pull requests; does not deploy a website

## Upload to GitHub

1. Create an empty GitHub repository. Choose **Private** if you want to keep the source private.
2. Extract this ZIP and upload the contents of the `clap-it-calibration` folder into the repository root. Include the `.github` folder and `.gitignore`.
3. Or, from this folder, use Git (replace the example repository URL with your own):

```sh
git init -b main
git add .
git commit -m "Add Clap It calibration lab"
git remote add origin https://github.com/YOUR_USERNAME/clap-it-calibration.git
git push -u origin main
```

## Hosting and privacy

This package contains the standalone website source, with no Sites project identity, credentials, Git history, or user sensor data. The existing private Sites deployment is unchanged.

Uploading a repository does not deploy this website. This package does not include an automatic publication workflow. If you choose to self-host later, serve `dist/` as the website root with a static host. There is no authentication in these standalone files; the original deployment's private access is enforced by Sites. A private repository alone does not add access control to a hosted website. Web Serial requires a supporting desktop browser and HTTPS or localhost.

## Validation

Detector tests cover threshold crossings, held signals, debounce, sensitivity, release boundaries, rolling-window expiration, range boundaries, and invalid configuration. The original implementation was also checked in a browser and its generated C++ helper compiled with C++11. Live Arduino serial input requires testing with physical hardware.
