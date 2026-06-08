(function() {
    'use strict';

    if (window.__slopsmithMobileNoteHighwayInstalled) return;
    window.__slopsmithMobileNoteHighwayInstalled = true;

    /**
     * Mobile Note Highway Plugin
     * 
     * Enhances Slopsmith's player interface for mobile devices with:
     * - Collapsible controls to reduce clutter
     * - Bigger touch targets (44px minimum per Apple HIG)
     * - Mobile-optimized layout
     * 
     * Only activates on mobile devices; desktop experience unchanged.
     */
    
    // ═══════════════════════════════════════════════════════════════
    // Viewport Detection & Config
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Detect device class.
     * - tablet: touch device with width >= 600px (iPad portrait & up)
     * - phone:  touch device with width < 600px
     * - desktop: non-touch (mouse-driven)
     * @returns {'phone'|'tablet'|'desktop'}
     */
    function detectDevice() {
        const ua = navigator.userAgent.toLowerCase();
        const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
        
        // Desktop OS detection - Windows/Mac/Linux desktops (but not mobile variants)
        // Check this FIRST to prevent desktop browsers from being misdetected as mobile
        const isDesktopUA = /windows nt|macintosh|linux x86_64/.test(ua) && 
                           !/mobile|android|iphone|ipad|ipod|windows phone/.test(ua);
        
        // If desktop UA but hasCoarsePointer is true, it's an iPad masquerading as Mac
        // (Modern iPads report UA as "Macintosh" but hasCoarsePointer correctly shows true)
        if (isDesktopUA && hasCoarsePointer) {
            return window.innerWidth >= 600 ? 'tablet' : 'phone';
        }
        
        // If desktop UA without coarse pointer, it's a real desktop
        if (isDesktopUA) {
            return 'desktop';
        }
        
        // Not a desktop UA - check touch capabilities
        // Require maxTouchPoints > 1 (not > 0) to avoid false positives from
        // desktop browsers with dev tools emulation support
        const hasTouch = hasCoarsePointer || ('ontouchstart' in window) || (navigator.maxTouchPoints > 1);
        
        return hasTouch ? (window.innerWidth >= 600 ? 'tablet' : 'phone') : 'desktop';
    }

    function detectOrientation() {
        return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    }

    /**
     * Per-device styling and behavior config.
     * Phone values exactly match the pre-refactor hardcoded numbers so phone
     * behavior is unchanged. Tablet values are scaled up for iPad ergonomics.
     */
    const CONFIG = {
        phone: {
            // Buttons
            buttonHeight: 44,           // px
            buttonPaddingX: 16,         // px (horizontal padding)
            // Chevron indicator
            chevronSize: 20,            // px font-size
            chevronSpacerWidth: 30,     // px flex spacer width
            // Sliders
            sliderTrackHeight: 20,      // px (slider element height inside wrapper)
            sliderWrapperHeight: 44,    // px (column wrapper height)
            sliderLabelFontSize: 9,     // px
            sliderMinWidth: 85,         // px (wider now that back button freed space)
            // Dropdowns
            selectHeight: 44,           // px (arrangement, HD, 3D highway dropdowns)
            selectWidth: 110,           // px (arrangement dropdown width)
            // Section map / HUD
            sectionMapHeight: 44,       // px
            playerHudTop: 40,           // px
            highway3dTop: 105,          // px
            // Gestures
            tapMaxDurationMs: 300,
            tapMaxMovementPx: 10,
            doubleTapWindowMs: 250,
            // Scrubbing
            scrubTimePerPixel: 0.05,        // 20px = 1 second
            scrubThrottleMs: 100,           // Update audio every 100ms
            scrubMinMovement: 15,           // px - min vertical movement to enter scrub mode
            // Controls gestures
            swipeVerticalThreshold: 40,
            swipeMaxDurationMs: 500,
            pullToRefreshGuardPx: 10,
        },
        tablet: {
            // Buttons — same height (per user) but a touch more horizontal padding
            buttonHeight: 44,
            buttonPaddingX: 20,
            // Chevron — bigger + more breathing room on each side
            chevronSize: 28,
            chevronSpacerWidth: 48,
            // Sliders — wider and slightly bigger labels
            sliderTrackHeight: 20,
            sliderWrapperHeight: 44,
            sliderLabelFontSize: 11,
            sliderMinWidth: 140,
            // Dropdowns
            selectHeight: 44,
            selectWidth: 200,           // px (arrangement dropdown width)
            // Section map / HUD — unchanged for visual consistency
            sectionMapHeight: 44,
            playerHudTop: 40,
            highway3dTop: 105,
            // Gestures
            tapMaxDurationMs: 300,
            tapMaxMovementPx: 10,
            doubleTapWindowMs: 250,
            // Scrubbing
            scrubTimePerPixel: 0.05,        // 20px = 1 second
            scrubThrottleMs: 100,           // Update audio every 100ms
            scrubMinMovement: 15,           // px - min vertical movement to enter scrub mode
            // Controls gestures
            swipeVerticalThreshold: 40,
            swipeMaxDurationMs: 500,
            pullToRefreshGuardPx: 10,
        },
    };
    
    let DEVICE = detectDevice();
    let ORIENTATION = detectOrientation();
    let CFG = CONFIG[DEVICE] || CONFIG.phone;
    let IS_TABLET = DEVICE === 'tablet';
    let IS_LANDSCAPE = ORIENTATION === 'landscape';
    let IS_PORTRAIT = ORIENTATION === 'portrait';

    function updateViewportState() {
        var newDevice = detectDevice();
        var newOrientation = detectOrientation();
        var deviceChanged = newDevice !== DEVICE;
        var orientationChanged = newOrientation !== ORIENTATION;

        DEVICE = newDevice;
        ORIENTATION = newOrientation;
        CFG = CONFIG[DEVICE] || CONFIG.phone;
        IS_TABLET = DEVICE === 'tablet';
        IS_LANDSCAPE = ORIENTATION === 'landscape';
        IS_PORTRAIT = ORIENTATION === 'portrait';

        return { deviceChanged: deviceChanged, orientationChanged: orientationChanged };
    }

    const VALID_WHOOSH_TYPES = ['tape_flutter', 'sine', 'sawtooth', 'whitenoise'];

    function normalizeWhooshType(type) {
        return VALID_WHOOSH_TYPES.indexOf(type) !== -1 ? type : 'tape_flutter';
    }

    /**
     * Get current whoosh sound type from localStorage.
     * Configurable via Settings panel.
     * @returns {string}
     */
    function getWhooshType() {
        try {
            return normalizeWhooshType(localStorage.getItem('mobile_note_highway.whooshType') || 'tape_flutter');
        } catch (_) {
            return 'tape_flutter';
        }
    }
    
    /**
     * Get whether audio feedback is enabled.
     * @returns {boolean}
     */
    function getAudioEnabled() {
        try {
            const val = localStorage.getItem('mobile_note_highway.audioEnabled');
            return val !== 'false'; // default true
        } catch (_) {
            return true;
        }
    }
    
    /**
     * Get scrub sensitivity multiplier.
     * @returns {number}
     */
    function getScrubSensitivity() {
        try {
            const val = localStorage.getItem('mobile_note_highway.scrubSensitivity');
            return val ? parseFloat(val) : 1.0;
        } catch (_) {
            return 1.0;
        }
    }
    
    /**
     * Plugin activates on phone AND tablet; not on desktop.
     * @returns {boolean}
     */
    function isMobile() {
        return DEVICE === 'phone' || DEVICE === 'tablet';
    }

    function getCurrentScreenId() {
        if (window.slopsmith && typeof window.slopsmith.getCurrentScreen === 'function') {
            return window.slopsmith.getCurrentScreen();
        }
        var activeScreen = document.querySelector('.screen.active');
        return activeScreen ? activeScreen.id : null;
    }

    /**
     * Get whether the plugin itself is enabled.
     * @returns {boolean}
     */
    function getPluginEnabled() {
        try {
            const val = localStorage.getItem('mobile_note_highway.enabled');
            return val !== 'false'; // default true
        } catch (_) {
            return true;
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════════════════════════
    
    // UI state and refs
    const _ui = {
        expanded: false,           // was _toolsExpanded
        swipeIndicator: null,      // was _swipeIndicator
    };

    // Expanded-only section accordion state
    const _expandedSectionState = {
        tools: false,
    };

    let _sectionPracticeOpen = false;
    let _sectionPracticeObserver = null;
    let _mixerClampClickHandler = null;
    var _mixerClampTimers = [];
    var _mixerClampRaf = null;
    
    // Highway gesture state (scrubbing, taps, loop markers)
    const _highway = {
        gestureStartX: 0,          // was _gestureStartX
        gestureStartY: 0,          // was _gestureStartY
        gestureStartTime: 0,       // was _gestureStartTime
        gestureActive: false,      // was _gestureActive
        lastTapTime: 0,            // was _lastTapTime
        loopMarkerState: 'ready',  // was _loopMarkerState ('ready' | 'a-set' | 'b-set')
        scrubActive: false,        // Currently scrubbing?
        scrubStartTime: 0,         // Audio time when scrub began
        scrubLastUpdate: 0,        // Timestamp of last audio update (for throttling)
        scrubLastDeltaY: 0,        // Previous deltaY (for velocity calculation)
        wasPlayingBeforeScrub: false, // Was audio playing when scrub started?
    };
    
    // Web Audio for whoosh sounds
    const _whoosh = {
        context: null,             // AudioContext
        source: null,              // AudioNode (oscillator for motor whir)
        gain: null,                // GainNode (master volume control)
        filter: null,              // BiquadFilterNode (bandpass for tape speaker)
        noiseBuffer: null,         // AudioBuffer (pre-generated white noise)
        lfo: null,                 // OscillatorNode (tape_flutter LFO)
        lfoGain: null,             // GainNode (tape_flutter modulation depth)
        modulatedGain: null,       // GainNode (tape_flutter AM output)
        active: false,             // Is whoosh playing?
        type: null,                // Current sound type
    };
    
    // Controls gesture state (swipe up/down to expand/collapse)
    const _controls = {
        gestureStartX: 0,          // was _controlsGestureStartX
        gestureStartY: 0,          // was _controlsGestureStartY
        gestureStartTime: 0,       // was _controlsGestureStartTime
        gestureActive: false,      // was _controlsGestureActive
    };
    
    // Original styles (for restore on cleanup)
    const _restore = {
        sectionMap: null,          // was _sectionMapOriginalStyles
        playerHud: null,           // was _playerHudOriginalStyles
        highway3dOverlay: null,    // was _highway3dOverlayOriginalStyles
        sectionPractice: null,
        mixerPopover: null,
    };
    
    // Timers (for cleanup on song change / screen exit)
    const _timers = {
        pending: [],               // was _pendingTimeouts
        doubleTap: null,           // was _pendingDoubleTapTimeout
        resize: null,              // was _resizeTimeout
    };
    
    // Observers (managed by createManagedObserver)
    let _controlsObserver = null;
    let _sectionMapObserver = null;
    let _sectionMapLiveUpdateHandlers = null;
    let _highway3dObserver = null;
    let _highway3dAdjusted = false;
    let _highwayGesturesTarget = null;
    let _controlsGesturesTarget = null;
    let _highwayViewChangeTarget = null;
    let _highwayViewChangeHandler = null;
    
    // Expanded section row placement tracking
    const _expandedControlPlacement = new WeakMap();
    const _expandedControlMovedOrder = [];
    
    // ═══════════════════════════════════════════════════════════════
    // Constants
    // ═══════════════════════════════════════════════════════════════
    
    // Wrapper element IDs
    const WRAPPER_IDS = {
        MASTERY: 'mobile-mastery-wrapper',
        SPEED: 'mobile-speed-wrapper',
        AV: 'mobile-av-wrapper',
    };
    
    // Control order values (CSS flexbox order property)
    const CONTROL_ORDER = {
        BACK: '-1',
        PLAY: '0',
        ARRANGEMENT: '1',
        DIFFICULTY: '2',
        SPEED: '3',
        REST: '100',
    };
    
    // Helper element IDs
    const HELPER_IDS = {
        SWIPE_INDICATOR: 'mobile-swipe-indicator',
        END_SPACER: 'mobile-end-spacer',
        SECTION_PRACTICE_HEADER: 'mnh-section-practice-header',
    };

    const HELPER_CLASSES = {
        SECTION_HEADER: 'mnh-section-header',
    };

    const SECTION_HEADER_IDS = {
        PLUGINS: 'mnh-section-header-plugins',
    };
    
    // ── Wrapper / Helper Element Detection ──

    /**
     * Check if element is inside one of our wrapper divs
     * (wrappers fully own their children - skip observer processing)
     */
    function isInsideWrapper(element) {
        return !!(
            element &&
            element.closest &&
            (
                element.closest('#' + WRAPPER_IDS.MASTERY) ||
                element.closest('#' + WRAPPER_IDS.SPEED) ||
                element.closest('#' + WRAPPER_IDS.AV)
            )
        );
    }
    
    /**
     * Check if element is one of our helper elements (indicator/spacer)
     */
    function isHelperElement(element) {
        const id = element?.id;
        return id === HELPER_IDS.SWIPE_INDICATOR ||
               id === HELPER_IDS.END_SPACER ||
               id === HELPER_IDS.SECTION_PRACTICE_HEADER ||
               isSectionHeaderElement(element);
    }

    function isSectionHeaderElement(element) {
        return !!(
            element &&
            element.nodeType === Node.ELEMENT_NODE &&
            (
                element.classList?.contains(HELPER_CLASSES.SECTION_HEADER) ||
                (element.closest && element.closest('.' + HELPER_CLASSES.SECTION_HEADER))
            )
        );
    }

    // ── Expanded More Controls Header ──

    function isToolsOpen() {
        return !!_expandedSectionState.tools;
    }

    function setToolsOpen(open) {
        _expandedSectionState.tools = !!open;
    }

    function applyToolsSectionVisibility() {
        var open = isToolsOpen();
        TOOLS_ROW_IDS.forEach(function(rowId) {
            var row = document.getElementById(rowId);
            if (row) {
                row.style.display = open ? 'flex' : 'none';
            }
        });
        var header = document.getElementById(SECTION_HEADER_IDS.PLUGINS);
        if (header) {
            header.setAttribute('aria-expanded', open ? 'true' : 'false');
            header.textContent = 'More controls ' + (open ? '\u25B4' : '\u25BE');
        }
        applyExpandedLandscapeToolsRowsLayout();
        scheduleHighwayLayoutRefresh('more-controls');
    }

    function ensureExpandedSectionHeaders(controls) {
        var pluginsRow = document.getElementById(ROW_IDS.PLUGINS);
        if (!pluginsRow) return;
        var header = document.getElementById(SECTION_HEADER_IDS.PLUGINS);
        if (!header) {
            header = document.createElement('button');
            header.id = SECTION_HEADER_IDS.PLUGINS;
            header.type = 'button';
            header.className = HELPER_CLASSES.SECTION_HEADER;
            header.setAttribute('data-mnh-section-target', ROW_IDS.PLUGINS);
            header.setAttribute('aria-controls', ROW_IDS.PLUGINS);
            header.style.cssText = [
                'display:inline-flex',
                'align-items:center',
                'justify-content:flex-start',
                'gap:6px',
                'width:calc(100% - 52px)',
                'height:44px',
                'min-height:44px',
                'padding:0 10px',
                'border:1px solid rgba(75,85,99,0.25)',
                'border-radius:6px',
                'background:rgba(17,24,39,0.28)',
                'color:#cbd5e1',
                'font-size:12px',
                'font-weight:600',
                'text-align:left'
            ].join(';') + ';';
            header.style.order = '360';
            header.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                setToolsOpen(!isToolsOpen());
                applyToolsSectionVisibility();
            });
            controls.insertBefore(header, pluginsRow);
        }
        applyExpandedSectionHeaderLayout();
    }

    // ── Upstream Section Practice Collapse ──
    // Section Practice is upstream-owned, lives above #player-controls inside
    // #player-footer, and MNH collapses it in place. It is not part of ROW_IDS
    // or More controls. Do not move or redesign its internal layout.

    function findSectionPracticeBar() {
        var bar = document.getElementById('section-practice-bar');
        if (!bar) return null;
        return bar.closest && bar.closest('#player-footer') ? bar : null;
    }

    function isSectionPracticeAvailable(bar) {
        return !!(
            bar &&
            bar.nodeType === Node.ELEMENT_NODE &&
            !bar.classList.contains('section-practice-bar--hidden')
        );
    }

    function removeSectionPracticeHeader() {
        var header = document.getElementById(HELPER_IDS.SECTION_PRACTICE_HEADER);
        if (header) header.remove();
    }

    function ensureSectionPracticeCollapse() {
        var bar = findSectionPracticeBar();
        if (!bar) {
            stopSectionPracticeObserver();
            removeSectionPracticeHeader();
            return;
        }

        if (!_restore.sectionPractice) {
            _restore.sectionPractice = {
                display: bar.style.display,
            };
        }

        var parent = bar.parentElement;
        if (!parent || parent.id !== 'player-footer') return;

        var header = document.getElementById(HELPER_IDS.SECTION_PRACTICE_HEADER);
        if (!header) {
            header = document.createElement('button');
            header.id = HELPER_IDS.SECTION_PRACTICE_HEADER;
            header.type = 'button';
            header.setAttribute('aria-controls', 'section-practice-bar');
            header.style.cssText = [
                'display:inline-flex',
                'align-items:center',
                'justify-content:flex-start',
                'width:calc(100% - 16px)',
                'height:30px',
                'min-height:30px',
                'margin:0 8px 4px',
                'padding:0 10px',
                'border:1px solid rgba(75,85,99,0.22)',
                'border-radius:6px',
                'background:rgba(17,24,39,0.24)',
                'color:#cbd5e1',
                'font-size:12px',
                'font-weight:600',
                'text-align:left'
            ].join(';') + ';';
            header.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                _sectionPracticeOpen = !_sectionPracticeOpen;
                applySectionPracticeVisibility();
            });
        }

        if (header.parentElement !== parent || header.nextElementSibling !== bar) {
            parent.insertBefore(header, bar);
        }

        startSectionPracticeObserver(bar);
        applySectionPracticeVisibility();
    }

    function applySectionPracticeVisibility() {
        var bar = findSectionPracticeBar();
        var header = document.getElementById(HELPER_IDS.SECTION_PRACTICE_HEADER);
        if (!bar) {
            stopSectionPracticeObserver();
            removeSectionPracticeHeader();
            return;
        }
        if (!header) return;

        if (!isSectionPracticeAvailable(bar)) {
            _sectionPracticeOpen = false;
            if (header.style.display !== 'none') header.style.display = 'none';
            return;
        }

        var desiredHeaderDisplay = 'inline-flex';
        if (header.style.display !== desiredHeaderDisplay) {
            header.style.display = desiredHeaderDisplay;
        }
        header.textContent = 'Section Practice ' + (_sectionPracticeOpen ? '\u25B4' : '\u25BE');
        header.setAttribute('aria-expanded', _sectionPracticeOpen ? 'true' : 'false');

        if (_sectionPracticeOpen) {
            if (bar.style.getPropertyPriority('display') === 'important') {
                bar.style.removeProperty('display');
            }
            var restoredDisplay = _restore.sectionPractice && _restore.sectionPractice.display;
            var openDisplay = restoredDisplay && restoredDisplay !== 'none' ? restoredDisplay : 'flex';
            if (bar.style.display !== openDisplay) bar.style.display = openDisplay;
        } else if (
            bar.style.display !== 'none' ||
            bar.style.getPropertyPriority('display') !== 'important'
        ) {
            bar.style.setProperty('display', 'none', 'important');
        }

        scheduleHighwayLayoutRefresh('section-practice');
    }

    function startSectionPracticeObserver(bar) {
        stopSectionPracticeObserver();
        if (!bar) return;

        _sectionPracticeObserver = new MutationObserver(function() {
            applySectionPracticeVisibility();
        });
        _sectionPracticeObserver.observe(bar, {
            attributes: true,
            attributeFilter: ['class', 'style'],
        });
    }

    function stopSectionPracticeObserver() {
        if (_sectionPracticeObserver) {
            _sectionPracticeObserver.disconnect();
            _sectionPracticeObserver = null;
        }
    }

    function teardownSectionPracticeCollapse() {
        var bar = findSectionPracticeBar();
        stopSectionPracticeObserver();
        removeSectionPracticeHeader();
        if (bar && _restore.sectionPractice) {
            bar.style.removeProperty('display');
            bar.style.display = _restore.sectionPractice.display;
        }
        _restore.sectionPractice = null;
        _sectionPracticeOpen = false;
    }

    // ── Upstream Mixer Popover Clamp ──
    // Mixer is upstream-owned. MNH does not move or rewrite the mixer; it only
    // applies temporary viewport-safe inline positioning while the popover is
    // open and restores original inline styles on teardown. No MutationObserver.

    function findMixerPopover() {
        return document.getElementById('mixer-popover');
    }

    function isMixerPopoverOpen(popover) {
        return !!(popover && popover.isConnected && !popover.classList.contains('hidden'));
    }

    function storeMixerPopoverOriginalStyles(popover) {
        if (_restore.mixerPopover) return;
        _restore.mixerPopover = {
            left: popover.style.left,
            right: popover.style.right,
            top: popover.style.top,
            bottom: popover.style.bottom,
            transform: popover.style.transform,
            maxWidth: popover.style.maxWidth,
            maxHeight: popover.style.maxHeight,
            overflowX: popover.style.overflowX,
            overflowY: popover.style.overflowY
        };
    }

    function setStyleIfChanged(el, prop, value) {
        if (el.style[prop] !== value) {
            el.style[prop] = value;
        }
    }

    function clearMixerPopoverViewportClamp() {
        var popover = findMixerPopover();
        if (!popover || !_restore.mixerPopover) return;
        var orig = _restore.mixerPopover;
        popover.style.left = orig.left;
        popover.style.right = orig.right;
        popover.style.top = orig.top;
        popover.style.bottom = orig.bottom;
        popover.style.transform = orig.transform;
        popover.style.maxWidth = orig.maxWidth;
        popover.style.maxHeight = orig.maxHeight;
        popover.style.overflowX = orig.overflowX;
        popover.style.overflowY = orig.overflowY;
        _restore.mixerPopover = null;
    }

    function applyMixerPopoverViewportClamp() {
        var popover = findMixerPopover();
        if (!popover) return;

        if (!isMixerPopoverOpen(popover)) {
            if (_restore.mixerPopover) {
                clearMixerPopoverViewportClamp();
            }
            return;
        }

        storeMixerPopoverOriginalStyles(popover);

        // Temporarily restore original transform to avoid compounding translateX()
        var origTransform = _restore.mixerPopover.transform || '';
        popover.style.transform = origTransform;

        var pad = 8;
        setStyleIfChanged(popover, 'maxWidth', 'calc(100vw - ' + (pad * 2) + 'px)');
        setStyleIfChanged(popover, 'maxHeight', 'calc(100vh - ' + (pad * 2) + 'px)');
        setStyleIfChanged(popover, 'overflowX', 'auto');
        setStyleIfChanged(popover, 'overflowY', 'auto');

        var rect = popover.getBoundingClientRect();
        var dx = 0;
        if (rect.left < pad) {
            dx = pad - rect.left;
        } else if (rect.right > window.innerWidth - pad) {
            dx = (window.innerWidth - pad) - rect.right;
        }

        if (dx !== 0) {
            setStyleIfChanged(popover, 'transform', 'translateX(' + dx + 'px)');
        } else if (origTransform) {
            setStyleIfChanged(popover, 'transform', origTransform);
        } else {
            popover.style.transform = '';
        }
    }

    function clearScheduledMixerPopoverClamps() {
        _mixerClampTimers.forEach(clearTimeout);
        _mixerClampTimers = [];
        if (_mixerClampRaf !== null) {
            cancelAnimationFrame(_mixerClampRaf);
            _mixerClampRaf = null;
        }
    }

    function scheduleMixerPopoverClamp() {
        clearScheduledMixerPopoverClamps();
        _mixerClampTimers.push(setTimeout(applyMixerPopoverViewportClamp, 0));
        _mixerClampRaf = requestAnimationFrame(applyMixerPopoverViewportClamp);
        _mixerClampTimers.push(setTimeout(applyMixerPopoverViewportClamp, 100));
    }

    function setupMixerPopoverMobileClamp() {
        var btnMixer = document.getElementById('btn-mixer');
        if (!btnMixer) return;

        if (!_mixerClampClickHandler) {
            _mixerClampClickHandler = function() {
                scheduleMixerPopoverClamp();
            };
        }

        btnMixer.removeEventListener('click', _mixerClampClickHandler);
        btnMixer.addEventListener('click', _mixerClampClickHandler);

        // In case mixer is already open
        scheduleMixerPopoverClamp();
    }

    function teardownMixerPopoverMobileClamp() {
        clearScheduledMixerPopoverClamps();
        var btnMixer = document.getElementById('btn-mixer');
        if (btnMixer && _mixerClampClickHandler) {
            btnMixer.removeEventListener('click', _mixerClampClickHandler);
        }
        _mixerClampClickHandler = null;
        clearMixerPopoverViewportClamp();
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Observer Utilities
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Create a managed MutationObserver with optional retry and RAF batching
     * @param {Object} config
     * @param {string|HTMLElement} config.target - Element or selector to observe
     * @param {Function} config.handler - Called with mutations array
     * @param {Object} config.options - MutationObserver options
     * @param {boolean} [config.batchWithRAF=false] - Batch handler calls with requestAnimationFrame
     * @param {number} [config.retryMs] - Retry interval if target not found (e.g. 500)
     * @returns {Object} - { start, stop }
     */
    function createManagedObserver(config) {
        let observer = null;
        let retryInterval = null;
        let pendingRAF = false;
        
        function getTarget() {
            return typeof config.target === 'string'
                ? document.querySelector(config.target)
                : config.target;
        }
        
        function tryStart() {
            const target = getTarget();
            if (!target) return false;
            
            if (observer) observer.disconnect();
            
            observer = new MutationObserver((mutations) => {
                if (config.batchWithRAF) {
                    if (pendingRAF) return;
                    pendingRAF = true;
                    requestAnimationFrame(() => {
                        pendingRAF = false;
                        config.handler(mutations);
                    });
                } else {
                    config.handler(mutations);
                }
            });
            
            observer.observe(target, config.options);
            return true;
        }
        
        function start() {
            stop();
            const started = tryStart();
            
            if (!started && config.retryMs) {
                retryInterval = setInterval(() => {
                    if (tryStart()) {
                        clearInterval(retryInterval);
                        retryInterval = null;
                    }
                }, config.retryMs);
            }
        }
        
        function stop() {
            if (retryInterval) {
                clearInterval(retryInterval);
                retryInterval = null;
            }
            if (observer) {
                observer.disconnect();
                observer = null;
            }
            pendingRAF = false;
        }
        
        return { start, stop };
    }
    
    // ═══════════════════════════════════════════════════════════════
    // CSS Classes Injection
    // ═══════════════════════════════════════════════════════════════

    function buildMobileStylesCss() {
        return `
            /* Mobile Note Highway Plugin Styles */
            .mobile-button {
                height: ${CFG.buttonHeight}px !important;
                min-width: ${CFG.buttonHeight}px !important;
                padding: 0 ${CFG.buttonPaddingX}px !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
            }
            /* Higher specificity: must come AFTER .mobile-button to override */
            .mobile-button.mobile-hidden { display: none !important; }
            .mobile-hidden { display: none !important; }
            
            /* Back button (relocated close button) - icon-only, white triangle */
            #mobile-back-btn .mobile-back-svg {
                width: ${IS_TABLET ? 16 : 14}px;
                height: ${IS_TABLET ? 16 : 14}px;
                display: block;
            }
            
            /* Chevron bounce animation */
            @keyframes chevronBounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-4px); }
            }
        `;
    }

    /**
     * Inject CSS classes for mobile note highway to avoid inline style thrashing
     */
    function injectMobileStyles() {
        if (document.getElementById('mobile-ui-styles')) return;

        var style = document.createElement('style');
        style.id = 'mobile-ui-styles';
        style.textContent = buildMobileStylesCss();
        document.head.appendChild(style);
    }
    
    /**
     * Update CSS variables when device type changes
     */
    function updateMobileStyles() {
        var style = document.getElementById('mobile-ui-styles');
        if (!style) return;
        
        style.textContent = buildMobileStylesCss();
    }

    // ═══════════════════════════════════════════════════════════════
    // Device Resize Handling
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Handle viewport resize (orientation change, browser resize).
     * Device and orientation are tracked separately:
     * - deviceChanged updates mobile CSS sizing and re-enhances controls.
     * - orientationChanged collapses expanded controls on player screen
     *   (portrait/landscape switch forces controls back to collapsed).
     * - Both device and orientation changes schedule a reclassification
     *   refresh to reapply the current collapsed/expanded control state
     *   after viewport changes. On orientation change, expanded controls
     *   collapse first, so the refresh is mainly collapsed-state cleanup.
     */
    function handleResize() {
        var viewportChanged = updateViewportState();

        var currentScreen = getCurrentScreenId();

        if (viewportChanged.deviceChanged) {
            updateMobileStyles();
        }

        if (currentScreen === 'player' && viewportChanged.orientationChanged && _ui.expanded) {
            toggleAdvancedControls(false);
        }

        if (currentScreen === 'player' && viewportChanged.orientationChanged && _sectionPracticeOpen) {
            _sectionPracticeOpen = false;
            applySectionPracticeVisibility();
        }

        if (currentScreen === 'player' && viewportChanged.orientationChanged) {
            scheduleOrientationHighwayLayoutRefresh();
        }

        if (currentScreen === 'player' && (viewportChanged.deviceChanged || viewportChanged.orientationChanged)) {
            scheduleEnhancement(reclassifyAllControls, 100);
            scheduleEnhancement(reapplyMobileSliderWrapperStyles, 150);
        }

        if (viewportChanged.deviceChanged && currentScreen === 'player') {
            scheduleEnhancement(enhancePlayerControls, 100);
        }
    }
    
    /**
     * Setup resize listener with debouncing
     */
    function setupResizeListener() {
        window.addEventListener('resize', () => {
            if (_timers.resize) {
                clearTimeout(_timers.resize);
            }
            _timers.resize = setTimeout(handleResize, 300);
        });
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Haptic Feedback
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Trigger haptic feedback (vibration) if available
     * @param {number} duration - Duration in milliseconds
     */
    function triggerHaptic(duration) {
        if (navigator.vibrate && typeof navigator.vibrate === 'function') {
            navigator.vibrate(duration);
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Back Button Transformation
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Transform the core "× Close" button into a left-positioned icon-only
     * Back button. Idempotent - safe to call multiple times.
     * @param {HTMLButtonElement} btn - The close button to transform
     */
    function transformCloseButton(btn) {
        if (!btn) return;
        // Already transformed?
        if (btn.id === 'mobile-back-btn') {
            return;
        }
        
        // Save original innerHTML for cleanup restoration
        if (!btn.dataset.mobileOriginalHtml) {
            btn.dataset.mobileOriginalHtml = btn.innerHTML;
            btn.dataset.mobileOriginalAriaLabel = btn.getAttribute('aria-label') || '';
            btn.dataset.mobileOriginalTitle = btn.getAttribute('title') || '';
        }
        
        // White chevron pointing left ("<" shape) - standard back-navigation icon.
        // Built from two rotated CSS borders for crisp rendering at any size.
        // Distinct from the player's filled triangles (which are media controls).
        const chevSize = IS_TABLET ? 10 : 8;   // box size in px
        const chevThick = IS_TABLET ? 2.5 : 2; // border thickness
        btn.innerHTML = `<span class="mobile-back-chevron" aria-hidden="true" style="display:inline-block !important;width:${chevSize}px;height:${chevSize}px;border-left:${chevThick}px solid #ffffff;border-bottom:${chevThick}px solid #ffffff;transform:rotate(45deg);margin-right:${chevThick}px;"></span>`;
        btn.id = 'mobile-back-btn';
        btn.setAttribute('aria-label', 'Back to Library');
        btn.setAttribute('title', 'Back to Library');
    }
    
    /**
     * Restore the close button to its original state (for cleanup)
     * @param {HTMLButtonElement} btn - The button to restore
     */
    function restoreCloseButton(btn) {
        if (!btn) return;
        if (btn.dataset.mobileOriginalHtml !== undefined) {
            btn.innerHTML = btn.dataset.mobileOriginalHtml;
            if (btn.dataset.mobileOriginalAriaLabel) {
                btn.setAttribute('aria-label', btn.dataset.mobileOriginalAriaLabel);
            }
            if (btn.dataset.mobileOriginalTitle) {
                btn.setAttribute('title', btn.dataset.mobileOriginalTitle);
            }
            delete btn.dataset.mobileOriginalHtml;
            delete btn.dataset.mobileOriginalAriaLabel;
            delete btn.dataset.mobileOriginalTitle;
        }
        if (btn.id === 'mobile-back-btn') {
            btn.removeAttribute('id');
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Essential Control Detection
    // ═══════════════════════════════════════════════════════════════
    
    // ─────────────────────────────────────────────────────────────────
    // Collapsed Visibility (isEssentialControl / hideControl)
    // ─────────────────────────────────────────────────────────────────
    // Legacy name: isEssentialControl controls collapsed visibility only.
    // Expanded organization is handled separately by ROW_IDS and
    // classifyControlForExpandedRow(). isCollapsedVisibleControl() is
    // an alias available for future migration; call sites not yet migrated.

    /**
     * Check if an element should remain visible (not hidden in Tools)
     * @param {HTMLElement} el - Element to check
     * @returns {boolean} True if element is essential and should stay visible
     */

    function shouldShowCollapsedOffsetSlider() {
        return DEVICE === 'tablet' &&
               IS_LANDSCAPE &&
               !_ui.expanded &&
               document.documentElement.clientWidth >= 900;
    }

    function isEssentialControl(el) {
        // Essential control IDs (phone: play + arrangement; tablet adds difficulty + speed)
        const essentialIds = [
            'btn-play',
            'arr-select',
            'arr-default-pin'
        ];
        if (IS_TABLET) {
            essentialIds.push('mastery-slider', 'mastery-slider-label', 'mastery-label', 'speed-slider', 'speed-label');
        }
        if (shouldShowCollapsedOffsetSlider()) {
            essentialIds.push('player-av-offset-slider', 'player-av-offset-slider-label', 'player-av-offset-label');
        }
        
        // Check by ID
        if (el.id && essentialIds.includes(el.id)) return true;
        
        // Check if contains essential child
        if (essentialIds.some(id => el.querySelector(`#${id}`))) return true;
        
        // Essential onclick patterns
        const essentialOnclicks = [
            'seekBy(-5)',
            'seekBy(5)',
            "showScreen('home')"
        ];
        
        const onclick = el.getAttribute('onclick');
        if (onclick && essentialOnclicks.some(fn => onclick.includes(fn))) return true;
        
        return false;
    }

    function isCollapsedVisibleControl(el) {
        return isEssentialControl(el);
    }
    
    /**
     * Hide a non-essential control element
     * @param {HTMLElement} el - Element to hide
     */
    function hideControl(el) {
        if (!el.classList.contains('mobile-hide-advanced')) {
            el.classList.add('mobile-hide-advanced');
            if (_ui.expanded) {
                el.classList.remove('mobile-hidden');
            } else {
                el.classList.add('mobile-hidden');
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Control Order & Styling
    // ═══════════════════════════════════════════════════════════════    
    // ── Expanded Section Row Classification ──
    // Maps controls to functional groups for expanded view layout.
    // Separate from collapsed visibility (isEssentialControl / hideControl).

    const ROW_IDS = {
        PLAYBACK: 'mnh-row-playback',
        SLIDERS: 'mnh-row-sliders',
        FEATURES: 'mnh-row-features',
        PRACTICE: 'mnh-row-practice',
        STEMS: 'mnh-row-stems',
        PLUGINS: 'mnh-row-plugins',
    };

    function isSectionRowWrapper(el) {
        return !!(el && el.nodeType === Node.ELEMENT_NODE && el.id && Object.values(ROW_IDS).indexOf(el.id) !== -1);
    }

    // Row IDs controlled by the Tools accordion header
    const TOOLS_ROW_IDS = [
        ROW_IDS.FEATURES,
        ROW_IDS.PLUGINS,
    ];

    // ── Stems Row Visibility (song-metadata–driven) ──
    let _currentSongHasStems = false;

    function currentSongHasStemsFromInfo() {
        var info = window.highway && window.highway.getSongInfo && window.highway.getSongInfo();
        return !!(info && Array.isArray(info.stems) && info.stems.length > 0);
    }

    function updateCurrentSongStemState() {
        _currentSongHasStems = currentSongHasStemsFromInfo();
        return _currentSongHasStems;
    }

    function isStemsControl(el) {
        return !!(el && (
            el.id === 'stems-mixer' ||
            (el.querySelector && el.querySelector('#stems-mixer'))
        ));
    }

    function hideStaleStemsControl(el) {
        if (!el) return;
        el.classList.add('mobile-hide-advanced');
        el.classList.add('mobile-hidden');
    }

    function applyStemsRowVisibility() {
        var row = document.getElementById(ROW_IDS.STEMS);
        if (!row) return;
        var hasChildContent = Array.from(row.children).some(function(child) {
            return !isHelperElement(child);
        });
        row.style.display = (_currentSongHasStems && hasChildContent) ? 'flex' : 'none';
    }

    function classifyControlForExpandedRow(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return ROW_IDS.PLUGINS;

        // --- Playback: back, seek, play, arrangement, pin ---
        if (el.id === 'btn-play') return ROW_IDS.PLAYBACK;
        if (el.id === 'arr-select') return ROW_IDS.PLAYBACK;
        if (el.id === 'arr-default-pin') return ROW_IDS.PLAYBACK;
        var onclick = el.getAttribute('onclick');
        if (onclick && (
            onclick.indexOf("showScreen('home')") !== -1 ||
            onclick.indexOf('seekBy(-5)') !== -1 ||
            onclick.indexOf('seekBy(5)') !== -1
        )) return ROW_IDS.PLAYBACK;

        // --- Sliders: difficulty, speed, A/V offset ---
        if (el.id === 'mastery-slider' || el.id === 'speed-slider' || el.id === 'player-av-offset-slider') return ROW_IDS.SLIDERS;
        if (el.id === WRAPPER_IDS.MASTERY || el.id === WRAPPER_IDS.SPEED || el.id === WRAPPER_IDS.AV) return ROW_IDS.SLIDERS;

        // --- Stems: stem mixer container ---
        if (isStemsControl(el)) {
            if (_currentSongHasStems) {
                el.classList.remove('mobile-hidden');
                el.classList.remove('mobile-hide-advanced');
                return ROW_IDS.STEMS;
            }
            hideStaleStemsControl(el);
            return null;
        }

        // --- Features: mixer, lyrics, simplify, HD, 3D ---
        if (el.id === 'btn-lyrics' || el.id === 'quality-select' || el.id === 'viz-picker') return ROW_IDS.FEATURES;
        var txt = (el.textContent || '').toLowerCase().trim();
        if (
            txt === 'mixer' ||
            txt === 'lyrics' ||
            txt === 'simplify' ||
            txt === 'simplify chords' ||
            txt === 'hd' ||
            txt === '3d highway' ||
            txt === '3d' ||
            txt.indexOf('mixer') === 0 ||
            txt.indexOf('lyrics') === 0 ||
            txt.indexOf('simplify') === 0 ||
            txt.indexOf('hd') === 0 ||
            txt.indexOf('3d highway') === 0
        ) return ROW_IDS.FEATURES;

        // --- Practice: loop A/B/save, detect, step, tuner ---
        if (onclick && (onclick.indexOf('setLoopStart') !== -1 || onclick.indexOf('setLoopEnd') !== -1 || onclick.indexOf('clearLoop') !== -1)) return ROW_IDS.PRACTICE;
        if (txt && /detect|step|tuner/i.test(txt)) return ROW_IDS.PRACTICE;

        // --- Everything else ---
        return ROW_IDS.PLUGINS;
    }

    // ── Expanded Section Row Build & Teardown ──

    function ensureExpandedControlRows(controls) {
        var wrappers = {};
        var rows = [
            { id: ROW_IDS.PLAYBACK, order: '0' },
            { id: ROW_IDS.SLIDERS, order: '100' },
            { id: ROW_IDS.PRACTICE, order: '300' },
            { id: ROW_IDS.STEMS, order: '350' },
            { id: ROW_IDS.FEATURES, order: '375' },
            { id: ROW_IDS.PLUGINS, order: '400' }
        ];
        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            var wrapper = document.getElementById(row.id);
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.id = row.id;
                wrapper.className = 'mnh-section-row';
                wrapper.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;width:100%;column-gap:6px;row-gap:6px;margin-bottom:6px;';
                wrapper.style.order = row.order;
                controls.appendChild(wrapper);
            }
            wrappers[row.id] = wrapper;
        }
        return wrappers;
    }

    function buildExpandedControlRows(controls) {
        updateCurrentSongStemState();
        var originalChildren = Array.from(controls.children);
        var wrappers = ensureExpandedControlRows(controls);
        for (var i = 0; i < originalChildren.length; i++) {
            var el = originalChildren[i];
            if (!el || el.nodeType !== Node.ELEMENT_NODE) continue;
            if (isHelperElement(el)) continue;
            if (isSectionRowWrapper(el)) continue;
            if (isStemsControl(el) && !_currentSongHasStems) {
                hideStaleStemsControl(el);
                continue;
            }
            var rowId = classifyControlForExpandedRow(el);
            if (!rowId) continue;
            var wrap = wrappers[rowId];
            if (!wrap || el.parentElement === wrap) continue;
            if (!_expandedControlPlacement.has(el)) {
                _expandedControlPlacement.set(el, {
                    parent: el.parentElement,
                    nextSibling: originalChildren[i + 1] || null,
                    order: el.style.order,
                    display: el.style.display,
                    marginLeft: el.style.marginLeft,
                    marginRight: el.style.marginRight
                });
                _expandedControlMovedOrder.push(el);
            }
            wrap.appendChild(el);
        }

        ensureExpandedSectionHeaders(controls);
        applyToolsSectionVisibility();
        applyStemsRowVisibility();
        applyExpandedRowWrapperLayout();
        applyExpandedSliderRowStyles();
    }

    function teardownExpandedControlRows(controls) {
        for (var i = _expandedControlMovedOrder.length - 1; i >= 0; i--) {
            var el = _expandedControlMovedOrder[i];
            var saved = _expandedControlPlacement.get(el);
            if (!saved) continue;
            var parent = saved.parent;
            var nextSibling = saved.nextSibling;
            if (parent && parent.contains) {
                try {
                    if (nextSibling && parent.contains(nextSibling)) {
                        parent.insertBefore(el, nextSibling);
                    } else {
                        parent.appendChild(el);
                    }
                } catch (_) {
                    if (parent !== el.parentElement) {
                        parent.appendChild(el);
                    }
                }
            }
            el.style.order = saved.order;
            el.style.display = saved.display;
            el.style.marginLeft = saved.marginLeft;
            el.style.marginRight = saved.marginRight;
            _expandedControlPlacement.delete(el);
        }
        _expandedControlMovedOrder.length = 0;

        if (controls && controls.querySelectorAll) {
            controls.querySelectorAll('.' + HELPER_CLASSES.SECTION_HEADER).forEach(function(header) {
                header.remove();
            });
        }

        Object.values(ROW_IDS).forEach(function(rowId) {
            var wrapper = document.getElementById(rowId);
            if (wrapper) wrapper.remove();
        });
    }

    /**
     * Apply order and margin values to priority controls
     * Priority order: back=-1, play=0, arr=1, diff=2, speed=3, rest=100+
     */
    function applyControlOrder() {
        const arrSelect = document.getElementById('arr-select');
        const arrDefaultPin = document.getElementById('arr-default-pin');
        const masteryWrapper = document.getElementById(WRAPPER_IDS.MASTERY);
        const speedWrapper = document.getElementById(WRAPPER_IDS.SPEED);
        const avWrapper = document.getElementById(WRAPPER_IDS.AV);
        
        if (arrSelect) {
            arrSelect.style.order = CONTROL_ORDER.ARRANGEMENT;
            arrSelect.style.marginLeft = _ui.expanded ? '0' : ((DEVICE === 'phone') ? '4px' : '12px');
            arrSelect.style.width = CFG.selectWidth + 'px';
            arrSelect.style.marginRight = '0';
        }
        
        if (arrDefaultPin) {
            arrDefaultPin.style.order = '2';
            arrDefaultPin.style.marginLeft = (DEVICE === 'phone' && !_ui.expanded) ? '4px' : '0';
        }
        
        if (masteryWrapper) {
            masteryWrapper.style.order = CONTROL_ORDER.DIFFICULTY;
            masteryWrapper.style.marginLeft = '0';
        }
        
        if (speedWrapper) {
            speedWrapper.style.order = CONTROL_ORDER.SPEED;
            speedWrapper.style.marginLeft = '0';
            speedWrapper.style.marginRight = '0';
        }
        
        if (avWrapper) {
            avWrapper.style.order = '4';
        }

        applyExpandedSliderRowStyles();
    }

    function applyExpandedRowWrapperLayout() {
        if (isLandscapeCompactControlsLayout()) {
            applyExpandedLandscapeRowWrapperLayout();
        } else {
            applyExpandedPortraitRowWrapperLayout();
        }
        applyExpandedSectionHeaderLayout();
    }

    function applyExpandedPortraitRowWrapperLayout() {
        var playbackRow = document.getElementById(ROW_IDS.PLAYBACK);
        var slidersRow = document.getElementById(ROW_IDS.SLIDERS);

        if (playbackRow) {
            playbackRow.style.width = '100%';
            playbackRow.style.flex = '';
            playbackRow.style.minWidth = '';
            playbackRow.style.marginRight = '';
        }

        if (slidersRow) {
            slidersRow.style.width = '100%';
            slidersRow.style.flex = '';
            slidersRow.style.minWidth = '';
            slidersRow.style.flexWrap = '';
        }

        if (_ui.expanded && DEVICE === 'tablet') {
            if (playbackRow) {
                playbackRow.style.width = 'auto';
                playbackRow.style.flex = '0 0 auto';
                playbackRow.style.minWidth = '0';
                playbackRow.style.marginRight = '6px';
            }

            if (slidersRow) {
                slidersRow.style.width = 'auto';
                slidersRow.style.flex = '1 1 0';
                slidersRow.style.minWidth = '0';
                slidersRow.style.flexWrap = 'nowrap';
            }
        }
    }

    function isLandscapeCompactControlsLayout() {
        return _ui.expanded && IS_LANDSCAPE && isMobile();
    }

    function applyExpandedLandscapeRowWrapperLayout() {
        var rowIds = [ROW_IDS.PLAYBACK, ROW_IDS.SLIDERS, ROW_IDS.PRACTICE, ROW_IDS.STEMS, ROW_IDS.FEATURES, ROW_IDS.PLUGINS];

        // Reset all rows to baseline first
        rowIds.forEach(function(id) {
            var row = document.getElementById(id);
            if (!row) return;
            row.style.width = '100%';
            row.style.flex = '';
            row.style.minWidth = '';
            row.style.flexWrap = '';
            row.style.marginRight = '';
        });

        // Playback row
        var playbackRow = document.getElementById(ROW_IDS.PLAYBACK);
        if (playbackRow) {
            playbackRow.style.width = 'auto';
            playbackRow.style.flex = '0 1 auto';
            playbackRow.style.minWidth = '0';
            playbackRow.style.flexWrap = 'nowrap';
            playbackRow.style.marginRight = '6px';
        }

        // Sliders row
        var slidersRow = document.getElementById(ROW_IDS.SLIDERS);
        if (slidersRow) {
            slidersRow.style.width = 'auto';
            slidersRow.style.flex = '1 1 260px';
            slidersRow.style.minWidth = '220px';
            slidersRow.style.flexWrap = 'nowrap';
            slidersRow.style.marginRight = '0';
        }

        // Practice row
        var practiceRow = document.getElementById(ROW_IDS.PRACTICE);
        if (practiceRow) {
            practiceRow.style.width = 'auto';
            practiceRow.style.flex = '0 1 auto';
            practiceRow.style.minWidth = '0';
            practiceRow.style.flexWrap = 'nowrap';
            practiceRow.style.marginRight = '6px';
        }

        // Stems row
        var stemsRow = document.getElementById(ROW_IDS.STEMS);
        if (stemsRow) {
            stemsRow.style.width = 'auto';
            stemsRow.style.flex = '0 1 auto';
            stemsRow.style.minWidth = '0';
            stemsRow.style.flexWrap = 'nowrap';
            stemsRow.style.marginRight = '6px';
        }

        // Features and Plugins: delegate to tools-row layout helper
        applyExpandedLandscapeToolsRowsLayout();
    }

    function resetExpandedToolsRowLayout(row) {
        if (!row) return;
        row.style.width = '100%';
        row.style.flex = '';
        row.style.minWidth = '';
        row.style.maxWidth = '';
        row.style.flexWrap = '';
        row.style.marginRight = '';
        row.style.marginBottom = '6px';
        row.style.overflowX = '';
        row.style.overflowY = '';
        row.style.touchAction = '';
    }

    function applyExpandedLandscapeToolsRowsLayout() {
        var featuresRow = document.getElementById(ROW_IDS.FEATURES);
        var pluginsRow = document.getElementById(ROW_IDS.PLUGINS);

        if (!isLandscapeCompactControlsLayout()) {
            resetExpandedToolsRowLayout(featuresRow);
            resetExpandedToolsRowLayout(pluginsRow);
            return;
        }

        var toolsOpen = isToolsOpen();

        if (!toolsOpen) {
            resetExpandedToolsRowLayout(featuresRow);
            resetExpandedToolsRowLayout(pluginsRow);
            return;
        }

        // FEATURES strip
        if (featuresRow) {
            featuresRow.style.width = 'auto';
            featuresRow.style.flex = '0 1 auto';
            featuresRow.style.minWidth = '0';
            featuresRow.style.maxWidth = '100%';
            featuresRow.style.flexWrap = 'nowrap';
            featuresRow.style.marginRight = '6px';
            featuresRow.style.marginBottom = '6px';
            featuresRow.style.overflowX = 'visible';
            featuresRow.style.overflowY = 'visible';
            featuresRow.style.touchAction = '';
        }

        // PLUGINS strip
        if (pluginsRow) {
            pluginsRow.style.width = 'auto';
            pluginsRow.style.flex = '1 1 260px';
            pluginsRow.style.minWidth = '0';
            pluginsRow.style.maxWidth = '100%';
            pluginsRow.style.flexWrap = 'nowrap';
            pluginsRow.style.marginRight = '0';
            pluginsRow.style.marginBottom = '6px';
            pluginsRow.style.overflowX = 'auto';
            pluginsRow.style.overflowY = 'hidden';
            pluginsRow.style.touchAction = 'pan-x';
        }
    }

    function applyExpandedSectionHeaderLayout() {
        var header = document.getElementById(SECTION_HEADER_IDS.PLUGINS);
        if (!header) return;

        if (isLandscapeCompactControlsLayout()) {
            header.style.width = 'auto';
            header.style.height = '36px';
            header.style.minHeight = '36px';
            header.style.flex = '0 0 auto';
            header.style.marginBottom = '6px';
        } else {
            header.style.width = 'calc(100% - 52px)';
            header.style.height = '44px';
            header.style.minHeight = '44px';
            header.style.flex = '';
            header.style.marginBottom = '';
        }
    }

    function applyExpandedSliderRowStyles(forceExpanded) {
        var expanded = (typeof forceExpanded === 'boolean') ? forceExpanded : _ui.expanded;
        var useEqualWidthSliders = expanded && (DEVICE === 'phone' || DEVICE === 'tablet');
        var useCollapsedTabletFit = !expanded && DEVICE === 'tablet';
        var useCollapsedTabletOffsetFit = useCollapsedTabletFit && shouldShowCollapsedOffsetSlider();
        var wrapperIds = [WRAPPER_IDS.MASTERY, WRAPPER_IDS.SPEED, WRAPPER_IDS.AV];
        var sliderIds = ['mastery-slider', 'speed-slider', 'player-av-offset-slider'];

        wrapperIds.forEach(function(id) {
            var wrapper = document.getElementById(id);
            if (!wrapper) return;
            if (useEqualWidthSliders) {
                wrapper.style.flex = '1 1 0';
                wrapper.style.minWidth = '0';
                wrapper.style.width = 'auto';
                wrapper.style.maxWidth = '';
            } else if (useCollapsedTabletFit && (id === WRAPPER_IDS.MASTERY || id === WRAPPER_IDS.SPEED || (useCollapsedTabletOffsetFit && id === WRAPPER_IDS.AV))) {
                wrapper.style.flex = '1 1 0';
                wrapper.style.minWidth = '0';
                wrapper.style.width = 'auto';
                wrapper.style.maxWidth = '';
            } else {
                wrapper.style.flex = '';
                wrapper.style.minWidth = '';
                wrapper.style.width = '';
                wrapper.style.maxWidth = '';
            }
        });

        sliderIds.forEach(function(id) {
            var slider = document.getElementById(id);
            if (!slider) return;
            if (useEqualWidthSliders) {
                slider.style.width = '100%';
                slider.style.minWidth = '0';
            } else if (useCollapsedTabletFit && (id === 'mastery-slider' || id === 'speed-slider' || (useCollapsedTabletOffsetFit && id === 'player-av-offset-slider'))) {
                slider.style.width = '100%';
                slider.style.minWidth = '0';
            } else {
                slider.style.width = '';
                if (CFG.sliderMinWidth > 0) {
                    slider.style.minWidth = CFG.sliderMinWidth + 'px';
                } else {
                    slider.style.minWidth = '';
                }
            }
        });
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Collapsible Controls
    // ═══════════════════════════════════════════════════════════════
    
    // ─────────────────────────────────────────────────────────────────
    // Shared Slider Wrapper Helpers
    // ─────────────────────────────────────────────────────────────────

    function applyMobileSliderWrapperBaseStyles(wrapper) {
        wrapper.style.display = 'inline-flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '2px';
        wrapper.style.height = CFG.sliderWrapperHeight + 'px';
        wrapper.style.justifyContent = 'flex-start';
    }

    function applyMobileSliderLabelRowStyles(row) {
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'center';
        row.style.gap = '4px';
        row.style.fontSize = CFG.sliderLabelFontSize + 'px';
        row.style.lineHeight = '1';
        row.style.paddingBottom = '5px';
    }

    function createMobileSliderWrapper(wrapperId) {
        var wrapper = document.createElement('div');
        wrapper.id = wrapperId;
        applyMobileSliderWrapperBaseStyles(wrapper);
        return wrapper;
    }

    function createMobileSliderLabelRow() {
        var row = document.createElement('div');
        applyMobileSliderLabelRowStyles(row);
        return row;
    }

    function applyMobileSliderLabelTextStyles(el) {
        el.style.fontSize = CFG.sliderLabelFontSize + 'px';
        el.style.lineHeight = '1';
        el.style.fontWeight = '400';
        el.style.margin = '0';
        el.style.padding = '0';
        el.style.width = 'auto';
    }

    function applyMobileSliderLabelTextStylesById(ids) {
        ids.forEach(function(id) {
            var el = document.getElementById(id);
            if (el) applyMobileSliderLabelTextStyles(el);
        });
    }

    function createMobileSliderSeparator() {
        var sep = document.createElement('span');
        sep.textContent = '\u2022';
        sep.style.opacity = '0.5';
        return sep;
    }

    function applyMobileSliderInputBaseStyles(slider, options) {
        options = options || {};
        var includeMinWidth = options.includeMinWidth !== false;

        slider.style.minHeight = 'auto';
        slider.style.height = CFG.sliderTrackHeight + 'px';
        if (includeMinWidth && CFG.sliderMinWidth > 0) {
            slider.style.minWidth = CFG.sliderMinWidth + 'px';
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Main Enhancement
    // ─────────────────────────────────────────────────────────────────
    
    /**
     * Enhance player controls for mobile:
     * - Add "⚙️ Tools" toggle button
     * - Hide advanced controls by default
     * - Make all buttons 44px minimum (touch-friendly)
     */
    function enhancePlayerControls() {
        const controls = document.getElementById('player-controls');
        if (!controls) {
            console.warn('[mobile_note_highway] No #player-controls found');
            return;
        }
        
        // Make all buttons touch-friendly with consistent height FIRST
        Array.from(controls.querySelectorAll('button')).forEach(btn => {
            btn.style.setProperty('height', CFG.buttonHeight + 'px', 'important');
            btn.style.setProperty('min-width', CFG.buttonHeight + 'px', 'important');
            btn.style.setProperty('padding', '0 ' + CFG.buttonPaddingX + 'px', 'important');
            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
        });
        
        // Wrap seek button text ("5s") in spans for mobile hiding
        Array.from(controls.querySelectorAll('button')).forEach(btn => {
            const onclick = btn.getAttribute('onclick');
            if (onclick && onclick.includes('seekBy(')) {
                // Find text nodes that aren't already wrapped
                Array.from(btn.childNodes).forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                        const span = document.createElement('span');
                        span.className = 'seek-label';
                        span.textContent = node.textContent;
                        btn.replaceChild(span, node);
                    }
                });
            }
        });
        
        // Hide seek button labels (5s text) on mobile to make them icon-only
        Array.from(controls.querySelectorAll('.seek-label')).forEach(label => {
            label.style.display = 'none';
        });
        
        // Make sliders bigger (touch target + optional min-width on tablet)
        Array.from(controls.querySelectorAll('input[type="range"]')).forEach(slider => {
            slider.style.minHeight = CFG.buttonHeight + 'px';
            if (CFG.sliderMinWidth > 0) {
                slider.style.minWidth = CFG.sliderMinWidth + 'px';
            }
        });
        
        // Make dropdowns touch-friendly (arrangement, HD, 3D highway)
        Array.from(controls.querySelectorAll('select')).forEach(select => {
            select.style.setProperty('height', CFG.selectHeight + 'px', 'important');
            select.style.setProperty('min-height', CFG.selectHeight + 'px', 'important');
        });
        
        // Stack speed label above speed slider to save horizontal space
        const speedSlider = document.getElementById('speed-slider');
        const speedLabel = document.getElementById('speed-label');
        if (speedSlider && speedLabel && speedSlider.parentElement === controls && speedLabel.parentElement === controls) {
            // Create wrapper container
            var speedWrapper = createMobileSliderWrapper(WRAPPER_IDS.SPEED);

            // Create label row with static Speed label + separator + value
            var speedLabelRow = createMobileSliderLabelRow();

            var speedStaticLabel = document.createElement('span');
            speedStaticLabel.textContent = 'Speed';
            speedStaticLabel.id = 'mobile-speed-static-label';
            speedStaticLabel.className = 'text-xs text-gray-500 ml-1';
            applyMobileSliderLabelTextStyles(speedStaticLabel);

            // Apply label text styles to existing #speed-label (value element)
            applyMobileSliderLabelTextStyles(speedLabel);

            // Insert wrapper before the slider, build structure
            speedSlider.parentElement.insertBefore(speedWrapper, speedSlider);
            speedWrapper.appendChild(speedLabelRow);
            speedLabelRow.appendChild(speedStaticLabel);
            speedLabelRow.appendChild(createMobileSliderSeparator());
            speedLabelRow.appendChild(speedLabel);
            speedWrapper.appendChild(speedSlider);

            // Apply shared slider input styles
            applyMobileSliderInputBaseStyles(speedSlider);
        }
        
        // Stack mastery/difficulty slider: label + value on same line, slider below
        const masterySlider = document.getElementById('mastery-slider');
        const masteryLabel = document.getElementById('mastery-slider-label');
        const masteryValue = document.getElementById('mastery-label');
        if (masterySlider && masteryLabel && masteryValue && 
            masterySlider.parentElement === controls && 
            masteryLabel.parentElement === controls && 
            masteryValue.parentElement === controls) {
            
            // Create column wrapper
            var masteryWrapper = createMobileSliderWrapper(WRAPPER_IDS.MASTERY);
            
            // Create horizontal row for label + value
            var masteryLabelRow = createMobileSliderLabelRow();
            
            // Insert wrapper before the label (label comes first in DOM)
            masteryLabel.parentElement.insertBefore(masteryWrapper, masteryLabel);
            
            // Move elements into structure
            masteryWrapper.appendChild(masteryLabelRow);
            masteryLabelRow.appendChild(masteryLabel);
            masteryLabelRow.appendChild(createMobileSliderSeparator());
            masteryLabelRow.appendChild(masteryValue);
            masteryWrapper.appendChild(masterySlider);
            
            // Style static and value labels
            masteryLabel.textContent = 'Difficulty';
            applyMobileSliderLabelTextStyles(masteryLabel);
            applyMobileSliderLabelTextStyles(masteryValue);

            // Apply shared slider input styles
            applyMobileSliderInputBaseStyles(masterySlider);
        }
        
        // Stack A/V offset slider: label + value on same line, slider below
        const avSlider = document.getElementById('player-av-offset-slider');
        const avLabel = document.getElementById('player-av-offset-slider-label');
        const avValue = document.getElementById('player-av-offset-label');
        if (avSlider && avLabel && avValue && 
            avSlider.parentElement === controls && 
            avLabel.parentElement === controls && 
            avValue.parentElement === controls) {
            
            // Create column wrapper
            var avWrapper = createMobileSliderWrapper(WRAPPER_IDS.AV);
            
            // Create horizontal row for label + value
            var avLabelRow = createMobileSliderLabelRow();
            
            // Insert wrapper before the label (label comes first in DOM)
            avLabel.parentElement.insertBefore(avWrapper, avLabel);
            
            // Move elements into structure
            avWrapper.appendChild(avLabelRow);
            avLabelRow.appendChild(avLabel);
            avLabelRow.appendChild(createMobileSliderSeparator());
            avLabelRow.appendChild(avValue);
            avWrapper.appendChild(avSlider);
            
            // Style static and value labels
            avLabel.textContent = 'Offset';
            applyMobileSliderLabelTextStyles(avLabel);
            applyMobileSliderLabelTextStyles(avValue);

            // Apply shared slider input styles
            applyMobileSliderInputBaseStyles(avSlider);
        }
        
        // Hide all non-essential controls and set order for non-priority controls
        Array.from(controls.children).forEach(el => {
            const isPriority = el.id === 'arr-select' || 
                              el.id === 'mobile-back-btn' ||
                              el.id === 'btn-play' ||
                              (el.tagName === 'BUTTON' && el.getAttribute('onclick')?.includes('seekBy('));
            
            if (!isPriority && !el.id?.startsWith('mobile-')) {
                el.style.order = CONTROL_ORDER.REST;
            }
            
            if (!isEssentialControl(el)) {
                hideControl(el);
            }
        });
        
        // Watch for plugin buttons being injected after initial load
        startControlsObserver(controls);
        
        // Run multiple passes to catch late-injected buttons (plugins load at different times)
        // Pass 1: 100ms - catches early plugins
        scheduleEnhancement(reclassifyAllControls, 100);
        // Pass 2: 300ms - catches most plugins
        scheduleEnhancement(reclassifyAllControls, 300);
        // Pass 3: 600ms - catches slow plugins
        scheduleEnhancement(reclassifyAllControls, 600);
        
        // Create minimalist chevron indicator (floats above controls with bounce animation)
        if (!_ui.swipeIndicator) {
            _ui.swipeIndicator = document.createElement('div');
            _ui.swipeIndicator.id = HELPER_IDS.SWIPE_INDICATOR;
            _ui.swipeIndicator.style.cssText = `
                position: absolute;
                top: -18px;
                left: 50%;
                transform: translateX(-50%) scaleY(-1);
                pointer-events: none;
                user-select: none;
                z-index: 100;
            `;
            
            const chevronInner = document.createElement('div');
            chevronInner.textContent = '⌄';
            chevronInner.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: ${CFG.chevronSize + 8}px;
                line-height: 1;
                color: rgba(255, 255, 255, 0.5);
                text-shadow: 0 0 8px rgba(255, 255, 255, 0.3), 0 0 12px rgba(255, 255, 255, 0.2);
                animation: chevronBounce 2.5s ease-in-out infinite;
            `;
            
            _ui.swipeIndicator.appendChild(chevronInner);
            controls.appendChild(_ui.swipeIndicator);
        }
        
        // Apply control order and margins
        applyControlOrder();

        // Ensure controls container has position: relative for absolute positioning
        controls.style.position = 'relative';
        
        // Find close button and transform into a left-positioned Back icon button
        const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
            const onclick = btn.getAttribute('onclick');
            return onclick && onclick.includes("showScreen('home')");
        });
        if (closeButton) {
            transformCloseButton(closeButton);
            closeButton.style.order = CONTROL_ORDER.BACK;
            closeButton.classList.remove('ml-auto');
            closeButton.style.marginLeft = '0';
            closeButton.style.marginRight = _ui.expanded ? '0' : ((DEVICE === 'phone') ? '4px' : '12px');
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Re-application & Classification
    // ─────────────────────────────────────────────────────────────────
    
    /**
     * Reapply control order values without recreating wrappers.
     * Used on song re-entry to fix misalignment.
     */
    function reapplyControlOrder() {
        applyControlOrder();
        reapplyMobileSliderWrapperStyles();
        reclassifyAllControls();
    }

    function reapplyMobileSliderWrapperStyles() {
        var masteryWrapper = document.getElementById(WRAPPER_IDS.MASTERY);
        var speedWrapper = document.getElementById(WRAPPER_IDS.SPEED);
        var avWrapper = document.getElementById(WRAPPER_IDS.AV);

        [masteryWrapper, speedWrapper, avWrapper].forEach(function(wrapper) {
            if (!wrapper) return;
            applyMobileSliderWrapperBaseStyles(wrapper);
            var labelRow = wrapper.querySelector('div');
            if (labelRow) applyMobileSliderLabelRowStyles(labelRow);
        });

        applyMobileSliderLabelTextStylesById([
            'mastery-slider-label',
            'mastery-label',
            'mobile-speed-static-label',
            'speed-label',
            'player-av-offset-slider-label',
            'player-av-offset-label'
        ]);

        var speedSlider = document.getElementById('speed-slider');
        var masterySlider = document.getElementById('mastery-slider');
        var avSlider = document.getElementById('player-av-offset-slider');

        if (speedSlider) {
            applyMobileSliderInputBaseStyles(speedSlider, { includeMinWidth: false });
        }
        if (masterySlider) {
            applyMobileSliderInputBaseStyles(masterySlider, { includeMinWidth: false });
        }
        if (avSlider) {
            applyMobileSliderInputBaseStyles(avSlider, { includeMinWidth: false });
        }

        applyExpandedSliderRowStyles();
    }
    
    /**
     * Re-classify all controls in the player (catches late-injected buttons)
     * Forces correct display state on ALL controls, not just new ones
     */
    function reclassifyAllControls() {
        const controls = document.getElementById('player-controls');
        if (!controls) return;

        updateCurrentSongStemState();

        const shouldRebuildExpandedRows = _ui.expanded;
        if (shouldRebuildExpandedRows) {
            teardownExpandedControlRows(controls);
            applyControlOrder();
        }

        Array.from(controls.children).forEach(el => {
            if (isHelperElement(el)) return;
            
            const isPriority = el.id === 'arr-select' || 
                              el.id === 'mobile-back-btn' ||
                              el.id === 'btn-play' ||
                              (el.tagName === 'BUTTON' && el.getAttribute('onclick')?.includes('seekBy('));
            
            if (!isPriority && !el.id?.startsWith('mobile-') && !el.style.order) {
                el.style.order = CONTROL_ORDER.REST;
            }
            
            if (isEssentialControl(el)) {
                if (el.classList.contains('mobile-hide-advanced')) {
                    el.classList.remove('mobile-hide-advanced');
                    el.classList.remove('mobile-hidden');
                }
            } else {
                el.classList.add('mobile-hide-advanced');
                if (_ui.expanded) {
                    el.classList.remove('mobile-hidden');
                } else {
                    el.classList.add('mobile-hidden');
                }
            }
        });

        if (shouldRebuildExpandedRows) {
            buildExpandedControlRows(controls);
        }

        // Ensure close button is transformed into a Back icon at far left (order: -1)
        const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
            const onclick = btn.getAttribute('onclick');
            return onclick && onclick.includes("showScreen('home')");
        });
        if (closeButton && closeButton.style.order !== CONTROL_ORDER.BACK) {
            transformCloseButton(closeButton);
            closeButton.style.order = CONTROL_ORDER.BACK;
            closeButton.classList.remove('ml-auto');
            closeButton.style.marginLeft = '0';
            closeButton.style.marginRight = _ui.expanded ? '0' : ((DEVICE === 'phone') ? '4px' : '12px');
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Observer & Toggle
    // ─────────────────────────────────────────────────────────────────
    
    /**
     * Start observing #player-controls for new buttons added by plugins
     * @param {HTMLElement} controls - The player controls container
     */
    function startControlsObserver(controls) {
        stopControlsObserver();
        
        _controlsObserver = createManagedObserver({
            target: controls,
            batchWithRAF: true,
            options: {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style']
            },
            handler: (mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType !== Node.ELEMENT_NODE) return;
                            if (isHelperElement(node)) return;
                            if (isInsideWrapper(node)) return;
                            if (isSectionRowWrapper(node)) return;
                            if (node.closest && isSectionRowWrapper(node.closest('.mnh-section-row'))) return;

                            updateCurrentSongStemState();

                            if (isStemsControl(node) && !_currentSongHasStems) {
                                hideStaleStemsControl(node);
                                return;
                            }

                            if (node.tagName === 'BUTTON') {
                                node.classList.add('mobile-button');
                            }

                            if (!isEssentialControl(node)) {
                                hideControl(node);
                            }

                            if (_ui.expanded) {
                                var wrappers = ensureExpandedControlRows(controls);
                                var rowId = classifyControlForExpandedRow(node);
                                if (!rowId) return;
                                var wrap = wrappers[rowId];
                                if (wrap && node.parentElement !== wrap) {
                                    if (!_expandedControlPlacement.has(node)) {
                                        _expandedControlPlacement.set(node, {
                                            parent: node.parentElement,
                                            nextSibling: node.nextSibling,
                                            order: node.style.order,
                                            display: node.style.display,
                                            marginLeft: node.style.marginLeft,
                                            marginRight: node.style.marginRight
                                        });
                                        _expandedControlMovedOrder.push(node);
                                    }
                                    wrap.appendChild(node);
                                    if (rowId === ROW_IDS.STEMS) {
                                        applyStemsRowVisibility();
                                    }
                                }
                            }
                        });
                    } else if (mutation.type === 'attributes') {
                        const target = mutation.target;

                        if (isHelperElement(target)) return;
                        if (isInsideWrapper(target)) return;
                        if (isSectionRowWrapper(target)) return;
                        if (target.closest && isSectionRowWrapper(target.closest('.mnh-section-row'))) return;

                        if (target.nodeType === Node.ELEMENT_NODE && !isEssentialControl(target)) {
                            if (!target.classList.contains('mobile-hide-advanced')) {
                                target.classList.add('mobile-hide-advanced');
                            }
                            if (target.tagName === 'BUTTON' && !target.classList.contains('mobile-button')) {
                                target.classList.add('mobile-button');
                            }
                            if (!_ui.expanded && !target.classList.contains('mobile-hidden')) {
                                target.classList.add('mobile-hidden');
                            }
                        }
                    }
                }
            }
        });
        
        _controlsObserver.start();
    }
    
    /**
     * Stop observing #player-controls
     */
    function stopControlsObserver() {
        if (_controlsObserver) {
            _controlsObserver.stop();
            _controlsObserver = null;
        }
    }
    
    /**
     * Toggle advanced controls visibility
     */
    function toggleAdvancedControls(forceState) {
        if (typeof forceState === 'boolean') {
            _ui.expanded = forceState;
        } else {
            _ui.expanded = !_ui.expanded;
        }
        
        // Update chevron indicator - flip and reposition based on mode
        if (_ui.swipeIndicator) {
            if (_ui.expanded) {
                // Expanded: down chevron (normal), position higher (2 rows of controls)
                // Tablet needs more clearance due to larger layout
                _ui.swipeIndicator.style.top = IS_TABLET ? '-42px' : '-28px';
                _ui.swipeIndicator.style.transform = 'translateX(-50%) scaleY(1)';
            } else {
                // Collapsed: up chevron (flipped), position closer (1 row of controls)
                _ui.swipeIndicator.style.top = '-18px';
                _ui.swipeIndicator.style.transform = 'translateX(-50%) scaleY(-1)';
            }
        }

        const controls = document.getElementById('player-controls');
        if (!controls) return;

        applyControlOrder();

        // Collapse: tear down section rows so collapsed visibility is
        // applied to flat controls via the existing loop below.
        if (!_ui.expanded) {
            _expandedSectionState.tools = false;
            teardownExpandedControlRows(controls);
            applyControlOrder();
        }

        // Re-scan ALL controls to catch any late-injected buttons
        Array.from(controls.children).forEach(el => {
            if (isHelperElement(el)) return;
            
            const isPriority = el.id === 'arr-select' || 
                              el.id === 'mobile-back-btn' ||
                              el.id === 'btn-play' ||
                              (el.tagName === 'BUTTON' && el.getAttribute('onclick')?.includes('seekBy('));
            
            if (!isPriority && !el.id?.startsWith('mobile-') && !el.style.order) {
                el.style.order = CONTROL_ORDER.REST;
            }
            
            const isEssential = isEssentialControl(el);
            
            if (isEssential) {
                el.classList.remove('mobile-hide-advanced');
            } else {
                if (!el.classList.contains('mobile-hide-advanced')) {
                    el.classList.add('mobile-hide-advanced');
                }
                if (_ui.expanded) {
                    el.classList.remove('mobile-hidden');
                } else {
                    el.classList.add('mobile-hidden');
                }
            }
        });

        // Expand: move controls into section rows now that mobile-hidden
        // has been removed by the visibility loop above.
        if (_ui.expanded) {
            buildExpandedControlRows(controls);
        }

        // Transform close button
        const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
            const onclick = btn.getAttribute('onclick');
            return onclick && onclick.includes("showScreen('home')");
        });
        if (closeButton) {
            transformCloseButton(closeButton);
            closeButton.style.order = CONTROL_ORDER.BACK;
            closeButton.classList.remove('ml-auto');
            closeButton.style.marginLeft = '0';
            closeButton.style.marginRight = _ui.expanded ? '0' : ((DEVICE === 'phone') ? '4px' : '12px');
        }

        scheduleHighwayLayoutRefresh('controls-toggle');
    }

    // ─────────────────────────────────────────────────────────────────
    // Utility & Scheduling
    // ─────────────────────────────────────────────────────────────────
    
    /**
     * Schedule an enhancement with automatic cleanup tracking
     */
    function scheduleEnhancement(fn, delay) {
        const id = setTimeout(() => {
            _timers.pending = _timers.pending.filter(tid => tid !== id);
            fn();
        }, delay);
        _timers.pending.push(id);
    }

    function clearPendingEnhancements() {
        _timers.pending.forEach(clearTimeout);
        _timers.pending = [];
    }

    function refreshHighwayLayout() {
        if (getCurrentScreenId() !== 'player') return;

        if (window.highway && typeof window.highway.resize === 'function') {
            try {
                window.highway.resize();
                return;
            } catch (_) {}
        }

        window.dispatchEvent(new Event('resize'));
    }

    function scheduleHighwayLayoutRefresh(reason) {
        scheduleEnhancement(refreshHighwayLayout, 50);
        scheduleEnhancement(refreshHighwayLayout, 250);
    }

    function scheduleOrientationHighwayLayoutRefresh() {
        scheduleHighwayLayoutRefresh('orientation');
        scheduleEnhancement(refreshHighwayLayout, 500);
        scheduleEnhancement(refreshHighwayLayout, 800);
    }

    function scheduleHighwayViewChangeRefresh() {
        scheduleHighwayLayoutRefresh('highway-view-change');
        scheduleEnhancement(refreshHighwayLayout, 700);
        scheduleEnhancement(refreshHighwayLayout, 1000);

        scheduleEnhancement(startHighway3dObserver, 100);
        scheduleEnhancement(startHighway3dObserver, 500);
        scheduleEnhancement(startHighway3dObserver, 1000);
    }

    function setupHighwayViewChangeRefresh() {
        var picker = document.getElementById('viz-picker');
        if (!picker) return;
        if (_highwayViewChangeTarget === picker) return;

        teardownHighwayViewChangeRefresh();

        _highwayViewChangeHandler = function() {
            scheduleHighwayViewChangeRefresh();
        };

        picker.addEventListener('change', _highwayViewChangeHandler);
        _highwayViewChangeTarget = picker;
    }

    function teardownHighwayViewChangeRefresh() {
        if (_highwayViewChangeTarget && _highwayViewChangeHandler) {
            _highwayViewChangeTarget.removeEventListener('change', _highwayViewChangeHandler);
        }
        _highwayViewChangeTarget = null;
        _highwayViewChangeHandler = null;
    }

    // Shared player-entry/startup timing passes. Keep delays/order in sync with
    // tested startup behavior: early controls enhancement, mid-pass upstream and
    // plugin UI hooks (Mixer, Section Practice, section map, HUD, gestures), and
    // a later pass for the 3D highway overlay.
    function schedulePlayerEntryEnhancements() {
        scheduleEnhancement(enhancePlayerControls, 100);
        scheduleEnhancement(setupMixerPopoverMobileClamp, 250);
        scheduleEnhancement(setupMixerPopoverMobileClamp, 700);
        scheduleEnhancement(ensureSectionPracticeCollapse, 200);
        scheduleEnhancement(ensureSectionPracticeCollapse, 600);
        scheduleEnhancement(enhanceSectionMap, 200);
        scheduleEnhancement(adjustPlayerHud, 200);
        scheduleEnhancement(enableHighwayGestures, 300);
        scheduleEnhancement(enableControlsGestures, 150);
        scheduleEnhancement(startHighway3dObserver, 500);
        scheduleEnhancement(syncLoopMarkerState, 100);
        scheduleEnhancement(setupHighwayViewChangeRefresh, 350);
        scheduleEnhancement(setupHighwayViewChangeRefresh, 800);
    }

    // Post-playSong timing passes. Keep delays/order in sync with tested song-switch
    // behavior: immediate loop state sync, early control/order refresh, upstream UI
    // refreshes, gesture/observer rebinds, reclassification, and Mixer clamp setup.
    function schedulePostPlaySongEnhancements() {
        syncLoopMarkerState();

        scheduleEnhancement(initWhoosh, 100);
        scheduleEnhancement(reapplyControlOrder, 50);
        scheduleEnhancement(ensureSectionPracticeCollapse, 150);
        scheduleEnhancement(ensureSectionPracticeCollapse, 600);
        scheduleEnhancement(enhanceSectionMap, 300);
        scheduleEnhancement(adjustPlayerHud, 300);
        scheduleEnhancement(enableHighwayGestures, 400);
        scheduleEnhancement(enableControlsGestures, 150);
        scheduleEnhancement(startHighway3dObserver, 600);
        scheduleEnhancement(reclassifyAllControls, 150);
        scheduleEnhancement(reclassifyAllControls, 500);
        scheduleEnhancement(setupMixerPopoverMobileClamp, 250);
        scheduleEnhancement(setupMixerPopoverMobileClamp, 700);
        scheduleEnhancement(setupHighwayViewChangeRefresh, 350);
        scheduleEnhancement(setupHighwayViewChangeRefresh, 800);
    }

    // ═══════════════════════════════════════════════════════════════
    // Section Map Mobile Enhancement
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Add live highway updates during section map drag (intercepts section_map plugin's drag)
     */
    function disableSectionMapLiveUpdate() {
        if (!_sectionMapLiveUpdateHandlers) return;

        var handlers = _sectionMapLiveUpdateHandlers;

        if (handlers.sectionMap) {
            handlers.sectionMap.removeEventListener('mousedown', handlers.onDragStart);
            handlers.sectionMap.removeEventListener('touchstart', handlers.onDragStart);
        }

        document.removeEventListener('mousemove', handlers.onDragMove);
        document.removeEventListener('touchmove', handlers.onDragMove);
        document.removeEventListener('mouseup', handlers.onDragEnd);
        document.removeEventListener('touchend', handlers.onDragEnd);

        _sectionMapLiveUpdateHandlers = null;
    }

    function enableSectionMapLiveUpdate() {
        const sectionMap = document.getElementById('section-map');
        if (!sectionMap) return;

        disableSectionMapLiveUpdate();
        
        let isDragging = false;
        let lastUpdateTime = 0;
        let lastX = 0;
        let lastDeltaX = 0;
        let dragStartTime = 0;
        const updateThrottle = 50; // ms - update every 50ms during drag
        
        // Detect when section map drag starts
        const onDragStart = (e) => {
            isDragging = true;
            lastUpdateTime = 0;
            const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            lastX = clientX;
            lastDeltaX = 0;
            dragStartTime = Date.now();
            
            // Initialize whoosh
            initWhoosh();
        };
        
        // Live update audio position during drag
        const onDragMove = (e) => {
            if (!isDragging) return;
            
            const now = Date.now();
            const audio = document.getElementById('audio');
            if (!audio) return;
            
            const sectionMapInfo = window.highway?.getSongInfo();
            if (!sectionMapInfo || !sectionMapInfo.duration) return;
            
            // Calculate time based on pointer position over section map
            const rect = sectionMap.getBoundingClientRect();
            const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const newTime = pct * sectionMapInfo.duration;
            
            // Calculate velocity: pixels per second (horizontal movement)
            const deltaX = clientX - lastX;
            const prevTime = lastUpdateTime || dragStartTime;
            const deltaTime = now - prevTime;
            const velocity = deltaTime > 0 ? (deltaX / deltaTime) * 1000 : 0;
            
            lastX = clientX;
            lastDeltaX = deltaX;
            
            // Update whoosh sound on every move (no throttle for audio feedback)
            if (!_whoosh.active && Math.abs(velocity) > 30) {
                startWhoosh(velocity);
            } else if (_whoosh.active) {
                updateWhoosh(velocity);
            }
            
            // Throttle audio seeking to 50ms for performance
            if (now - lastUpdateTime < updateThrottle) return;
            lastUpdateTime = now;
            
            // Update lastAudioTime to prevent jump detector from resetting
            if (typeof lastAudioTime !== 'undefined') lastAudioTime = newTime;
            
            // Seek without pause/resume dance - just set time directly during drag
            audio.currentTime = Math.max(0, Math.min(audio.duration || 0, newTime));
        };
        
        // Stop tracking when drag ends
        const onDragEnd = () => {
            isDragging = false;
            stopWhoosh();
        };
        
        // Listen on section map for drag start
        sectionMap.addEventListener('mousedown', onDragStart);
        sectionMap.addEventListener('touchstart', onDragStart);
        
        // Listen globally for drag continuation (same as section_map plugin does)
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('touchmove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        document.addEventListener('touchend', onDragEnd);

        _sectionMapLiveUpdateHandlers = {
            sectionMap: sectionMap,
            onDragStart: onDragStart,
            onDragMove: onDragMove,
            onDragEnd: onDragEnd
        };
    }
    
    /**
     * Process section map labels - hide on phone, keep on tablet
     */
    function processSectionMapLabels() {
        const sectionMap = document.getElementById('section-map');
        if (!sectionMap) return;
        
        const labels = sectionMap.querySelectorAll('.sm-block span');
        labels.forEach(label => {
            if (!IS_TABLET) {
                // Phone: hide labels (too cramped)
                if (!label.hasAttribute('data-original-display')) {
                    label.setAttribute('data-original-display', label.style.display || '');
                }
                label.style.display = 'none';
            } else {
                // Tablet: keep labels visible (enough space)
                // Don't modify - let them show naturally
            }
        });
    }
    
    /**
     * Make section map more touch-friendly on mobile
     */
    function enhanceSectionMap() {
        const sectionMap = document.getElementById('section-map');
        if (!sectionMap) return;
        
        // Store original styles for cleanup
        if (!_restore.sectionMap) {
            _restore.sectionMap = {
                height: sectionMap.style.height || '20px'
            };
        }
        
        // Increase height for better touch targets (default 20px → CFG.sectionMapHeight)
        sectionMap.style.height = CFG.sectionMapHeight + 'px';
        
        // Add live highway updates during section map drag
        enableSectionMapLiveUpdate();
        
        // Process any existing labels
        processSectionMapLabels();
        
        // Watch for labels being added/changed (section_map plugin creates them async)
        stopSectionMapObserver();
        
        _sectionMapObserver = createManagedObserver({
            target: '#section-map',
            options: {
                childList: true,
                subtree: true
            },
            handler: () => {
                processSectionMapLabels();
            }
        });
        
        _sectionMapObserver.start();
    }
    
    /**
     * Stop observing section map changes
     */
    function stopSectionMapObserver() {
        if (_sectionMapObserver) {
            _sectionMapObserver.stop();
            _sectionMapObserver = null;
        }
    }
    
    /**
     * Restore section map to original state
     */
    function restoreSectionMap() {
        disableSectionMapLiveUpdate();

        const sectionMap = document.getElementById('section-map');
        if (!sectionMap) return;

        stopSectionMapObserver();
        
        // Restore height
        if (_restore.sectionMap) {
            sectionMap.style.height = _restore.sectionMap.height;
            _restore.sectionMap = null;
        }
        
        // Restore label visibility
        const labels = sectionMap.querySelectorAll('.sm-block span');
        labels.forEach(label => {
            const originalDisplay = label.getAttribute('data-original-display');
            if (originalDisplay !== null) {
                label.style.display = originalDisplay;
                label.removeAttribute('data-original-display');
            }
        });
    }
    
    /**
     * Move player HUD below the section map on mobile
     */
    function adjustPlayerHud() {
        const playerHud = document.getElementById('player-hud');
        if (!playerHud) return;
        
        // Store original styles for cleanup
        if (!_restore.playerHud) {
            _restore.playerHud = {
                top: playerHud.style.top || '0'
            };
        }
        
        // Push it below the section map (add some spacing)
        playerHud.style.top = CFG.playerHudTop + 'px';
    }
    
    /**
     * Restore player HUD to original position
     */
    function restorePlayerHud() {
        const playerHud = document.getElementById('player-hud');
        if (!playerHud) return;
        
        // Restore position
        if (_restore.playerHud) {
            playerHud.style.top = _restore.playerHud.top;
            _restore.playerHud = null;
        }
    }
    
    /**
     * Adjust 3D Highway overlay canvas (where "Up Next" text is drawn)
     */
    function adjustHighway3dOverlay() {
        if (_highway3dAdjusted) return;
        
        // Scope to #player so plugins borrowing the highway_3d factory don't steal the match.
        const wrap = document.querySelector('#player .h3d-wrap');
        if (!wrap) return;
        
        // Store original styles for cleanup (only once)
        if (!_restore.highway3dOverlay) {
            _restore.highway3dOverlay = {
                top: wrap.style.top || ''
            };
        }
        
        wrap.style.setProperty('top', CFG.highway3dTop + 'px', 'important');
        
        _highway3dAdjusted = true;
        
        // Stop observer (successfully found and adjusted)
        stopHighway3dObserver();
    }
    
    /**
     * Start observing for 3D highway overlay creation/changes
     */
    function startHighway3dObserver() {
        stopHighway3dObserver();
        _highway3dAdjusted = false;
        
        // Try to adjust immediately
        adjustHighway3dOverlay();
        
        // Create observer with retry (500ms until 3D highway wrapper appears)
        _highway3dObserver = createManagedObserver({
            target: '#player',
            retryMs: 500,
            options: {
                childList: true,
                subtree: true
            },
            handler: () => {
                adjustHighway3dOverlay();
            }
        });
        
        _highway3dObserver.start();
    }
    
    /**
     * Stop observing 3D highway overlay
     */
    function stopHighway3dObserver() {
        if (_highway3dObserver) {
            _highway3dObserver.stop();
            _highway3dObserver = null;
        }
        _highway3dAdjusted = false;
    }
    
    /**
     * Restore 3D Highway overlay to original position
     */
    function restoreHighway3dOverlay() {
        stopHighway3dObserver();
        
        const wrap = document.querySelector('#player .h3d-wrap');
        if (!wrap) return;
        
        // Restore wrapper position
        if (_restore.highway3dOverlay) {
            wrap.style.top = _restore.highway3dOverlay.top;
            wrap.style.removeProperty('top');
            _restore.highway3dOverlay = null;
        }
        
        _highway3dAdjusted = false;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Whoosh Sound Generator
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Initialize Web Audio for whoosh sounds
     */
    function initWhoosh() {
        if (_whoosh.context) {
            return; // Already initialized
        }
        
        try {
            _whoosh.context = new (window.AudioContext || window.webkitAudioContext)();
        } catch (err) {
            console.error('[mobile_note_highway] ❌ Whoosh init failed:', err);
        }
    }
    
    /**
     * Start whoosh sound based on velocity
     * @param {number} velocity - Pixels per second (positive = forward, negative = rewind)
     */
    async function startWhoosh(velocity) {
        if (!_whoosh.context) return;
        if (_whoosh.active) return; // Already playing
        
        // FORCE cleanup of any stale nodes before creating new ones
        // This prevents "cannot call start more than once" errors
        if (_whoosh.source || _whoosh.gain) {
            const wasActive = _whoosh.active;
            _whoosh.active = true; // Temporarily set so stopWhoosh doesn't early-return
            stopWhoosh();
            _whoosh.active = wasActive;
        }
        
        try {
            // Check if audio feedback is enabled
            if (!getAudioEnabled()) {
                return;
            }
            
            // Resume context if suspended (iOS requirement) - must await!
            if (_whoosh.context.state === 'suspended') {
                await _whoosh.context.resume();
            }
            
            _whoosh.type = getWhooshType();
            const isForward = velocity > 0;
            
            // Create gain (volume control)
            _whoosh.gain = _whoosh.context.createGain();
            _whoosh.gain.gain.value = 0.06; // Softer volume
            
            // Create sound source based on type
            switch (_whoosh.type) {
                case 'sawtooth':
                case 'sine':
                    // Oscillator-based sounds
                    _whoosh.source = _whoosh.context.createOscillator();
                    _whoosh.source.type = _whoosh.type;
                    _whoosh.source.frequency.value = isForward ? 150 : 200;
                    
                    // Filter for sweep effect
                    _whoosh.filter = _whoosh.context.createBiquadFilter();
                    _whoosh.filter.type = 'bandpass';
                    _whoosh.filter.frequency.value = 800;
                    _whoosh.filter.Q.value = 5;
                    
                    _whoosh.source.connect(_whoosh.filter);
                    _whoosh.filter.connect(_whoosh.gain);
                    break;
                    
                case 'whitenoise':
                    // Noise-based sounds (buffer source)
                    if (!_whoosh.noiseBuffer) {
                        // Generate noise buffer (2 seconds)
                        const bufferSize = _whoosh.context.sampleRate * 2;
                        _whoosh.noiseBuffer = _whoosh.context.createBuffer(1, bufferSize, _whoosh.context.sampleRate);
                        const data = _whoosh.noiseBuffer.getChannelData(0);
                        for (let i = 0; i < bufferSize; i++) {
                            data[i] = Math.random() * 2 - 1;
                        }
                    }
                    
                    _whoosh.source = _whoosh.context.createBufferSource();
                    _whoosh.source.buffer = _whoosh.noiseBuffer;
                    _whoosh.source.loop = true;
                    
                    // Filter
                    _whoosh.filter = _whoosh.context.createBiquadFilter();
                    _whoosh.filter.type = 'bandpass';
                    _whoosh.filter.frequency.value = 800;
                    _whoosh.filter.Q.value = 3;
                    
                    _whoosh.source.connect(_whoosh.filter);
                    _whoosh.filter.connect(_whoosh.gain);
                    break;
                    
                case 'tape_flutter':
                    // Warbling tape: sine + AM modulation
                    _whoosh.source = _whoosh.context.createOscillator();
                    _whoosh.source.type = 'sine';
                    _whoosh.source.frequency.value = isForward ? 180 : 250;
                    
                    // LFO for amplitude modulation (creates warble)
                    _whoosh.lfo = _whoosh.context.createOscillator();
                    _whoosh.lfo.type = 'sine';
                    _whoosh.lfo.frequency.value = 6; // 6Hz warble
                    
                    // LFO gain controls modulation depth
                    _whoosh.lfoGain = _whoosh.context.createGain();
                    _whoosh.lfoGain.gain.value = 0.3; // 30% modulation depth
                    
                    // Connect: source → gain (modulated by LFO) → master gain
                    _whoosh.modulatedGain = _whoosh.context.createGain();
                    _whoosh.modulatedGain.gain.value = 0.7; // Base level
                    
                    _whoosh.lfo.connect(_whoosh.lfoGain);
                    _whoosh.lfoGain.connect(_whoosh.modulatedGain.gain);
                    _whoosh.source.connect(_whoosh.modulatedGain);
                    _whoosh.modulatedGain.connect(_whoosh.gain);
                    
                    _whoosh.lfo.start();
                    break;
                    
            }
            
            _whoosh.gain.connect(_whoosh.context.destination);
            _whoosh.source.start();
            _whoosh.active = true;
            
        } catch (err) {
            console.error('[mobile_note_highway] ❌ Whoosh start failed:', err);
        }
    }
    
    /**
     * Update whoosh sound based on current velocity
     * @param {number} velocity - Pixels per second
     */
    function updateWhoosh(velocity) {
        if (!_whoosh.active || !_whoosh.source) return;
        
        try {
            const isForward = velocity > 0;
            const absVel = Math.abs(velocity);
            const now = _whoosh.context.currentTime;
            
            // Volume based on velocity (louder = faster)
            const volume = Math.min(0.12, 0.06 + (absVel / 10000));
            _whoosh.gain.gain.setTargetAtTime(volume, now, 0.05);
            
            switch (_whoosh.type) {
                case 'sawtooth':
                case 'sine':
                    // Sweep frequency with velocity
                    const minFreq = isForward ? 150 : 200;
                    const maxFreq = isForward ? 600 : 800;
                    const freq = minFreq + (absVel / 500) * (maxFreq - minFreq);
                    _whoosh.source.frequency.setTargetAtTime(freq, now, 0.05);
                    
                    // Sweep filter
                    if (_whoosh.filter) {
                        const filterFreq = 400 + absVel * 1.5;
                        _whoosh.filter.frequency.setTargetAtTime(filterFreq, now, 0.05);
                    }
                    break;
                    
                case 'whitenoise':
                    // Only adjust filter sweep for noise
                    if (_whoosh.filter) {
                        const noiseFilterFreq = 600 + absVel * 1.2;
                        _whoosh.filter.frequency.setTargetAtTime(noiseFilterFreq, now, 0.05);
                    }
                    break;
                    
                case 'tape_flutter':
                    // Tape warble: adjust base frequency and LFO rate with speed
                    const tapeMin = isForward ? 180 : 250;
                    const tapeMax = isForward ? 500 : 700;
                    const tapeFreq = tapeMin + (absVel / 600) * (tapeMax - tapeMin);
                    _whoosh.source.frequency.setTargetAtTime(tapeFreq, now, 0.08); // Slower for tape feel
                    
                    // Speed up warble rate as velocity increases
                    if (_whoosh.lfo) {
                        const lfoRate = 6 + (absVel / 200); // 6Hz → faster
                        _whoosh.lfo.frequency.setTargetAtTime(Math.min(lfoRate, 15), now, 0.1);
                    }
                    break;
            }
        } catch (err) {
            console.error('[mobile_note_highway] Whoosh update failed:', err);
        }
    }
    
    /**
     * Stop whoosh sound
     */
    function stopWhoosh() {
        if (!_whoosh.active) return;
        
        // Set inactive FIRST so updateWhoosh doesn't run while we're cleaning up
        _whoosh.active = false;
        _whoosh.type = null;
        
        // Clean up each node independently with try-catch so one failure doesn't block others
        try {
            if (_whoosh.source) {
                try { _whoosh.source.stop(); } catch (e) { /* already stopped */ }
                _whoosh.source.disconnect();
                _whoosh.source = null;
            }
        } catch (err) {
            console.warn('[mobile_note_highway] Source cleanup failed:', err);
        }
        
        try {
            if (_whoosh.filter) {
                _whoosh.filter.disconnect();
                _whoosh.filter = null;
            }
        } catch (err) { /* ignore */ }
        
        try {
            if (_whoosh.gain) {
                _whoosh.gain.disconnect();
                _whoosh.gain = null;
            }
        } catch (err) { /* ignore */ }
        
        // Tape flutter cleanup (LFO + modulation nodes)
        try {
            if (_whoosh.lfo) {
                try { _whoosh.lfo.stop(); } catch (e) { /* already stopped */ }
                _whoosh.lfo.disconnect();
                _whoosh.lfo = null;
            }
        } catch (err) { /* ignore */ }
        
        try {
            if (_whoosh.lfoGain) {
                _whoosh.lfoGain.disconnect();
                _whoosh.lfoGain = null;
            }
        } catch (err) { /* ignore */ }
        
        try {
            if (_whoosh.modulatedGain) {
                _whoosh.modulatedGain.disconnect();
                _whoosh.modulatedGain = null;
            }
        } catch (err) { /* ignore */ }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Gesture Detection
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Enable swipe and tap gestures on the highway
     */
    function enableHighwayGestures() {
        const highway = document.getElementById('highway');
        if (!highway) return;

        if (_highwayGesturesTarget === highway) return;

        disableHighwayGestures();

        highway.addEventListener('touchstart', onGestureStart, { passive: true });
        highway.addEventListener('touchmove', onGestureMove, { passive: false });
        highway.addEventListener('touchend', onGestureEnd, { passive: false });

        _highwayGesturesTarget = highway;
    }
    
    /**
     * Disable highway gestures
     */
    function disableHighwayGestures() {
        if (!_highwayGesturesTarget) return;

        _highwayGesturesTarget.removeEventListener('touchstart', onGestureStart);
        _highwayGesturesTarget.removeEventListener('touchmove', onGestureMove);
        _highwayGesturesTarget.removeEventListener('touchend', onGestureEnd);

        _highwayGesturesTarget = null;
    }
    
    /**
     * Handle touch start for gesture detection
     */
    function onGestureStart(e) {
        if (!e.touches || e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        const audio = document.getElementById('audio');
        
        _highway.gestureStartX = touch.clientX;
        _highway.gestureStartY = touch.clientY;
        _highway.gestureStartTime = Date.now();
        _highway.gestureActive = true;
        _highway.scrubActive = false;
        _highway.scrubStartTime = audio ? audio.currentTime : 0;
        _highway.scrubLastUpdate = 0;
        _highway.scrubLastDeltaY = 0;
        
    }
    
    /**
     * Handle touch move for scrubbing
     */
    function onGestureMove(e) {
        if (!_highway.gestureActive) {
            return;
        }
        if (!e.touches || e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - _highway.gestureStartX;
        const deltaY = touch.clientY - _highway.gestureStartY;
        
        // Prevent pull-to-refresh on any vertical movement
        if (Math.abs(deltaY) > 5) {
            e.preventDefault();
        }
        
        // Enter scrub mode if vertical movement exceeds threshold
        if (!_highway.scrubActive && Math.abs(deltaY) > CFG.scrubMinMovement) {
            _highway.scrubActive = true;
            // Remember if audio was playing before scrub started
            const audio = document.getElementById('audio');
            _highway.wasPlayingBeforeScrub = audio && !audio.paused;
            
            // Initialize whoosh audio context
            initWhoosh();
            
        }
        
        // If in scrub mode, update audio position
        if (_highway.scrubActive) {
            const now = Date.now();
            // Throttle updates (but not the first one)
            if (_highway.scrubLastUpdate > 0 && now - _highway.scrubLastUpdate < CFG.scrubThrottleMs) {
                return; // Throttle updates
            }
            
            const audio = document.getElementById('audio');
            if (!audio) {
                return;
            }
            
            // Pause audio during scrub (iOS-compatible)
            if (!audio.paused) {
                audio.pause();
            }
            
            // Calculate velocity: pixels per second (use gestureStartTime for first frame)
            const prevTime = _highway.scrubLastUpdate || _highway.gestureStartTime;
            const deltaTime = now - prevTime;
            const deltaYChange = deltaY - _highway.scrubLastDeltaY;
            _highway.scrubLastDeltaY = deltaY;
            const velocity = deltaTime > 0 ? (deltaYChange / deltaTime) * 1000 : 0;
            
            _highway.scrubLastUpdate = now;
            
            // Update visual position based on total movement
            // Apply scrub sensitivity multiplier from settings
            const sensitivity = getScrubSensitivity();
            const timeDelta = deltaY * CFG.scrubTimePerPixel * sensitivity;
            const newTime = Math.max(0, Math.min(audio.duration || 0, _highway.scrubStartTime + timeDelta));
            
            // Update lastAudioTime to prevent jump detector from resetting
            if (typeof lastAudioTime !== 'undefined') lastAudioTime = newTime;
            
            // Set position
            audio.currentTime = newTime;
            
            // Start or update whoosh sound based on velocity (lowered threshold for easier triggering)
            if (!_whoosh.active && Math.abs(velocity) > 30) {
                startWhoosh(velocity);
            } else if (_whoosh.active) {
                updateWhoosh(velocity);
            }
        }
    }
    
    /**
     * Handle touch end for gesture detection
     */
    function onGestureEnd(e) {
        if (!_highway.gestureActive) return;
        if (!e.changedTouches || e.changedTouches.length !== 1) return;
        
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - _highway.gestureStartX;
        const deltaY = touch.clientY - _highway.gestureStartY;
        const deltaTime = Date.now() - _highway.gestureStartTime;
        
        const wasScrubbing = _highway.scrubActive;
        
        _highway.gestureActive = false;
        _highway.scrubActive = false;
        
        // If we were scrubbing, restore normal playback and exit
        if (wasScrubbing) {
            e.preventDefault();
            
            // Stop whoosh sound
            stopWhoosh();
            
            const audio = document.getElementById('audio');
            if (audio) {
                audio.playbackRate = 1.0;
                // Restore play state from before scrub
                if (_highway.wasPlayingBeforeScrub && audio.paused) {
                    audio.play().catch(() => {});
                } else if (!_highway.wasPlayingBeforeScrub && !audio.paused) {
                    audio.pause();
                }
            }
            
            return;
        }
        
        // Check for tap (quick touch with minimal movement)
        const isQuickTap = deltaTime < CFG.tapMaxDurationMs && Math.abs(deltaX) < CFG.tapMaxMovementPx && Math.abs(deltaY) < CFG.tapMaxMovementPx;
        
        if (isQuickTap) {
            e.preventDefault();
            const now = Date.now();
            const timeSinceLastTap = now - _highway.lastTapTime;
            
            if (timeSinceLastTap < CFG.doubleTapWindowMs && timeSinceLastTap > 0) {
                // Second tap detected: cancel timeout, reverse first tap, execute double-tap
                if (_timers.doubleTap) {
                    clearTimeout(_timers.doubleTap);
                    _timers.doubleTap = null;
                }
                _highway.lastTapTime = 0;
                
                // Clear any existing feedback from the first tap
                const existing = document.getElementById('gesture-feedback');
                if (existing) existing.remove();
                
                // Reverse the single tap (toggle play/pause back) - silently, no feedback
                handleSingleTap(true);
                // Then execute the double-tap action
                handleDoubleTap();
            } else {
                // First tap: execute immediately
                _highway.lastTapTime = now;
                handleSingleTap();
                
                // Start double-tap window timer
                _timers.doubleTap = setTimeout(() => {
                    _highway.lastTapTime = 0;
                    _timers.doubleTap = null;
                }, CFG.doubleTapWindowMs);
            }
            return;
        }
    }
    
    /**
     * Handle single tap gesture (Play/Pause)
     * @param {boolean} silent - If true, suppress feedback message
     */
    function handleSingleTap(silent = false) {
        const audio = document.getElementById('audio');
        if (!audio) return;
        
        if (audio.paused) {
            audio.play();
            if (typeof window.setPlayButtonState === 'function') {
                window.setPlayButtonState(true);
            }
            if (!silent) showGestureFeedback('Play');
        } else {
            audio.pause();
            if (typeof window.setPlayButtonState === 'function') {
                window.setPlayButtonState(false);
            }
            if (!silent) showGestureFeedback('Pause');
        }
    }
    
    /**
     * Sync loop marker state with actual loop values from app
     */
    function syncLoopMarkerState() {
        const loop = window.slopsmith?.getLoop?.();
        if (!loop) return;
        
        if (loop.loopA !== null && loop.loopB !== null) {
            _highway.loopMarkerState = 'b-set';
        } else if (loop.loopA !== null) {
            _highway.loopMarkerState = 'a-set';
        } else {
            _highway.loopMarkerState = 'ready';
        }
    }
    
    /**
     * Handle double tap gesture (Set A/B loop markers)
     * Cycles through: set A → set B → clear
     */
    function handleDoubleTap() {
        // Sync state before acting (in case loop was set externally)
        syncLoopMarkerState();
        
        if (_highway.loopMarkerState === 'ready') {
            // Set loop start (A)
            if (typeof window.setLoopStart === 'function') {
                window.setLoopStart();
                _highway.loopMarkerState = 'a-set';
                triggerHaptic(10);  // Short buzz for A
                showGestureFeedback('Loop Start (A)');
            }
        } else if (_highway.loopMarkerState === 'a-set') {
            // Set loop end (B)
            if (typeof window.setLoopEnd === 'function') {
                window.setLoopEnd();
                _highway.loopMarkerState = 'b-set';
                triggerHaptic(20);  // Medium buzz for B
                showGestureFeedback('Loop End (B)');
            }
        } else {
            // Clear loop and reset
            if (typeof window.clearLoop === 'function') {
                window.clearLoop();
                _highway.loopMarkerState = 'ready';
                triggerHaptic(30);  // Longer buzz for clear
                showGestureFeedback('Loop Cleared');
            }
        }
    }
    
    /**
     * Show visual feedback for gesture actions
     */
    function showGestureFeedback(text) {
        const existing = document.getElementById('gesture-feedback');
        if (existing) existing.remove();
        
        // Create feedback element
        const feedback = document.createElement('div');
        feedback.id = 'gesture-feedback';
        feedback.textContent = text;
        feedback.style.cssText = `
            position: fixed;
            bottom: ${CFG.buttonHeight + 20}px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.4);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            z-index: 9999;
            pointer-events: none;
            animation: gesture-fade 0.6s ease-out forwards;
        `;
        
        // Add CSS animation if not already present
        if (!document.getElementById('gesture-feedback-style')) {
            const style = document.createElement('style');
            style.id = 'gesture-feedback-style';
            style.textContent = `
                @keyframes gesture-fade {
                    0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
                    20% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    80% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    100% { opacity: 0; transform: translateX(-50%) translateY(-5px); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(feedback);
        
        // Auto-remove after animation
        setTimeout(() => feedback.remove(), 600);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Controls Gestures (Swipe up/down to expand/collapse)
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Enable swipe gestures on player controls
     */
    function enableControlsGestures() {
        const controls = document.getElementById('player-controls');
        if (!controls) return;

        if (_controlsGesturesTarget === controls) return;

        disableControlsGestures();

        controls.addEventListener('touchstart', onControlsGestureStart, { passive: true });
        controls.addEventListener('touchmove', onControlsGestureMove, { passive: false });
        controls.addEventListener('touchend', onControlsGestureEnd, { passive: false });

        _controlsGesturesTarget = controls;
    }
    
    /**
     * Disable controls gestures
     */
    function disableControlsGestures() {
        if (!_controlsGesturesTarget) return;

        _controlsGesturesTarget.removeEventListener('touchstart', onControlsGestureStart);
        _controlsGesturesTarget.removeEventListener('touchmove', onControlsGestureMove);
        _controlsGesturesTarget.removeEventListener('touchend', onControlsGestureEnd);

        _controlsGesturesTarget = null;
    }
    
    /**
     * Handle touch start on controls
     */
    function onControlsGestureStart(e) {
        if (!e.touches || e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        _controls.gestureStartX = touch.clientX;
        _controls.gestureStartY = touch.clientY;
        _controls.gestureStartTime = Date.now();
        _controls.gestureActive = true;
    }
    
    /**
     * Handle touch move on controls - prevent pull-to-refresh when swiping vertically
     */
    function onControlsGestureMove(e) {
        if (!_controls.gestureActive) return;
        if (!e.touches || e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        const deltaY = _controls.gestureStartY - touch.clientY;
        const deltaX = touch.clientX - _controls.gestureStartX;
        
        // If moving vertically more than horizontally, prevent default to stop pull-to-refresh
        // Use a low threshold (lower than the swipe detection) to catch it early
        if (Math.abs(deltaY) > CFG.pullToRefreshGuardPx && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
            e.preventDefault();
        }
    }
    
    /**
     * Handle touch end on controls
     */
    function onControlsGestureEnd(e) {
        if (!_controls.gestureActive) return;
        if (!e.changedTouches || e.changedTouches.length !== 1) return;
        
        const touch = e.changedTouches[0];
        const deltaY = _controls.gestureStartY - touch.clientY;  // Negative = down, positive = up
        const deltaTime = Date.now() - _controls.gestureStartTime;
        
        _controls.gestureActive = false;
        
        const isSwipe = Math.abs(deltaY) > CFG.swipeVerticalThreshold && deltaTime < CFG.swipeMaxDurationMs;
        
        if (!isSwipe) return;
        
        if (deltaY > 0 && !_ui.expanded) {
            toggleAdvancedControls();
        } else if (deltaY < 0 && _ui.expanded) {
            toggleAdvancedControls();
        }
        
        e.preventDefault();
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Lifecycle
    // ═══════════════════════════════════════════════════════════════

    function clearInteractionTimers() {
        if (_timers.doubleTap) {
            clearTimeout(_timers.doubleTap);
            _timers.doubleTap = null;
        }
    }

    function removeSwipeIndicator() {
        if (_ui.swipeIndicator && _ui.swipeIndicator.parentElement) {
            _ui.swipeIndicator.remove();
            _ui.swipeIndicator = null;
        }
    }

    function restoreMobileBackButton(controls) {
        if (!controls) return;
        var backBtn = controls.querySelector('#mobile-back-btn') || Array.from(controls.querySelectorAll('button')).find(function(btn) {
            var onclick = btn.getAttribute('onclick');
            return onclick && onclick.indexOf("showScreen('home')") !== -1;
        });
        if (backBtn) {
            restoreCloseButton(backBtn);
            backBtn.style.order = '';
            backBtn.style.marginLeft = '';
            backBtn.style.marginRight = '';
        }
    }

    function restoreMobileControlVisibility() {
        document.querySelectorAll('.mobile-hide-advanced').forEach(function(el) {
            el.classList.remove('mobile-hide-advanced');
            el.style.display = '';
        });
    }

    function restoreMobileTouchTargets(controls) {
        if (!controls) return;

        Array.from(controls.querySelectorAll('button')).forEach(function(btn) {
            btn.style.minHeight = '';
            btn.style.minWidth = '';
            btn.style.padding = '';
        });

        Array.from(controls.querySelectorAll('.seek-label')).forEach(function(label) {
            label.style.display = '';
        });

        Array.from(controls.querySelectorAll('input[type="range"]')).forEach(function(slider) {
            slider.style.minHeight = '';
        });
    }

    function resetMobileUiState() {
        applyExpandedSliderRowStyles(false);
        _expandedSectionState.tools = false;
        _ui.expanded = false;
    }

    function resetMobileSliderLabelStyles(el) {
        if (!el) return;
        el.style.fontSize = '';
        el.style.lineHeight = '';
        el.style.fontWeight = '';
        el.style.margin = '';
        el.style.padding = '';
        el.style.marginBottom = '';
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
        el.style.textAlign = '';
        el.style.width = '';
    }

    function resetMobileSliderInputStyles(el) {
        if (!el) return;
        el.style.minHeight = '';
        el.style.height = '';
        el.style.minWidth = '';
        el.style.width = '';
    }

    function restoreMobileSliderWrapper(controls, wrapperId, orderedElementIds) {
        var wrapper = document.getElementById(wrapperId);
        if (!controls || !wrapper || wrapper.parentElement !== controls) return;

        orderedElementIds.forEach(function(id) {
            var el = document.getElementById(id);
            if (!el || !wrapper.contains(el)) return;

            controls.insertBefore(el, wrapper);

            if (el.tagName === 'INPUT') {
                resetMobileSliderInputStyles(el);
            } else {
                resetMobileSliderLabelStyles(el);
            }
        });

        wrapper.remove();
    }

    function restoreMobileSliderWrappers(controls) {
        restoreMobileSliderWrapper(controls, WRAPPER_IDS.MASTERY, [
            'mastery-slider-label',
            'mastery-label',
            'mastery-slider'
        ]);

        // Preserve current tested Speed cleanup final order.
        // Existing Speed-only cleanup inserted speed-slider before speed-label.
        restoreMobileSliderWrapper(controls, WRAPPER_IDS.SPEED, [
            'speed-slider',
            'speed-label'
        ]);

        restoreMobileSliderWrapper(controls, WRAPPER_IDS.AV, [
            'player-av-offset-slider-label',
            'player-av-offset-label',
            'player-av-offset-slider'
        ]);
    }

    /**
     * Remove Mobile Note Highway enhancements
     */
    function cleanup() {
        clearPendingEnhancements();
        clearInteractionTimers();
        stopControlsObserver();

        var controls = document.getElementById('player-controls');
        if (controls) {
            teardownExpandedControlRows(controls);
        }

        removeSwipeIndicator();
        restoreMobileBackButton(controls);

        teardownSectionPracticeCollapse();
        teardownMixerPopoverMobileClamp();
        teardownHighwayViewChangeRefresh();

        restoreMobileControlVisibility();
        restoreMobileSliderWrappers(controls);

        restoreMobileTouchTargets(controls);
        resetMobileUiState();
    }
    
    /**
     * Initialize Mobile Note Highway plugin
     */
    function init() {
        if (!isMobile() || !getPluginEnabled()) return;
        
        // Inject CSS classes
        injectMobileStyles();
        
        // Setup resize listener
        setupResizeListener();
        
        window.slopsmith.on('screen:changed', (e) => {
            const screenId = e.detail.id || e.detail.screen;
            
            if (screenId === 'player') {
                schedulePlayerEntryEnhancements();
            } else {
                stopWhoosh();
                cleanup();
                restoreSectionMap();
                restorePlayerHud();
                restoreHighway3dOverlay();
                disableHighwayGestures();
                disableControlsGestures();
            }
        });

        // Listen for song:loaded to refresh stems state from current song metadata.
        // highway.js emits 'song:loaded' after song_info is assigned.
        window.slopsmith.on('song:loaded', function() {
            updateCurrentSongStemState();
            if (window.slopsmith && window.slopsmith.getCurrentScreen && window.slopsmith.getCurrentScreen() === 'player') {
                scheduleEnhancement(ensureSectionPracticeCollapse, 100);
                scheduleEnhancement(ensureSectionPracticeCollapse, 400);
                scheduleEnhancement(reclassifyAllControls, 50);
                scheduleEnhancement(reclassifyAllControls, 250);
            }
        });

        // Hook into playSong to re-enhance section map when it re-renders
        const origPlaySong = window.playSong;
        if (origPlaySong) {
            window.playSong = async function(filename, arrangement) {
                // Cancel any pending enhancements from previous song
                clearPendingEnhancements();
                
                // Stop any active whoosh from previous song/scrubbing
                stopWhoosh();

                _currentSongHasStems = false;

                await origPlaySong(filename, arrangement);

                schedulePostPlaySongEnhancements();
            };
        }
        
        // Stop whoosh when user navigates away or switches tabs
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stopWhoosh();
            }
        });
        
        window.addEventListener('pagehide', () => {
            stopWhoosh();
        });
        
        // Stop whoosh when audio is paused (covers pause button, space bar, etc.)
        const audio = document.querySelector('audio');
        if (audio) {
            audio.addEventListener('pause', () => {
                stopWhoosh();
            });
        }
        
        // Hook into loop functions to sync marker state when user clicks UI buttons
        const origSetLoopStart = window.setLoopStart;
        if (typeof origSetLoopStart === 'function') {
            window.setLoopStart = function() {
                origSetLoopStart();
                _highway.loopMarkerState = 'a-set';
            };
        }
        
        const origSetLoopEnd = window.setLoopEnd;
        if (typeof origSetLoopEnd === 'function') {
            window.setLoopEnd = function() {
                origSetLoopEnd();
                _highway.loopMarkerState = 'b-set';
            };
        }
        
        const origClearLoop = window.clearLoop;
        if (typeof origClearLoop === 'function') {
            window.clearLoop = function() {
                origClearLoop();
                _highway.loopMarkerState = 'ready';
            };
        }
        
        const currentScreen = window.slopsmith.getCurrentScreen?.();
        if (currentScreen === 'player') {
            schedulePlayerEntryEnhancements();
        }
    }
    
    // Boot when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Export settings function for settings panel
    window.mnhSetPluginEnabled = function(enabled) {
        try {
            localStorage.setItem('mobile_note_highway.enabled', String(enabled));
        } catch (err) {
            console.error('[mobile_note_highway] Failed to save enabled state:', err);
        }
    };

    window.mnhSetWhooshType = function(type) {
        try {
            localStorage.setItem('mobile_note_highway.whooshType', normalizeWhooshType(type));
        } catch (err) {
            console.error('[mobile_note_highway] Failed to save whoosh type:', err);
        }
    };
    
    window.mnhSetAudioEnabled = function(enabled) {
        try {
            localStorage.setItem('mobile_note_highway.audioEnabled', String(enabled));
            // Stop any active whoosh if disabling
            if (!enabled && _whoosh.active) {
                stopWhoosh();
            }
        } catch (err) {
            console.error('[mobile_note_highway] Failed to save audio enabled:', err);
        }
    };
    
    window.mnhSetScrubSensitivity = function(value) {
        try {
            const sensitivity = parseFloat(value);
            localStorage.setItem('mobile_note_highway.scrubSensitivity', String(sensitivity));
        } catch (err) {
            console.error('[mobile_note_highway] Failed to save scrub sensitivity:', err);
        }
    };
    
    window.mnhSetCollapsedControl = function(device, value) {
        try {
            const key = 'mobile_note_highway.collapsed.' + device;
            const storedValue = Array.isArray(value) ? value.slice(0, 3).join(',') : value;
            localStorage.setItem(key, storedValue);
        } catch (err) {
            console.error('[mobile_note_highway] Failed to save collapsed control setting:', err);
        }
    };
    
})();
