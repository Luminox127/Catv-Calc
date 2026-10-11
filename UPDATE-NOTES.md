# CATV Calc update — October 10, 2026

Open index.html to run the calculator, or replace the matching files on your existing web host. No build step is required. Original archive was left untouched.

## Verified fixes

- Reject negative cable lengths and current tap THRU losses; allow negative meter levels.
- Preserve decimal cable lengths and reject empty or malformed numeric input.
- Recover from malformed saved data and unavailable local storage.
- Remove duplicate touch/click and inline Start event handlers.
- Remove unused Copy/Clear buttons and an extra closing HTML tag; remove duplicate viewport metadata.
- Correct icon filenames and link the web app manifest.
- Use the same default THRU value for the initial 4 dB tap and tap selection.
- Clear the quick sum on Reset.
- Remove unsupported inline port/THRU_AFTER readings. The original estimates ignored cable/device positions and also reapplied upstream taps after the current tap.

## Calculation assumptions needing confirmation

AT TAP means a reading at the current tap INPUT. Listed cable, inline tap and device losses are downstream of its THRU output. A reading at the customer/drop port requires a different starting-level conversion.

UPSTREAM means a reading before all listed cable, inline tap and device losses; these are deducted before calculating the current tap input and outputs.

Cable attenuation presets, splitter/DC losses and default tap insertion losses are retained from the supplied application. They have not been verified against manufacturer/model specifications. Directional coupler losses depend on the chosen output; the existing DC presets represent the labeled loss, not a selectable THRU port. Splitter output selection and frequency-dependent device/tap losses are not modeled.

The -2 to +15 dBmV classification is retained and labeled as a reference range; it is not a validated acceptance criterion for every test point.

Accurate inline tap port estimates require an ordered component path, including cable between taps. The current wizard records separate lists, so those estimates are omitted.

## Validation

Run `node tests.cjs`. Checks cover arithmetic at 250/1000 MHz in both modes, fractional lengths, invalid input, corrupt saved state, blocked storage, quick sum/reset, event registration and icon references. JavaScript syntax check also passed. Full browser/device interaction has not been verified.

The service worker remains unregistered, matching the supplied app. Any older worker already installed on an existing host may need to be removed in the browser or hosting migration.
