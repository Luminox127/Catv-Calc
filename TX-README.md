# Expected TX at tap

Results now include expected transmit levels for 18.2, 24.6, 31.0 and 37.4 MHz, and path-loss-based ranges over 25.4–40 and 41.1–87.9 MHz. Measured amp test-point TX defaults to 34 dBmV for all six channels and is editable. The app assumes FWD OUT / REV INJ has 20 dB injection loss with meter compensation OFF.

Formula: TX at tap port = measured amp test-point TX - 20 dB + return cable loss + inline tap IN-OUT loss + return device loss + current tap IN-TAP loss. This is a passive-path estimate using the corrected mainline reference for that uncompensated injection point. It does not model ranging targets, active return gain, transmitter limits or CMTS settings.

ATX losses use the supplied ANW2030 tables, selected Typical/Maximum basis, and linear interpolation. Reverse passive-path transmission uses the corresponding forward insertion loss as a reciprocity assumption. Terminating taps still have a tap port and can produce TX estimates.

Return cable presets (dB/100 ft at 20°C) support P3-500/625/750/875, QR540, RG6 and RG11. Linear interpolation is used between published points. RG59 TX is unavailable rather than substituting an unsupported loss curve. P3/QR cable construction and RG6/F6, RG11/F11 matching should be verified against the installed cable.

Cable sources:
- CommScope Cable Technician Pocket Guide, P3 table (printed section 6-9): https://www.commscope.com/globalassets/digizuite/1695-cable-technician-pocket-guide.pdf
- CommScope-authored QR540 JCASS datasheet: https://vectortechsolutions.com/wp-content/uploads/import/files/89/5544502_qr_540_jcass.pdf
- CommScope Drop Construction Manual, F6/F11 attenuation table: https://pt.commscope.com/globalassets/digizuite/2422-drop-const-manual-co-107145.pdf

The optional return device total replaces the summed internal/field device estimates for TX only. It must include all return splitter/DC losses and any additional pads/conditioners that are not otherwise modeled. It is applied as a flat loss across the selected channels. If these losses vary with frequency, the flat total is an approximation. Without a supplied total, listed devices require explicit opt-in to their existing flat presets. Generic taps also require opt-in to nominal tap and existing THRU losses. Forward RF calculations are unaffected.

OFDMA output is the range of baseline-plus-path-loss values across frequency, including interior table breakpoints. It uses the same meter power reference as the supplied baseline. It is not a prediction/conversion of integrated OFDMA channel power or PSD; compare only readings with matching normalization. No TX acceptance thresholds are imposed.

Refresh resets the TX baseline and options along with the rest of the calculation. Upload tx.js with the other app files.

Validation: baseline/loss arithmetic, unit scaling, interpolation, band extrema, manual return device total, explicit generic assumptions, missing cable specs, terminal tap TX and reset checked with automated tests. Existing forward calculations, ATX tables, login and refresh checks pass. Live meter readings have not been calibrated against these estimates.
