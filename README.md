# Mobile UI

A mobile interface plugin for [Slopsmith](https://github.com/byrongamatos/slopsmith) that optimizes the player for touch devices with collapsible controls, intuitive gestures, and device-adaptive layouts.

## Features

- **Collapsible controls** — Advanced controls hidden by default, swipe up to reveal
- **Touch gestures** — Swipe to seek, tap to play/pause, double-tap to set loop markers
- **Device-adaptive** — Automatically optimizes layout and sizing for phones (< 600px) and tablets (≥ 600px)
- **Drag-friendly section map** — Touch and drag to scrub through the song with live preview
- **Visual feedback** — Chevron indicator and gesture overlays show available actions
- **Desktop unchanged** — Plugin only activates on touch devices, desktop experience remains standard

## Installation

### Manual Installation

1. Navigate to your Slopsmith `plugins/` directory
2. Clone this repo:
   ```bash
   cd plugins/
   git clone https://github.com/saleemk/slopsmith-plugin-mobile-ui.git mobile_ui
   ```
3. Restart Slopsmith (or reload the page)
4. Check logs for: `Registered plugin 'mobile_ui' (Mobile UI)`

### Docker Installation

If you're running Slopsmith in Docker, clone into the bind-mounted plugins directory:
```bash
cd /path/to/your/slopsmith/plugins/
git clone https://github.com/saleemk/slopsmith-plugin-mobile-ui.git mobile_ui
docker compose restart web
```

Alternatively, add a direct mount in `docker-compose.yml`:
```yaml
services:
  web:
    volumes:
      - ./plugins:/app/plugins
      - ../slopsmith-plugin-mobile-ui:/app/plugins/mobile_ui
```

## Usage

The plugin activates automatically when you open a song on a phone or tablet.

**Collapsible controls:**
- **Swipe up** on controls bar → expand advanced tools
- **Swipe down** on controls bar → collapse to essentials
- **Tap chevron** (⌃ or ⌄) → toggle expand/collapse

**Highway gestures:**
- **Swipe left/right** → seek ±5 seconds
- **Single tap** → play/pause
- **Double tap** → set loop markers (A → B → Clear)

**Section map:**
- **Drag** → scrub through song with live tooltip
- **Tap** → jump to that position instantly

**What's visible by default:**
- **Phone:** Back button, play controls, arrangement selector
- **Tablet:** Back button, play controls, arrangement selector, difficulty slider, speed slider

**Hidden until you swipe up:**
- Loop controls (A/B buttons)
- Visualization picker
- Audio mixer
- A/V offset slider
- Quality/HD selector
- All plugin buttons (fretboard, tones, detect, step mode, etc.)

All gestures show brief visual feedback confirming the action.

## How it works

The plugin detects your device type (phone/tablet/desktop) using screen width and touch capability, then:
- **Phone (< 600px):** Shows minimal controls for one-handed use
- **Tablet (≥ 600px):** Shows more controls with bigger touch targets and spacing
- **Desktop:** Plugin stays inactive — standard Slopsmith interface

Gesture detection, layout adjustments, and control hiding happen automatically. No configuration needed.

## Technical notes

- Pure vanilla JavaScript, no dependencies
- Uses `MutationObserver` to catch plugin buttons as they load
- Hooks into `setLoopStart`/`setLoopEnd`/`clearLoop` for gesture sync
- All device-specific sizing lives in a CONFIG object for easy maintenance

## Contributing

See [Slopsmith's CONTRIBUTING.md](https://github.com/byrongamatos/slopsmith/blob/main/CONTRIBUTING.md) for the workflow and DCO requirements.

## License

AGPL-3.0
