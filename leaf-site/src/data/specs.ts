/**
 * Every product statement the site shows comes from this file. Each one carries a status and a
 * source. docs/SPECS.md mirrors this list; keep them in step (tests/specs.spec.ts checks it).
 *
 * Confirmed = measured or decided · Datasheet = from the part's datasheet ·
 * Estimated = CAD model output, never physically measured · Planned = intended, not built ·
 * In development = being written, not yet run on Leaf hardware.
 */
export type SpecStatus = 'Confirmed' | 'Datasheet' | 'Estimated' | 'Planned' | 'In development'

export interface Spec {
  id: string
  group: 'Status' | 'Display' | 'Size and weight' | 'Electronics' | 'Power' | 'Attachment' | 'Enclosure' | 'Software' | 'App'
  label: string
  value: string
  status: SpecStatus
  src: string
}

export const SPECS: Spec[] = [
  // Status
  { id: 'status-build', group: 'Status', label: 'Hardware', value: 'No device has been built or run on hardware yet', status: 'Confirmed', src: 'Proxima project status' },
  { id: 'status-board', group: 'Status', label: 'Board 1 (rev 4)', value: 'Designed and DRC-clean, not yet ordered', status: 'Confirmed', src: 'rev4 board design' },
  { id: 'status-date', group: 'Status', label: 'Ship date and price', value: 'Not set. We won’t give a date until it is ready', status: 'Confirmed', src: 'Proxima project status' },
  { id: 'status-maker', group: 'Status', label: 'Designed by', value: 'Proxima LLC, Arizona', status: 'Confirmed', src: 'Proxima project status' },

  // Display
  { id: 'display-size', group: 'Display', label: 'Screen', value: '3.97″ monochrome e-paper', status: 'Datasheet', src: 'Good Display GDEY0397T81P datasheet' },
  { id: 'display-res', group: 'Display', label: 'Resolution', value: '480 × 800 pixels, portrait', status: 'Datasheet', src: 'Good Display GDEY0397T81P datasheet' },
  { id: 'display-active', group: 'Display', label: 'Active area', value: '51.84 × 86.40 mm', status: 'Datasheet', src: 'Good Display GDEY0397T81P datasheet' },
  { id: 'display-panel', group: 'Display', label: 'Panel', value: 'Good Display GDEY0397T81P', status: 'Datasheet', src: 'Good Display GDEY0397T81P datasheet' },
  { id: 'display-unlit', group: 'Display', label: 'Lighting', value: 'Board 1 is unlit (no front light)', status: 'Confirmed', src: 'rev4 board design' },
  { id: 'display-frontlight', group: 'Display', label: 'Front light', value: 'Planned / under evaluation', status: 'Planned', src: 'rev4 CAD front-lit variant; lit-panel quote pending' },
  { id: 'display-touch', group: 'Display', label: 'Touch', value: 'No touchscreen. Four physical buttons', status: 'Confirmed', src: 'design decision, Nov 13 2026' },

  // Size and weight
  { id: 'size-skin', group: 'Size and weight', label: 'Size with rear skin', value: '64.19 × 102.02 × 8.47 mm (CAD estimate)', status: 'Estimated', src: 'rev4 CAD report' },
  { id: 'size-core', group: 'Size and weight', label: 'Core body', value: '62.69 × 100.52 × 7.87 mm (CAD estimate)', status: 'Estimated', src: 'rev4 CAD report' },
  { id: 'size-thin', group: 'Size and weight', label: 'Thickness', value: 'About 8.5 mm thin (CAD estimate)', status: 'Estimated', src: 'rev4 CAD report' },
  { id: 'size-mass', group: 'Size and weight', label: 'Weight', value: 'About 62 g with skin (CAD estimate)', status: 'Estimated', src: 'rev4 CAD report' },
  { id: 'size-corner', group: 'Size and weight', label: 'Corner radius', value: '3.5 mm (CAD estimate)', status: 'Estimated', src: 'rev4 CAD report' },

  // Electronics
  { id: 'elec-mcu', group: 'Electronics', label: 'Processor', value: 'ESP32-C3 module (ESP32-C3-MINI-1-H8X, 8 MB) with Wi-Fi', status: 'Confirmed', src: 'rev4 board design (unverified on hardware)' },
  { id: 'elec-pcb', group: 'Electronics', label: 'Board', value: '0.8 mm custom PCB', status: 'Confirmed', src: 'rev4 board design (unverified on hardware)' },
  { id: 'elec-sd', group: 'Electronics', label: 'Storage', value: 'microSD slot; you supply the card', status: 'Confirmed', src: 'rev4 board design, Molex 104031' },
  { id: 'elec-usb', group: 'Electronics', label: 'Port', value: 'USB-C for charging and data, bottom edge', status: 'Confirmed', src: 'rev4 board design, GCT USB4110' },
  { id: 'elec-charger', group: 'Electronics', label: 'Charging', value: 'TI BQ21040 charger with battery-temperature protection', status: 'Confirmed', src: 'rev4 board design (unverified on hardware)' },
  { id: 'elec-buttons', group: 'Electronics', label: 'Buttons', value: 'Four: BACK and PREV on the left, SELECT and NEXT on the right', status: 'Confirmed', src: 'rev4 CAD button layout' },

  // Power
  { id: 'power-battery', group: 'Power', label: 'Battery', value: '1000 mAh battery (selected cell, subject to change)', status: 'Planned', src: 'YDL 504040 selection; supplier replied, not ordered' },

  // Attachment
  { id: 'attach-ring', group: 'Attachment', label: 'Magnetic attachment', value: 'MagSafe-pattern magnetic ring, so it can snap to the back of a phone or a magnetic mount', status: 'Confirmed', src: 'rev4 CAD ring, 54 mm OD / 46 mm ID / 2.0 mm' },

  // Enclosure
  { id: 'enc-skin', group: 'Enclosure', label: 'Rear skin', value: '0.6 mm snap-on rear skin', status: 'Confirmed', src: 'rev4 CAD rear skin' },
  { id: 'enc-finish', group: 'Enclosure', label: 'Finishes', value: 'Copper and Slate (concept renders)', status: 'Planned', src: 'rev4 CAD renders' },
  { id: 'enc-material', group: 'Enclosure', label: 'Materials', value: 'Prototypes are 3D-printed; production materials undecided', status: 'Confirmed', src: 'Proxima project status' },

  // Software
  { id: 'sw-base', group: 'Software', label: 'Firmware', value: 'Based on the open-source CrossPoint e-reader firmware', status: 'In development', src: 'Leaf firmware plan (not yet run on Leaf hardware)' },
  { id: 'sw-epub', group: 'Software', label: 'Books', value: 'Designed for EPUB with reflowable text, stored on microSD', status: 'In development', src: 'Leaf firmware plan' },
  { id: 'sw-type', group: 'Software', label: 'Typography', value: 'Designed for adjustable fonts, size and margins, with custom fonts from microSD', status: 'In development', src: 'Leaf firmware plan' },
  { id: 'sw-notes', group: 'Software', label: 'Notes', value: 'Designed for bookmarks, highlights and notes saved on the device', status: 'In development', src: 'Leaf firmware plan' },
  { id: 'sw-upload', group: 'Software', label: 'Transfer', value: 'Designed for wireless book upload over Wi-Fi', status: 'In development', src: 'Leaf firmware plan' },
  { id: 'sw-offline', group: 'Software', label: 'Offline', value: 'Designed for fully offline reading', status: 'In development', src: 'Leaf firmware plan' },

  // App
  { id: 'app-live', group: 'App', label: 'SAGA Reader app', value: 'Live on the web; Android test build exists', status: 'Confirmed', src: 'saga.proxima-3d.com/saga-reader.html' },
  { id: 'app-sync', group: 'App', label: 'Leaf ↔ app sync', value: 'Planned, not working on hardware', status: 'Planned', src: 'SAGA Reader Devices screen (simulated Leaf only)' },
]

export const spec = (id: string): Spec => {
  const s = SPECS.find(x => x.id === id)
  if (!s) throw new Error('unknown spec ' + id)
  return s
}

/** Short callout strings used by the homepage scenes. Each points at a spec above. */
export const CALLOUTS = {
  display: { text: '3.97″ e-paper, 480 × 800', spec: 'display-size', src: 'Good Display GDEY0397T81P datasheet' },
  buttons: { text: 'Four physical buttons. No touchscreen', spec: 'elec-buttons', src: 'rev4 CAD button layout' },
  ports: { text: 'USB-C and microSD', spec: 'elec-usb', src: 'rev4 board design' },
  ring: { text: 'MagSafe-pattern magnetic ring', spec: 'attach-ring', src: 'rev4 CAD ring' },
  thin: { text: 'About 8.5 mm thin (CAD estimate)', spec: 'size-thin', src: 'rev4 CAD report' },
} as const
