# ATX GigaXtend XS update

Source: supplied ATX ANW2030 Rev. B, September 2023, pages 2, 4 and 6.

Select Typical or Maximum loss after entering amplifier readings. For each inline tap and the current tap, select ATX 2-, 4- or 8-port and the faceplate nominal value. Existing saved taps remain generic until their models are selected, because their port counts were not recorded.

The 24 manufacturer models have separate frequency-dependent IN-TAP and IN-OUT losses. Values at 250 MHz are linearly interpolated between 204 and 258 MHz; values at 1000 MHz between 834 and 1002 MHz. This is an estimate between datasheet points, not a manufacturer specification at the app's exact frequencies. Typical and maximum refer to the selected tap tables, not a complete statistical uncertainty bound for the run. Specifications are referenced to 20 degrees C.

Terminating models: 2-port 5 dB, 4-port 8 dB, and 8-port 11 dB. They have no OUT port. The app permits them as the current/end tap, shows N/A for THRU, and excludes them from inline choices.

Cable attenuation and splitter/DC presets are unchanged; this document does not provide replacements for them. Expected upstream TX estimates are now available; see TX-README.md for the baseline, return-loss assumptions and OFDMA reference limits.

The datasheet also lists tap cable simulators/equalizers. Their effect requires knowing which plug-in is installed and its signal path; they are not automatically applied. These calculations represent taps without an added conditioner loss. Return loss and isolation ratings are not path attenuation and are not subtracted from signal levels.

Upload all files including the new atx-data.js to the existing repository. No build step is needed. Login and the female-voice-preferred “Welcome” greeting remain.

Validation: all 24 models checked at both app frequencies with typical/maximum basis; interpolation spot checks, terminating tap handling, inline summation, selection filtering, saved model recovery, existing arithmetic and login regression tests pass. Physical device readings and audible playback are not independently validated.
