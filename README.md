# Mobile Note Highway

[![GitHub release](https://img.shields.io/github/v/release/saleemk/slopsmith-plugin-mobile-note-highway)](https://github.com/saleemk/slopsmith-plugin-mobile-note-highway/releases)

A touch-optimized note highway player plugin for [Slopsmith](https://github.com/slopsmith/slopsmith) that transforms the player experience on phones and tablets. Collapsible controls, organized expanded sections, intuitive gestures with live audio feedback, and device-adaptive layouts let you focus on playing.

**Tested on iOS (portrait mode).** Android should work and likely has native touch feedback, but hasn't been verified.

### Phone View

<img width="300" alt="Phone collapsed view" src="https://github.com/user-attachments/assets/34e07d52-5f16-4c87-8c00-c3c9c014060a" />&nbsp;&nbsp;&nbsp;&nbsp;<img width="300" alt="Phone expanded view" src="https://github.com/user-attachments/assets/fac98333-00ae-4143-b65b-ea6bbdcd0dcc" />

*Collapsed view shows essentials (back, play, arrangement). Swipe up to reveal the organized expanded controls.*

### Tablet View

<img width="400" alt="Tablet collapsed view" src="https://github.com/user-attachments/assets/e27acd3e-6b04-4901-93d5-869ed30d7918" /> <img width="400" alt="Tablet expanded view" src="https://github.com/user-attachments/assets/b52f36c7-dc12-429c-9fa9-c7cb1e6062c2" />

*Collapsed view includes difficulty and speed sliders. Expanded view reveals full control panel with proper spacing.*

## Features

- **Collapsible controls** - Swipe up/down to show/hide advanced tools. Only essentials visible by default.
- **Organized expanded controls** - Expanded mode groups controls into Playback, Sliders, Practice, Stems, and More controls sections.
- **More controls accordion** - Secondary display and plugin actions stay tucked away until needed.
- **Swipe up/down on highway** - Scrub through the song by dragging vertically with live highway preview - matches the natural flow of notes scrolling toward you
- **Tap to play/pause** - Single tap anywhere on the highway
- **Double tap to loop** - Set A/B loop markers with double taps (A → B → Clear)
- **Drag-to-scrub section map** - Touch and drag the section map for instant navigation with live highway preview

## Installation

**Current version: v1.1.3** — Organized expanded controls, More controls accordion, Stems row support, and improved phone/tablet layouts. See [Releases](https://github.com/saleemk/slopsmith-plugin-mobile-note-highway/releases) for full changelog.

### Manual Installation

1. Navigate to your Slopsmith `plugins/` directory
2. Clone this repo:
   ```bash
   cd plugins/
   git clone https://github.com/saleemk/slopsmith-plugin-mobile-note-highway.git mobile_note_highway
   ```
3. Restart Slopsmith (or reload the page)
4. Check logs for: `Registered plugin 'mobile_note_highway' (Mobile Note Highway)`

### Docker Installation

If you're running Slopsmith in Docker, clone into the bind-mounted plugins directory:
```bash
cd /path/to/your/slopsmith/plugins/
git clone https://github.com/saleemk/slopsmith-plugin-mobile-note-highway.git mobile_note_highway
docker compose restart web
```

Alternatively, add a direct mount in `docker-compose.yml`:
```yaml
services:
  web:
    volumes:
      - ./plugins:/app/plugins
      - ../slopsmith-plugin-mobile-note-highway:/app/plugins/mobile_note_highway
```

## Usage

Open any song on your phone or tablet — the plugin activates automatically.

### Controls

**Collapsible controls:**
- **Swipe up** on controls bar → expand advanced tools
- **Swipe down** on controls bar → collapse to essentials
- **Tap chevron** (⌃ or ⌄) → toggle expand/collapse

**Highway gestures:**
- **Swipe up/down** → scrub through song with live preview - drag vertically to move forward/back through time, matching the natural scroll of notes coming at you
- **Single tap** → play/pause
- **Double tap** → set loop markers (A → B → Clear)

**Section map:**
- **Drag** → scrub through song with live highway preview and tooltip
- **Tap** → jump to that position instantly

**What's visible by default:**
- **Phone:** Back button, seek buttons, play controls, arrangement selector, default arrangement pin
- **Tablet:** Back button, seek buttons, play controls, arrangement selector, default arrangement pin, difficulty slider, speed slider

**Expanded view:**
- **Playback:** Back, seek, play/pause, arrangement selector, default pin
- **Sliders:** Difficulty, speed, and A/V offset
- **Practice:** Loop controls, detect, step mode, tuner
- **Stems:** Stem mixer controls, shown only for stem-format songs
- **More controls:** Mixer, Lyrics, Simplify, HD, 3D Highway, Save, Tones, Fretboard, and other plugin actions

All gestures show brief visual feedback confirming the action.

## How it works

The plugin detects your device type using screen width and touch capability, then adapts instantly:

- **Phone (< 600px):** Minimal controls optimized for one-handed use
- **Tablet (≥ 600px):** More controls with bigger touch targets and generous spacing
- **Desktop:** Plugin stays dormant - standard Slopsmith interface

Gesture detection, layout adjustments, and control hiding happen automatically.

### Settings

Customize the plugin in **Settings → Mobile Note Highway**:

- **Master switch** - Enable or disable all mobile optimizations without uninstalling the plugin
- **Scrub Sensitivity** - Adjust how responsive vertical scrubbing feels (0.5x - 2.0x)
- **Audio Feedback** - Enable/disable whoosh sound and choose from 4 sound types:
  - `tape_flutter` (default), `sawtooth`, `sine`, `whitenoise`

**3D Highway portrait tip:** If you use the 3D highway visualization, the camera can feel too far away in portrait mode. Go to **Settings → 3D Highway → Advanced camera settings**, enable *Lock camera at frets 1-12*, then set *Locked zoom* to 0.00 for a closer, more natural perspective.

## Compatibility

**Tested on:** iOS devices (iPhone and iPad) in portrait orientation.

**Optimized for:** Portrait mode on phones and tablets. Landscape mode works but may require manual scrolling.

The plugin should work on Android devices but has not been tested. If you encounter issues, please open an issue with your device model and browser version.

## Roadmap

Future improvements planned:

- **Configurable essential controls** - Let users customize which controls appear in collapsed view
- **Landscape optimization** - Better layout and spacing for horizontal orientation
- **Expanded view polish** - Continue refining spacing, orientation behavior, and plugin grouping
- ~~**Gesture refinement** - Re-evaluate swipe left/right behavior for better seek control~~

## Technical notes

- Pure vanilla JavaScript, no dependencies
- Uses `MutationObserver` to catch plugin buttons as they load
- Routes expanded controls into functional section rows while keeping collapsed visibility separate
- Uses song metadata (`highway.getSongInfo().stems`) to show the Stems row only for stem-format songs
- Provides a More controls accordion for secondary display and plugin actions
- Hooks into `setLoopStart`/`setLoopEnd`/`clearLoop` for gesture sync
- Web Audio API for scrubbing audio feedback
- Intercepts section_map plugin's drag events to add live highway updates
- All device-specific sizing lives in a CONFIG object for easy maintenance

## Contributing

See [Slopsmith's CONTRIBUTING.md](https://github.com/slopsmith/slopsmith/blob/main/CONTRIBUTING.md) for the workflow and DCO requirements.

## License

AGPL-3.0
