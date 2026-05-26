# Mobile UI Plugin

Enhances Slopsmith's player interface for mobile devices with touch-optimized controls, drag-friendly section map, and responsive layout.

## Installation

This plugin is external and not bundled with Slopsmith. Install it by mounting into your Docker container.

### Docker Installation (Recommended)

1. **Clone the plugin** next to your slopsmith directory:
   ```bash
   cd /path/to/your/repos
   git clone https://github.com/YOUR_USERNAME/slopsmith-plugin-mobile-ui.git
   ```

2. **Add mount to docker-compose.yml**:
   ```yaml
   services:
     web:
       volumes:
         - ./plugins:/app/plugins
         - ../slopsmith-plugin-mobile-ui:/app/plugins/mobile_ui  # Add this line
   ```

3. **Restart container**:
   ```bash
   docker compose restart
   ```

### Manual Installation (Direct to plugins/)

If you're running Slopsmith without Docker:
```bash
cd slopsmith/plugins/
git clone https://github.com/YOUR_USERNAME/slopsmith-plugin-mobile-ui.git mobile_ui
# Restart Slopsmith
```

### Verify Installation

Check the logs for: `Registered plugin 'mobile_ui' (Mobile UI)`

## Features

- **Collapsible Controls** - Advanced controls hidden by default, revealed via swipe gesture
- **Gesture Controls** - Intuitive touch gestures for common actions:
  - **Swipe up** on controls bar → expand advanced controls
  - **Swipe down** on controls bar → collapse advanced controls
  - **Swipe left** on highway → seek backward 5 seconds
  - **Swipe right** on highway → seek forward 5 seconds
  - **Double tap** on highway → play/pause
- **Visual Indicator** - Animated chevron hints at swipe gesture:
  - **⌃ Upward chevron** when controls are collapsed (swipe up to expand)
  - **⌄ Downward chevron** when controls are expanded (swipe down to collapse)
- **Touch-Friendly Targets** - All buttons enlarged to 44px minimum (Apple Human Interface Guidelines)
- **Drag-Friendly Section Map** - Touch and drag to scrub through the song with live tooltip showing section name and time
- **Mobile-Only Activation** - Desktop experience remains unchanged
- **Clean Lifecycle** - Automatically activates on player screen, cleans up on exit
- **Plugin-Aware** - Automatically catches and hides plugin buttons (fretboard, tones, detect, step mode, etc.) as they load
- **Layout Optimizations** - Section map, player HUD, and 3D highway overlay positioned to avoid overlap

## How It Works

The plugin detects mobile devices using:
- Screen width (`max-width: 768px`)
- Touch capability (`ontouchstart` in window)
- Touch points (navigator.maxTouchPoints)

When activated on the player screen:

1. **Essential controls remain visible:**
   - Play/pause button
   - Seek back/forward buttons (icon-only: ⏪ ⏩)
   - Speed slider with label stacked above (saves horizontal space)
   - Time display (current / duration)
   - Progress bar
   - Close button (return to library)

2. **Advanced controls hidden by default (swipe up to reveal):**
   - Arrangement switcher
   - Difficulty slider
   - A/V offset
   - Visualization picker
   - Audio mixer
   - Quality selector
   - Lyrics toggle
   - Loop controls
   - **All plugin buttons** (fretboard, tones, detect, step mode, stems, themes, etc.)

3. **Section map enhancements:**
   - Height increased to 44px (from 20px) for better touch targets
   - Section labels hidden (too small to read)
   - **Drag to seek** - Touch and drag anywhere on the section map to scrub through the song
   - **Live tooltip** - Shows section name and timestamp while dragging
   - **Preview marker** - White line shows exactly where you'll seek before releasing
   - Tap/click still works for instant seeking

4. **Layout adjustments:**
   - Player HUD (song/artist/combo/time) positioned 40px below section map
   - 3D highway overlay positioned 105px from top to clear section map and player info
   - All text elements visible and properly spaced on mobile

## Current Limitations

- **Single layout for all mobile devices** - Currently optimized for iPhone portrait (minimal controls). Future versions will adapt to device size and orientation:
  - iPhone landscape: Show 1-2 more controls
  - iPad portrait/landscape: Show progressively more controls
  - See Phase 4 in the spec document for planned responsive breakpoints

## Usage

No configuration needed! The plugin automatically:
- Detects mobile devices
- Activates when you open a song
- Deactivates when you leave the player

**To show/hide advanced controls:**
- **Swipe up** on the player controls bar to expand
- **Swipe down** on the controls bar to collapse
- **⌃** indicator (upward chevron) hints to swipe up when controls are collapsed
- **⌄** indicator (downward chevron) hints to swipe down when controls are expanded

**To seek via section map:**
- **Drag:** Touch and hold anywhere on the section map, drag left/right to scrub. Tooltip shows section and time. Release to seek.
- **Tap:** Quick tap on the section map for instant seeking to that position.

**To control playback via highway gestures:**
- **Swipe left** on the highway → seek backward 5 seconds
- **Swipe right** on the highway → seek forward 5 seconds
- **Double tap** on the highway → play/pause

All gestures show visual feedback (⏪ -5s, ⏩ +5s, ▶ Play, ⏸ Pause, ⬆ Show Tools, ⬇ Hide Tools).

## Compatibility

- **Mobile:** iOS 12+, Android 5+, any modern mobile browser
- **Desktop:** No effect (plugin doesn't activate)
- **Slopsmith:** v0.2.9+

## Technical Details

- **Size:** ~25 KB
- **Dependencies:** None (pure vanilla JS)
- **Performance:** Negligible (MutationObserver + event listeners only)
- **Events:** Listens to `screen:changed` from `window.slopsmith`
- **MutationObserver:** Watches for plugin buttons being injected into player controls
- **Section Map Integration:** Enhances the built-in section_map plugin with mobile-specific improvements

## Future Enhancements

Planned features for future versions:
- Responsive breakpoints (iPhone landscape, iPad portrait/landscape)
- Touch gestures (swipe to seek, pinch to zoom highway)
- Bottom sheet for mixer/viz/quality
- Fullscreen/immersive mode

## License

AGPL-3.0 License - See LICENSE file for details.

## Contributing

Contributions welcome! Please open an issue or PR on GitHub.
