# Mobile Note Highway

[![GitHub release](https://img.shields.io/github/v/release/saleemk/slopsmith-plugin-mobile-note-highway)](https://github.com/saleemk/slopsmith-plugin-mobile-note-highway/releases)

A touch-optimized note highway player plugin for [Slopsmith](https://github.com/slopsmith/slopsmith) that transforms the player experience on phones and tablets. Collapsible controls, intuitive gestures with live audio feedback, and device-adaptive layouts let you focus on playing.

**Tested on iOS (portrait mode).** Android should work and likely has native touch feedback, but hasn't been verified.

### Phone View

<img width="300" alt="Phone collapsed view" src="https://github.com/user-attachments/assets/945c5a8b-c3b4-4abf-b863-a46c3488f3d8" />&nbsp;&nbsp;&nbsp;&nbsp;<img width="300" alt="Phone expanded view" src="https://github.com/user-attachments/assets/ef0cebfc-23e0-4d2e-b710-0096f177dcde" />

*Collapsed view shows essentials (back, play, arrangement). Swipe up to reveal all controls. *

### Tablet View

<img width="450" alt="Tablet collapsed view" src="https://github.com/user-attachments/assets/50a5d8be-2895-41b1-a220-5bb7423d4603" /> <img width="450" alt="Tablet expanded view" src="https://github.com/user-attachments/assets/85977b57-dc8a-42ab-9ecf-a9df1b4f3626" />

*Collapsed view includes difficulty and speed sliders. Expanded view reveals full control panel with proper spacing.*

## Features

- **Collapsible controls** - Swipe up/down to show/hide advanced tools. Only essentials visible by default.
- **Swipe up/down on highway** - Scrub through the song by dragging vertically with live highway preview - matches the natural flow of notes scrolling toward you
- **Tap to play/pause** - Single tap anywhere on the highway
- **Double tap to loop** - Set A/B loop markers with double taps (A → B → Clear)
- **Drag-to-scrub section map** - Touch and drag the section map for instant navigation with live highway preview

## Installation

**Current version: v1.1.1** - iPad detection hotfix (iPadOS 13+ now correctly detected as tablet). See [Releases](https://github.com/saleemk/slopsmith-plugin-mobile-note-highway/releases) for full changelog.

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
- **Phone:** Back button, seek buttons, play controls, arrangement selector
- **Tablet:** Back button, seek buttons, play controls, arrangement selector, difficulty slider, speed slider

**Hidden until you swipe up:**
- Loop controls (A/B buttons)
- Visualization picker
- Audio mixer
- A/V offset slider
- Quality/HD selector
- Lyrics toggle
- All plugin buttons (fretboard, tones, detect, step mode, etc.)

All gestures show brief visual feedback confirming the action.

## How it works

The plugin detects your device type using screen width and touch capability, then adapts instantly:

- **Phone (< 600px):** Minimal controls optimized for one-handed use
- **Tablet (≥ 600px):** More controls with bigger touch targets and generous spacing
- **Desktop:** Plugin stays dormant - standard Slopsmith interface

Gesture detection, layout adjustments, and control hiding happen automatically. No configuration needed.

### Settings

Customize the plugin in **Settings → Mobile Note Highway**:

- **Scrub Sensitivity** - Adjust how responsive vertical scrubbing feels (0.5x - 2.0x)
- **Audio Feedback** - Enable/disable whoosh sound and choose from 9 sound types:
  - `tape_flutter` (default), `sawtooth`, `sine`, `whitenoise`, `rumble`, `crackle`, `clicks`, `vinyl_scratch`, `mechanical`

## Compatibility

**Tested on:** iOS devices (iPhone and iPad) in portrait orientation.

**Optimized for:** Portrait mode on phones and tablets. Landscape mode works but may require manual scrolling.

The plugin should work on Android devices but has not been tested. If you encounter issues, please open an issue with your device model and browser version.

## Roadmap

Future improvements planned:

- **Configurable essential controls** - Let users customize which controls appear in collapsed view
- **Landscape optimization** - Better layout and spacing for horizontal orientation
- **Expanded view organization** - Group related buttons and plugins into categorized sections (Practice/Audio/Visual/Plugins) using CSS Grid for cleaner, more intuitive control layout
- ~~**Gesture refinement** - Re-evaluate swipe left/right behavior for better seek control~~

## Technical notes

- Pure vanilla JavaScript, no dependencies
- Uses `MutationObserver` to catch plugin buttons as they load
- Hooks into `setLoopStart`/`setLoopEnd`/`clearLoop` for gesture sync
- Web Audio API for scrubbing audio feedback
- Intercepts section_map plugin's drag events to add live highway updates
- All device-specific sizing lives in a CONFIG object for easy maintenance

## Contributing

See [Slopsmith's CONTRIBUTING.md](https://github.com/slopsmith/slopsmith/blob/main/CONTRIBUTING.md) for the workflow and DCO requirements.

## License

AGPL-3.0
