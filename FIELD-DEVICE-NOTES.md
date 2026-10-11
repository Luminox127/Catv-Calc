# ATX field device update

Source: supplied ANW1402 Rev. D (08/2026), pages 3–4. The app now supports:

- XSC-2-04: 2-way splitter output.
- XSC-2-959: unbalanced 3-way, low-loss output or high-loss output.
- XSC-2-777: balanced 3-way output.
- XSC-2-08, XSC-2-12, XSC-2-16: THRU or coupled port.
- XSI-2-20: RF through path of the power inserter, not its AC injection port.

Choose the actual port on the signal path leading toward the current tap. Forward results subtract its insertion loss. TX estimates add its return-frequency insertion loss using passive reciprocity as an assumption. Manufacturer Typical/Maximum selection now applies to ATX taps and ATX field devices. Frequency values are linearly interpolated between table points; the same interpolation breakpoints are included in OFDMA range calculations.

Isolation and return-loss ratings are not subtracted as transmission loss. Internal amplifier-device presets are unchanged because this datasheet covers separate line passives, not the amplifier's internal parts.

The old generic field devices remain available under Other hardware / generic presets. They are not automatically converted to ATX parts because a saved name does not establish hardware model or output port. Fresh calculations start empty as requested.

An entered total return device loss overrides all internal/field device losses for TX only. If blank, ATX field losses are automatically added per frequency; any generic field/internal presets still require explicit opt-in. This avoids adding the same devices twice.

Upload the new passive-data.js together with app.js, tx.js, index.html, style.css and the other app files. The provided PDF is not redistributed in this package.

Tests cover all 11 valid field paths, exact datasheet spot checks, interpolation, both specification bases, forward loss sums, return TX sums, manual override and saved-model recovery. Existing tap, TX, login and refresh regression checks also pass. Browser visual layout and field-meter readings have not been independently verified.
