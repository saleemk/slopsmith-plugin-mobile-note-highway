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
     * Phone behavior is unchanged. Tablet values are scaled up for iPad ergonomics.
     */
    const CONFIG = {
        phone: {
            buttonHeight: 44,           // px
            buttonPaddingX: 16,         // px (horizontal padding)
            chevronSize: 20,            // px font-size
            chevronSpacerWidth: 30,     // px flex spacer width
            sliderTrackHeight: 20,      // px (slider element height inside wrapper)
            sliderWrapperHeight: 44,    // px (column wrapper height)
            sliderLabelFontSize: 9,     // px
            sliderMinWidth: 85,         // px (wider now that back button freed space)
            selectHeight: 44,           // px (arrangement, HD, 3D highway dropdowns)
            selectWidth: 110,           // px (arrangement dropdown width)
            sectionMapHeight: 44,       // px
            playerHudTop: 40,           // px
            highway3dTop: 105,          // px
            tapMaxDurationMs: 300,
            tapMaxMovementPx: 10,
            doubleTapWindowMs: 250,
            scrubTimePerPixel: 0.05,        // 20px = 1 second
            scrubThrottleMs: 100,           // Update audio every 100ms
            scrubMinMovement: 15,           // px - min vertical movement to enter scrub mode
            swipeVerticalThreshold: 40,
            swipeMaxDurationMs: 500,
            pullToRefreshGuardPx: 10,
        },
        tablet: {
            buttonHeight: 44,
            buttonPaddingX: 20,
            chevronSize: 28,
            chevronSpacerWidth: 48,
            sliderTrackHeight: 20,
            sliderWrapperHeight: 44,
            sliderLabelFontSize: 11,
            sliderMinWidth: 140,
            selectHeight: 44,
            selectWidth: 200,           // px (arrangement dropdown width)
            sectionMapHeight: 44,
            playerHudTop: 40,
            highway3dTop: 105,
            tapMaxDurationMs: 300,
            tapMaxMovementPx: 10,
            doubleTapWindowMs: 250,
            scrubTimePerPixel: 0.05,        // 20px = 1 second
            scrubThrottleMs: 100,           // Update audio every 100ms
            scrubMinMovement: 15,           // px - min vertical movement to enter scrub mode
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
        expanded: false,
        swipeIndicator: null,
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
        gestureStartX: 0,
        gestureStartY: 0,
        gestureStartTime: 0,
        gestureActive: false,
        lastTapTime: 0,
        loopMarkerState: 'ready',  // 'ready' | 'a-set' | 'b-set'
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
        gestureStartX: 0,
        gestureStartY: 0,
        gestureStartTime: 0,
        gestureActive: false,
    };
    
    // Original styles (for restore on cleanup)
    const _restore = {
        sectionMap: null,
        playerHud: null,
        highway3dOverlay: null,
        sectionPractice: null,
        mixerPopover: null,
    };
    
    // Timers (for cleanup on song change / screen exit)
    const _timers = {
        pending: [],
        doubleTap: null,
        resize: null,
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
    let _themeReapplyScheduled = false;
    
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

    const DEFAULT_MNH_THEME_ID = 'dark-neon';
    const VALID_MNH_THEME_IDS = [
        'dark-neon',
        'classic-dark',
        'carbon-mint',
        'matrix',
        'midnight-blue',
        'digital-lavender',
        'verdant-green',
        'sunset',
        'mocha-mousse',
        'desert-sand',
        'muted-rose',
        'corporate-navy',
        'nordic-slate'
    ];

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
               isPluginInsertAnchor(element) ||
               isSectionHeaderElement(element);
    }

    function isPluginInsertAnchor(element) {
        return !!(
            element &&
            element.nodeType === Node.ELEMENT_NODE &&
            element.tagName === 'SPAN' &&
            element.classList?.contains('text-gray-700') &&
            (element.textContent || '').trim() === '|'
        );
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
            header.classList.toggle('mnh-more-pill-open', open);
        }
        applyExpandedLandscapeToolsRowsLayout();
        scheduleHighwayLayoutRefresh();
    }

    function ensureExpandedSectionHeaders(controls) {
        var pluginsRow = document.getElementById(ROW_IDS.PLUGINS);
        if (!pluginsRow) return;
        var header = document.getElementById(SECTION_HEADER_IDS.PLUGINS);
        if (!header) {
            header = document.createElement('button');
            header.id = SECTION_HEADER_IDS.PLUGINS;
            header.type = 'button';
            header.className = HELPER_CLASSES.SECTION_HEADER + ' mnh-more-pill';
            header.setAttribute('data-mnh-section-target', ROW_IDS.PLUGINS);
            header.setAttribute('aria-controls', ROW_IDS.PLUGINS);
            header.style.cssText = [
                'display:inline-flex',
                'align-items:center',
                'justify-content:center',
                'gap:6px',
                'width:auto',
                'height:36px',
                'min-height:36px',
                'padding:0 12px',
                'border:1px solid rgba(75,85,99,0.25)',
                'border-radius:999px',
                'background:rgba(17,24,39,0.28)',
                'color:#cbd5e1',
                'font-size:12px',
                'font-weight:600',
                'white-space:nowrap',
                'flex:0 0 auto',
                'text-align:center'
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
    // Section Practice is upstream-owned. When core provides its own
    // pill/control (#section-practice-control / #section-practice-pill),
    // MNH leaves it alone. Otherwise MNH creates a custom collapsible header
    // (#mnh-section-practice-header) to toggle the legacy bar in place.

    function hasUpstreamSectionPracticeControl() {
        var ctrl = document.getElementById('section-practice-control');
        var pill = document.getElementById('section-practice-pill');

        return !!(
            (ctrl && ctrl.closest && ctrl.closest('#player-footer, #v3-player-rail')) ||
            (pill && pill.closest && pill.closest('#section-practice-control'))
        );
    }

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
        if (hasUpstreamSectionPracticeControl()) {
            teardownSectionPracticeCollapse();
            return;
        }

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
        if (hasUpstreamSectionPracticeControl()) {
            teardownSectionPracticeCollapse();
            return;
        }

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

        scheduleHighwayLayoutRefresh();
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

            .mnh-theme-dark-neon.mnh-control-deck {
                background:
                    linear-gradient(180deg, rgba(15,23,42,0.98), rgba(8,10,24,0.96)) !important;
                border-radius: 16px 16px 0 0 !important;
                box-shadow:
                    0 -10px 28px rgba(15,23,42,0.55),
                    inset 0 1px 0 rgba(96,165,250,0.18) !important;
                color: #e5e7eb !important;
            }

            .mnh-theme-dark-neon.mnh-collapsed-deck {
                background:
                    linear-gradient(180deg, rgba(15,23,42,0.94), rgba(8,10,24,0.92)) !important;
                box-shadow:
                    0 -8px 22px rgba(15,23,42,0.45),
                    inset 0 1px 0 rgba(96,165,250,0.14) !important;
                color: #e5e7eb !important;
            }

            .mnh-theme-dark-neon.mnh-collapsed-deck .mnh-button-primary {
                background: linear-gradient(180deg, #60a5fa, #3b82f6) !important;
                border: 1px solid rgba(147,197,253,0.62) !important;
                box-shadow:
                    0 0 14px rgba(59,130,246,0.34),
                    inset 0 1px 0 rgba(255,255,255,0.22) !important;
                color: #eff6ff !important;
            }

            .mnh-theme-dark-neon.mnh-collapsed-deck .mnh-button-secondary {
                background: rgba(15,23,42,0.64) !important;
                border: 1px solid rgba(96,165,250,0.16) !important;
                color: #e5e7eb !important;
            }

            .mnh-theme-dark-neon .mnh-section-row {
                background: rgba(15,23,42,0.34);
                outline: 1px solid rgba(96,165,250,0.12);
                border-radius: 12px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
            }

            .mnh-theme-dark-neon .mnh-button-primary {
                background: linear-gradient(180deg, #60a5fa, #3b82f6) !important;
                border: 1px solid rgba(147,197,253,0.7) !important;
                border-radius: 12px !important;
                box-shadow:
                    0 0 18px rgba(59,130,246,0.45),
                    inset 0 1px 0 rgba(255,255,255,0.28) !important;
                color: #eff6ff !important;
                font-weight: 700 !important;
            }

            .mnh-theme-dark-neon .mnh-button-secondary,
            .mnh-theme-dark-neon .nd-detect-btn {
                background: rgba(15,23,42,0.66) !important;
                border: 1px solid rgba(96,165,250,0.16) !important;
                border-radius: 11px !important;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important;
                color: #e5e7eb !important;
            }

            .mnh-theme-dark-neon .mnh-button-secondary:active,
            .mnh-theme-dark-neon .mnh-more-pill:active {
                background: rgba(30,41,59,0.96) !important;
                border-color: rgba(96,165,250,0.45) !important;
            }

            .mnh-theme-dark-neon .mnh-more-pill {
                background:
                    linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,41,59,0.86)) !important;
                border: 1px solid rgba(168,85,247,0.32) !important;
                box-shadow:
                    0 0 14px rgba(59,130,246,0.16),
                    inset 0 1px 0 rgba(255,255,255,0.06) !important;
                color: #e5e7eb !important;
            }

            .mnh-theme-dark-neon .mnh-more-pill-open {
                border-color: rgba(96,165,250,0.58) !important;
                box-shadow:
                    0 0 18px rgba(59,130,246,0.38),
                    0 0 10px rgba(168,85,247,0.22),
                    inset 0 1px 0 rgba(255,255,255,0.08) !important;
            }

            .mnh-theme-dark-neon .mnh-more-tray {
                background: rgba(8,10,24,0.54);
                outline-color: rgba(168,85,247,0.16);
            }

            .mnh-theme-dark-neon .mnh-select {
                background: rgba(15,23,42,0.92) !important;
                border: 1px solid rgba(96,165,250,0.28) !important;
                border-radius: 10px !important;
                box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02) !important;
                color: #e5e7eb !important;
            }

            .mnh-theme-dark-neon .mnh-select:focus {
                border-color: rgba(96,165,250,0.45) !important;
                box-shadow:
                    0 0 0 2px rgba(59,130,246,0.18),
                    inset 0 0 0 1px rgba(255,255,255,0.03) !important;
                outline: none !important;
            }

            .mnh-theme-dark-neon .mnh-slider-card {
                box-sizing: border-box;
                background: rgba(8,10,24,0.36);
                outline: 1px solid rgba(96,165,250,0.14);
                border-radius: 12px;
                box-shadow:
                    inset 0 1px 0 rgba(255,255,255,0.04),
                    0 0 10px rgba(59,130,246,0.08);
            }

            .mnh-theme-dark-neon .mnh-slider-card span,
            .mnh-theme-dark-neon .mnh-slider-card label {
                color: #cbd5e1 !important;
            }

            .mnh-theme-dark-neon .mnh-slider-card:focus-within {
                outline-color: rgba(96,165,250,0.36);
                box-shadow:
                    inset 0 1px 0 rgba(255,255,255,0.05),
                    0 0 12px rgba(59,130,246,0.18);
            }

            .mnh-theme-dark-neon .mnh-slider-cluster {
                background: rgba(8,10,24,0.28);
                outline: 1px solid rgba(96,165,250,0.10);
                border-radius: 14px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.035);
            }

            .mnh-theme-dark-neon .mnh-slider-cluster .mnh-slider-card {
                background: transparent;
                outline: none;
                box-shadow: none;
                justify-content: center !important;
            }

            .mnh-theme-dark-neon .mnh-slider-cluster .mnh-slider-card span,
            .mnh-theme-dark-neon .mnh-slider-cluster .mnh-slider-card label {
                color: rgba(203,213,225,0.82) !important;
                font-size: 9px !important;
                font-weight: 500 !important;
            }

            .mnh-theme-dark-neon.mnh-collapsed-deck .mnh-slider-card {
                background: transparent;
                outline-color: transparent;
                box-shadow: none;
            }

            .mnh-theme-dark-neon .mnh-slider {
                --sm-accent: 96, 165, 250;
                accent-color: #60a5fa !important;
                filter: drop-shadow(0 0 4px rgba(59,130,246,0.28));
            }

            .mnh-theme-dark-neon .mnh-chip,
            .mnh-theme-dark-neon #mnh-row-stems button {
                background: rgba(15,23,42,0.68) !important;
                border: 1px solid rgba(96,165,250,0.16) !important;
                border-radius: 10px !important;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important;
                color: #cbd5e1 !important;
                font-weight: 650 !important;
            }

            .mnh-theme-dark-neon .mnh-chip-active,
            .mnh-theme-dark-neon #mnh-row-stems button[aria-pressed="true"] {
                background: linear-gradient(180deg, rgba(59,130,246,0.34), rgba(37,99,235,0.28)) !important;
                border-color: rgba(96,165,250,0.6) !important;
                box-shadow:
                    0 0 12px rgba(59,130,246,0.28),
                    inset 0 1px 0 rgba(255,255,255,0.11) !important;
                color: #dbeafe !important;
            }

            .mnh-theme-dark-neon .mnh-button-active,
            .mnh-theme-dark-neon .nd-detect-btn[class*="bg-green"] {
                background: linear-gradient(180deg, rgba(34,197,94,0.42), rgba(21,128,61,0.34)) !important;
                border: 1px solid rgba(74,222,128,0.58) !important;
                border-radius: 11px !important;
                box-shadow:
                    0 0 16px rgba(34,197,94,0.3),
                    inset 0 1px 0 rgba(255,255,255,0.12) !important;
                color: #ecfdf5 !important;
                font-weight: 700 !important;
            }

            .mnh-theme-dark-neon button:disabled,
            .mnh-theme-dark-neon .mnh-button-disabled {
                opacity: 0.46 !important;
                background: rgba(15,23,42,0.48) !important;
                border-color: rgba(148,163,184,0.18) !important;
                box-shadow: none !important;
                color: #94a3b8 !important;
                cursor: not-allowed !important;
            }

            .mnh-theme-classic-dark.mnh-control-deck {
                background:
                    linear-gradient(180deg, rgba(17,24,39,0.98), rgba(9,14,28,0.96)) !important;
                border-radius: 16px 16px 0 0 !important;
                box-shadow:
                    0 -8px 22px rgba(3,7,18,0.42),
                    inset 0 1px 0 rgba(96,165,250,0.12) !important;
                color: #e5e7eb !important;
            }

            .mnh-theme-classic-dark.mnh-collapsed-deck {
                background:
                    linear-gradient(180deg, rgba(17,24,39,0.94), rgba(9,14,28,0.92)) !important;
                box-shadow:
                    0 -6px 18px rgba(3,7,18,0.36),
                    inset 0 1px 0 rgba(96,165,250,0.10) !important;
                color: #e5e7eb !important;
            }

            .mnh-theme-classic-dark .mnh-section-row {
                background: rgba(15,23,42,0.28);
                outline: 1px solid rgba(148,163,184,0.12);
                border-radius: 12px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
            }

            .mnh-theme-classic-dark .mnh-button-primary {
                background: linear-gradient(180deg, #3b82f6, #2563eb) !important;
                border: 1px solid rgba(147,197,253,0.52) !important;
                border-radius: 12px !important;
                box-shadow:
                    0 0 12px rgba(37,99,235,0.26),
                    inset 0 1px 0 rgba(255,255,255,0.18) !important;
                color: #eff6ff !important;
                font-weight: 700 !important;
            }

            .mnh-theme-classic-dark .mnh-button-secondary,
            .mnh-theme-classic-dark .nd-detect-btn {
                background: rgba(30,41,59,0.68) !important;
                border: 1px solid rgba(148,163,184,0.18) !important;
                border-radius: 11px !important;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important;
                color: #d1d5db !important;
            }

            .mnh-theme-classic-dark .mnh-button-secondary:active,
            .mnh-theme-classic-dark .mnh-more-pill:active {
                background: rgba(51,65,85,0.82) !important;
                border-color: rgba(96,165,250,0.34) !important;
            }

            .mnh-theme-classic-dark .mnh-more-pill {
                background:
                    linear-gradient(135deg, rgba(30,41,59,0.86), rgba(15,23,42,0.82)) !important;
                border: 1px solid rgba(250,204,21,0.22) !important;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.04) !important;
                color: #e5e7eb !important;
            }

            .mnh-theme-classic-dark .mnh-more-pill-open {
                border-color: rgba(96,165,250,0.42) !important;
                box-shadow:
                    0 0 12px rgba(37,99,235,0.18),
                    inset 0 1px 0 rgba(255,255,255,0.06) !important;
            }

            .mnh-theme-classic-dark .mnh-more-tray {
                background: rgba(9,14,28,0.44);
                outline-color: rgba(250,204,21,0.10);
            }

            .mnh-theme-classic-dark .mnh-select {
                background: rgba(15,23,42,0.92) !important;
                border: 1px solid rgba(148,163,184,0.22) !important;
                border-radius: 10px !important;
                box-shadow: inset 0 0 0 1px rgba(255,255,255,0.015) !important;
                color: #e5e7eb !important;
            }

            .mnh-theme-classic-dark .mnh-select:focus {
                border-color: rgba(96,165,250,0.40) !important;
                box-shadow:
                    0 0 0 2px rgba(37,99,235,0.12),
                    inset 0 0 0 1px rgba(255,255,255,0.02) !important;
                outline: none !important;
            }

            .mnh-theme-classic-dark .mnh-slider-card {
                box-sizing: border-box;
                background: rgba(15,23,42,0.28);
                outline: 1px solid rgba(148,163,184,0.12);
                border-radius: 12px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
            }

            .mnh-theme-classic-dark .mnh-slider-card span,
            .mnh-theme-classic-dark .mnh-slider-card label {
                color: #cbd5e1 !important;
            }

            .mnh-theme-classic-dark .mnh-slider-card:focus-within {
                outline-color: rgba(96,165,250,0.30);
                box-shadow: 0 0 10px rgba(37,99,235,0.12);
            }

            .mnh-theme-classic-dark .mnh-slider-cluster {
                background: rgba(9,14,28,0.24);
                outline: 1px solid rgba(148,163,184,0.10);
                border-radius: 14px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.025);
            }

            .mnh-theme-classic-dark .mnh-slider-cluster .mnh-slider-card {
                background: transparent;
                outline: none;
                box-shadow: none;
                justify-content: center !important;
            }

            .mnh-theme-classic-dark .mnh-slider-cluster .mnh-slider-card span,
            .mnh-theme-classic-dark .mnh-slider-cluster .mnh-slider-card label {
                color: rgba(203,213,225,0.82) !important;
                font-size: 9px !important;
                font-weight: 500 !important;
            }

            .mnh-theme-classic-dark.mnh-collapsed-deck .mnh-slider-card {
                background: transparent;
                outline-color: transparent;
                box-shadow: none;
            }

            .mnh-theme-classic-dark .mnh-slider {
                --sm-accent: 59, 130, 246;
                accent-color: #3b82f6 !important;
                filter: drop-shadow(0 0 3px rgba(37,99,235,0.16));
            }

            .mnh-theme-classic-dark .mnh-chip,
            .mnh-theme-classic-dark #mnh-row-stems button {
                background: rgba(30,41,59,0.64) !important;
                border: 1px solid rgba(148,163,184,0.18) !important;
                border-radius: 10px !important;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important;
                color: #cbd5e1 !important;
                font-weight: 650 !important;
            }

            .mnh-theme-classic-dark .mnh-chip-active,
            .mnh-theme-classic-dark #mnh-row-stems button[aria-pressed="true"] {
                background: linear-gradient(180deg, rgba(37,99,235,0.30), rgba(30,64,175,0.24)) !important;
                border-color: rgba(96,165,250,0.48) !important;
                box-shadow:
                    0 0 10px rgba(37,99,235,0.18),
                    inset 0 1px 0 rgba(255,255,255,0.08) !important;
                color: #dbeafe !important;
            }

            .mnh-theme-classic-dark .mnh-button-active,
            .mnh-theme-classic-dark .nd-detect-btn[class*="bg-green"] {
                background: linear-gradient(180deg, rgba(34,197,94,0.32), rgba(21,128,61,0.26)) !important;
                border: 1px solid rgba(74,222,128,0.42) !important;
                border-radius: 11px !important;
                box-shadow:
                    0 0 12px rgba(34,197,94,0.18),
                    inset 0 1px 0 rgba(255,255,255,0.08) !important;
                color: #ecfdf5 !important;
                font-weight: 700 !important;
            }

            .mnh-theme-classic-dark button:disabled,
            .mnh-theme-classic-dark .mnh-button-disabled {
                opacity: 0.48 !important;
                background: rgba(15,23,42,0.46) !important;
                border-color: rgba(148,163,184,0.14) !important;
                box-shadow: none !important;
                color: #94a3b8 !important;
                cursor: not-allowed !important;
            }

            .mnh-theme-carbon-mint.mnh-control-deck {
                background:
                    linear-gradient(180deg, rgba(18,24,27,0.98), rgba(7,11,13,0.96)) !important;
                border-radius: 16px 16px 0 0 !important;
                box-shadow:
                    0 -10px 26px rgba(6,12,14,0.50),
                    inset 0 1px 0 rgba(45,212,191,0.16) !important;
                color: #e2f5f2 !important;
            }

            .mnh-theme-carbon-mint.mnh-collapsed-deck {
                background:
                    linear-gradient(180deg, rgba(18,24,27,0.94), rgba(7,11,13,0.92)) !important;
                box-shadow:
                    0 -8px 20px rgba(6,12,14,0.44),
                    inset 0 1px 0 rgba(45,212,191,0.13) !important;
                color: #e2f5f2 !important;
            }

            .mnh-theme-carbon-mint .mnh-section-row {
                background: rgba(18,24,27,0.36);
                outline: 1px solid rgba(45,212,191,0.12);
                border-radius: 12px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.035);
            }

            .mnh-theme-carbon-mint .mnh-button-primary {
                background: linear-gradient(180deg, #5eead4, #14b8a6) !important;
                border: 1px solid rgba(153,246,228,0.62) !important;
                border-radius: 12px !important;
                box-shadow:
                    0 0 16px rgba(20,184,166,0.34),
                    inset 0 1px 0 rgba(255,255,255,0.24) !important;
                color: #042f2e !important;
                font-weight: 800 !important;
            }

            .mnh-theme-carbon-mint .mnh-button-secondary,
            .mnh-theme-carbon-mint .nd-detect-btn {
                background: rgba(24,32,35,0.70) !important;
                border: 1px solid rgba(45,212,191,0.18) !important;
                border-radius: 11px !important;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important;
                color: #d7f4ef !important;
            }

            .mnh-theme-carbon-mint .mnh-button-secondary:active,
            .mnh-theme-carbon-mint .mnh-more-pill:active {
                background: rgba(31,41,45,0.86) !important;
                border-color: rgba(45,212,191,0.40) !important;
            }

            .mnh-theme-carbon-mint .mnh-more-pill {
                background:
                    linear-gradient(135deg, rgba(24,32,35,0.90), rgba(12,18,20,0.86)) !important;
                border: 1px solid rgba(34,211,238,0.24) !important;
                box-shadow:
                    0 0 12px rgba(20,184,166,0.12),
                    inset 0 1px 0 rgba(255,255,255,0.045) !important;
                color: #e2f5f2 !important;
            }

            .mnh-theme-carbon-mint .mnh-more-pill-open {
                border-color: rgba(45,212,191,0.50) !important;
                box-shadow:
                    0 0 16px rgba(20,184,166,0.26),
                    inset 0 1px 0 rgba(255,255,255,0.07) !important;
            }

            .mnh-theme-carbon-mint .mnh-more-tray {
                background: rgba(7,11,13,0.50);
                outline-color: rgba(34,211,238,0.12);
            }

            .mnh-theme-carbon-mint .mnh-select {
                background: rgba(18,24,27,0.94) !important;
                border: 1px solid rgba(45,212,191,0.24) !important;
                border-radius: 10px !important;
                box-shadow: inset 0 0 0 1px rgba(255,255,255,0.018) !important;
                color: #e2f5f2 !important;
            }

            .mnh-theme-carbon-mint .mnh-select:focus {
                border-color: rgba(45,212,191,0.48) !important;
                box-shadow:
                    0 0 0 2px rgba(20,184,166,0.16),
                    inset 0 0 0 1px rgba(255,255,255,0.025) !important;
                outline: none !important;
            }

            .mnh-theme-carbon-mint .mnh-slider-card {
                box-sizing: border-box;
                background: rgba(18,24,27,0.34);
                outline: 1px solid rgba(45,212,191,0.12);
                border-radius: 12px;
                box-shadow:
                    inset 0 1px 0 rgba(255,255,255,0.035),
                    0 0 8px rgba(20,184,166,0.06);
            }

            .mnh-theme-carbon-mint .mnh-slider-card span,
            .mnh-theme-carbon-mint .mnh-slider-card label {
                color: #c6e7e2 !important;
            }

            .mnh-theme-carbon-mint .mnh-slider-card:focus-within {
                outline-color: rgba(45,212,191,0.36);
                box-shadow: 0 0 10px rgba(20,184,166,0.14);
            }

            .mnh-theme-carbon-mint .mnh-slider-cluster {
                background: rgba(7,11,13,0.28);
                outline: 1px solid rgba(45,212,191,0.10);
                border-radius: 14px;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
            }

            .mnh-theme-carbon-mint .mnh-slider-cluster .mnh-slider-card {
                background: transparent;
                outline: none;
                box-shadow: none;
                justify-content: center !important;
            }

            .mnh-theme-carbon-mint .mnh-slider-cluster .mnh-slider-card span,
            .mnh-theme-carbon-mint .mnh-slider-cluster .mnh-slider-card label {
                color: rgba(198,231,226,0.84) !important;
                font-size: 9px !important;
                font-weight: 500 !important;
            }

            .mnh-theme-carbon-mint.mnh-collapsed-deck .mnh-slider-card {
                background: transparent;
                outline-color: transparent;
                box-shadow: none;
            }

            .mnh-theme-carbon-mint .mnh-slider {
                --sm-accent: 45, 212, 191;
                accent-color: #2dd4bf !important;
                filter: drop-shadow(0 0 4px rgba(20,184,166,0.22));
            }

            .mnh-theme-carbon-mint .mnh-chip,
            .mnh-theme-carbon-mint #mnh-row-stems button {
                background: rgba(24,32,35,0.68) !important;
                border: 1px solid rgba(45,212,191,0.18) !important;
                border-radius: 10px !important;
                box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important;
                color: #c6e7e2 !important;
                font-weight: 650 !important;
            }

            .mnh-theme-carbon-mint .mnh-chip-active,
            .mnh-theme-carbon-mint #mnh-row-stems button[aria-pressed="true"] {
                background: linear-gradient(180deg, rgba(45,212,191,0.34), rgba(20,184,166,0.26)) !important;
                border-color: rgba(94,234,212,0.56) !important;
                box-shadow:
                    0 0 12px rgba(20,184,166,0.24),
                    inset 0 1px 0 rgba(255,255,255,0.10) !important;
                color: #ccfbf1 !important;
            }

            .mnh-theme-carbon-mint .mnh-button-active,
            .mnh-theme-carbon-mint .nd-detect-btn[class*="bg-green"] {
                background: linear-gradient(180deg, rgba(45,212,191,0.38), rgba(22,163,74,0.28)) !important;
                border: 1px solid rgba(94,234,212,0.52) !important;
                border-radius: 11px !important;
                box-shadow:
                    0 0 14px rgba(20,184,166,0.25),
                    inset 0 1px 0 rgba(255,255,255,0.10) !important;
                color: #ecfdf5 !important;
                font-weight: 700 !important;
            }

            .mnh-theme-carbon-mint button:disabled,
            .mnh-theme-carbon-mint .mnh-button-disabled {
                opacity: 0.48 !important;
                background: rgba(18,24,27,0.46) !important;
                border-color: rgba(148,163,184,0.14) !important;
                box-shadow: none !important;
                color: #8ea7a2 !important;
                cursor: not-allowed !important;
            }

            .mnh-theme-matrix.mnh-control-deck { background: linear-gradient(180deg, rgba(0,12,4,0.98), rgba(0,0,0,0.96)) !important; border-radius: 16px 16px 0 0 !important; box-shadow: 0 -9px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(34,197,94,0.18) !important; color: #dcfce7 !important; }
            .mnh-theme-matrix.mnh-collapsed-deck { background: linear-gradient(180deg, rgba(0,12,4,0.94), rgba(0,0,0,0.92)) !important; box-shadow: 0 -7px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(34,197,94,0.14) !important; color: #dcfce7 !important; }
            .mnh-theme-matrix .mnh-section-row { background: rgba(0,20,8,0.34); outline: 1px solid rgba(34,197,94,0.14); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(187,247,208,0.035); }
            .mnh-theme-matrix .mnh-button-primary { background: linear-gradient(180deg, #4ade80, #16a34a) !important; border: 1px solid rgba(134,239,172,0.62) !important; border-radius: 12px !important; box-shadow: 0 0 14px rgba(34,197,94,0.30), inset 0 1px 0 rgba(255,255,255,0.20) !important; color: #021807 !important; font-weight: 800 !important; }
            .mnh-theme-matrix .mnh-button-secondary, .mnh-theme-matrix .nd-detect-btn { background: rgba(0,18,6,0.70) !important; border: 1px solid rgba(34,197,94,0.18) !important; border-radius: 11px !important; box-shadow: inset 0 1px 0 rgba(187,247,208,0.025) !important; color: #bbf7d0 !important; }
            .mnh-theme-matrix .mnh-button-secondary:active, .mnh-theme-matrix .mnh-more-pill:active { background: rgba(5,46,22,0.84) !important; border-color: rgba(74,222,128,0.42) !important; }
            .mnh-theme-matrix .mnh-more-pill { background: linear-gradient(135deg, rgba(0,18,6,0.90), rgba(0,0,0,0.86)) !important; border: 1px solid rgba(34,197,94,0.24) !important; box-shadow: 0 0 12px rgba(34,197,94,0.12), inset 0 1px 0 rgba(187,247,208,0.04) !important; color: #dcfce7 !important; }
            .mnh-theme-matrix .mnh-more-pill-open { border-color: rgba(74,222,128,0.52) !important; box-shadow: 0 0 16px rgba(34,197,94,0.24), inset 0 1px 0 rgba(187,247,208,0.06) !important; }
            .mnh-theme-matrix .mnh-more-tray { background: rgba(0,0,0,0.52); outline-color: rgba(34,197,94,0.12); }
            .mnh-theme-matrix .mnh-select { background: rgba(0,12,4,0.94) !important; border: 1px solid rgba(34,197,94,0.24) !important; border-radius: 10px !important; color: #dcfce7 !important; box-shadow: inset 0 0 0 1px rgba(187,247,208,0.015) !important; }
            .mnh-theme-matrix .mnh-select:focus { border-color: rgba(74,222,128,0.46) !important; box-shadow: 0 0 0 2px rgba(34,197,94,0.14), inset 0 0 0 1px rgba(187,247,208,0.02) !important; outline: none !important; }
            .mnh-theme-matrix .mnh-slider-card { box-sizing: border-box; background: rgba(0,18,6,0.32); outline: 1px solid rgba(34,197,94,0.12); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(187,247,208,0.025); }
            .mnh-theme-matrix .mnh-slider-card span, .mnh-theme-matrix .mnh-slider-card label { color: #bbf7d0 !important; }
            .mnh-theme-matrix .mnh-slider-card:focus-within { outline-color: rgba(74,222,128,0.34); box-shadow: 0 0 10px rgba(34,197,94,0.13); }
            .mnh-theme-matrix .mnh-slider-cluster { background: rgba(0,0,0,0.28); outline: 1px solid rgba(34,197,94,0.10); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(187,247,208,0.025); }
            .mnh-theme-matrix .mnh-slider-cluster .mnh-slider-card { background: transparent; outline: none; box-shadow: none; justify-content: center !important; }
            .mnh-theme-matrix .mnh-slider-cluster .mnh-slider-card span, .mnh-theme-matrix .mnh-slider-cluster .mnh-slider-card label { color: rgba(187,247,208,0.84) !important; font-size: 9px !important; font-weight: 500 !important; }
            .mnh-theme-matrix.mnh-collapsed-deck .mnh-slider-card { background: transparent; outline-color: transparent; box-shadow: none; }
            .mnh-theme-matrix .mnh-slider { --sm-accent: 34, 197, 94; accent-color: #22c55e !important; filter: drop-shadow(0 0 4px rgba(34,197,94,0.22)); }
            .mnh-theme-matrix .mnh-chip, .mnh-theme-matrix #mnh-row-stems button { background: rgba(0,18,6,0.68) !important; border: 1px solid rgba(34,197,94,0.18) !important; border-radius: 10px !important; box-shadow: inset 0 1px 0 rgba(187,247,208,0.025) !important; color: #bbf7d0 !important; font-weight: 650 !important; }
            .mnh-theme-matrix .mnh-chip-active, .mnh-theme-matrix #mnh-row-stems button[aria-pressed="true"] { background: linear-gradient(180deg, rgba(34,197,94,0.34), rgba(22,163,74,0.26)) !important; border-color: rgba(74,222,128,0.56) !important; box-shadow: 0 0 12px rgba(34,197,94,0.22), inset 0 1px 0 rgba(187,247,208,0.10) !important; color: #dcfce7 !important; }
            .mnh-theme-matrix .mnh-button-active, .mnh-theme-matrix .nd-detect-btn[class*="bg-green"] { background: linear-gradient(180deg, rgba(34,197,94,0.42), rgba(22,163,74,0.34)) !important; border: 1px solid rgba(74,222,128,0.58) !important; border-radius: 11px !important; box-shadow: 0 0 14px rgba(34,197,94,0.26), inset 0 1px 0 rgba(187,247,208,0.10) !important; color: #ecfdf5 !important; font-weight: 700 !important; }
            .mnh-theme-matrix button:disabled, .mnh-theme-matrix .mnh-button-disabled { opacity: 0.48 !important; background: rgba(0,12,4,0.46) !important; border-color: rgba(74,222,128,0.14) !important; box-shadow: none !important; color: #86efac !important; cursor: not-allowed !important; }

            .mnh-theme-midnight-blue.mnh-control-deck { background: linear-gradient(180deg, rgba(10,18,39,0.98), rgba(3,7,18,0.96)) !important; border-radius: 16px 16px 0 0 !important; box-shadow: 0 -10px 26px rgba(3,7,18,0.50), inset 0 1px 0 rgba(59,130,246,0.18) !important; color: #e0f2fe !important; }
            .mnh-theme-midnight-blue.mnh-collapsed-deck { background: linear-gradient(180deg, rgba(10,18,39,0.94), rgba(3,7,18,0.92)) !important; box-shadow: 0 -8px 20px rgba(3,7,18,0.44), inset 0 1px 0 rgba(59,130,246,0.14) !important; color: #e0f2fe !important; }
            .mnh-theme-midnight-blue .mnh-section-row { background: rgba(15,23,42,0.36); outline: 1px solid rgba(59,130,246,0.13); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
            .mnh-theme-midnight-blue .mnh-button-primary { background: linear-gradient(180deg, #38bdf8, #2563eb) !important; border: 1px solid rgba(125,211,252,0.62) !important; border-radius: 12px !important; box-shadow: 0 0 16px rgba(37,99,235,0.32), inset 0 1px 0 rgba(255,255,255,0.22) !important; color: #eff6ff !important; font-weight: 800 !important; }
            .mnh-theme-midnight-blue .mnh-button-secondary, .mnh-theme-midnight-blue .nd-detect-btn { background: rgba(15,23,42,0.70) !important; border: 1px solid rgba(96,165,250,0.18) !important; border-radius: 11px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important; color: #dbeafe !important; }
            .mnh-theme-midnight-blue .mnh-button-secondary:active, .mnh-theme-midnight-blue .mnh-more-pill:active { background: rgba(30,41,59,0.86) !important; border-color: rgba(125,211,252,0.42) !important; }
            .mnh-theme-midnight-blue .mnh-more-pill { background: linear-gradient(135deg, rgba(15,23,42,0.90), rgba(3,7,18,0.86)) !important; border: 1px solid rgba(250,204,21,0.22) !important; box-shadow: 0 0 12px rgba(59,130,246,0.12), inset 0 1px 0 rgba(255,255,255,0.045) !important; color: #e0f2fe !important; }
            .mnh-theme-midnight-blue .mnh-more-pill-open { border-color: rgba(125,211,252,0.52) !important; box-shadow: 0 0 16px rgba(37,99,235,0.26), inset 0 1px 0 rgba(255,255,255,0.07) !important; }
            .mnh-theme-midnight-blue .mnh-more-tray { background: rgba(3,7,18,0.50); outline-color: rgba(250,204,21,0.10); }
            .mnh-theme-midnight-blue .mnh-select { background: rgba(15,23,42,0.94) !important; border: 1px solid rgba(96,165,250,0.24) !important; border-radius: 10px !important; color: #e0f2fe !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.018) !important; }
            .mnh-theme-midnight-blue .mnh-select:focus { border-color: rgba(125,211,252,0.48) !important; box-shadow: 0 0 0 2px rgba(37,99,235,0.16), inset 0 0 0 1px rgba(255,255,255,0.025) !important; outline: none !important; }
            .mnh-theme-midnight-blue .mnh-slider-card { box-sizing: border-box; background: rgba(15,23,42,0.34); outline: 1px solid rgba(96,165,250,0.12); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
            .mnh-theme-midnight-blue .mnh-slider-card span, .mnh-theme-midnight-blue .mnh-slider-card label { color: #bfdbfe !important; }
            .mnh-theme-midnight-blue .mnh-slider-card:focus-within { outline-color: rgba(125,211,252,0.36); box-shadow: 0 0 10px rgba(37,99,235,0.14); }
            .mnh-theme-midnight-blue .mnh-slider-cluster { background: rgba(3,7,18,0.28); outline: 1px solid rgba(96,165,250,0.10); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
            .mnh-theme-midnight-blue .mnh-slider-cluster .mnh-slider-card { background: transparent; outline: none; box-shadow: none; justify-content: center !important; }
            .mnh-theme-midnight-blue .mnh-slider-cluster .mnh-slider-card span, .mnh-theme-midnight-blue .mnh-slider-cluster .mnh-slider-card label { color: rgba(191,219,254,0.84) !important; font-size: 9px !important; font-weight: 500 !important; }
            .mnh-theme-midnight-blue.mnh-collapsed-deck .mnh-slider-card { background: transparent; outline-color: transparent; box-shadow: none; }
            .mnh-theme-midnight-blue .mnh-slider { --sm-accent: 56, 189, 248; accent-color: #38bdf8 !important; filter: drop-shadow(0 0 4px rgba(37,99,235,0.22)); }
            .mnh-theme-midnight-blue .mnh-chip, .mnh-theme-midnight-blue #mnh-row-stems button { background: rgba(15,23,42,0.68) !important; border: 1px solid rgba(96,165,250,0.18) !important; border-radius: 10px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important; color: #bfdbfe !important; font-weight: 650 !important; }
            .mnh-theme-midnight-blue .mnh-chip-active, .mnh-theme-midnight-blue #mnh-row-stems button[aria-pressed="true"] { background: linear-gradient(180deg, rgba(37,99,235,0.34), rgba(30,64,175,0.26)) !important; border-color: rgba(125,211,252,0.56) !important; box-shadow: 0 0 12px rgba(37,99,235,0.24), inset 0 1px 0 rgba(255,255,255,0.10) !important; color: #dbeafe !important; }
            .mnh-theme-midnight-blue .mnh-button-active, .mnh-theme-midnight-blue .nd-detect-btn[class*="bg-green"] { background: linear-gradient(180deg, rgba(34,197,94,0.34), rgba(21,128,61,0.26)) !important; border: 1px solid rgba(74,222,128,0.46) !important; border-radius: 11px !important; box-shadow: 0 0 12px rgba(34,197,94,0.20), inset 0 1px 0 rgba(255,255,255,0.08) !important; color: #ecfdf5 !important; font-weight: 700 !important; }
            .mnh-theme-midnight-blue button:disabled, .mnh-theme-midnight-blue .mnh-button-disabled { opacity: 0.48 !important; background: rgba(15,23,42,0.46) !important; border-color: rgba(148,163,184,0.14) !important; box-shadow: none !important; color: #93c5fd !important; cursor: not-allowed !important; }

            .mnh-theme-digital-lavender.mnh-control-deck { background: linear-gradient(180deg, rgba(34,24,48,0.98), rgba(17,14,28,0.96)) !important; border-radius: 16px 16px 0 0 !important; box-shadow: 0 -9px 24px rgba(17,14,28,0.48), inset 0 1px 0 rgba(196,181,253,0.16) !important; color: #f5f3ff !important; }
            .mnh-theme-digital-lavender.mnh-collapsed-deck { background: linear-gradient(180deg, rgba(34,24,48,0.94), rgba(17,14,28,0.92)) !important; box-shadow: 0 -7px 18px rgba(17,14,28,0.42), inset 0 1px 0 rgba(196,181,253,0.12) !important; color: #f5f3ff !important; }
            .mnh-theme-digital-lavender .mnh-section-row { background: rgba(46,31,67,0.32); outline: 1px solid rgba(196,181,253,0.13); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
            .mnh-theme-digital-lavender .mnh-button-primary { background: linear-gradient(180deg, #c4b5fd, #8b5cf6) !important; border: 1px solid rgba(221,214,254,0.62) !important; border-radius: 12px !important; box-shadow: 0 0 14px rgba(139,92,246,0.26), inset 0 1px 0 rgba(255,255,255,0.22) !important; color: #1e1038 !important; font-weight: 800 !important; }
            .mnh-theme-digital-lavender .mnh-button-secondary, .mnh-theme-digital-lavender .nd-detect-btn { background: rgba(46,31,67,0.66) !important; border: 1px solid rgba(196,181,253,0.18) !important; border-radius: 11px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important; color: #ede9fe !important; }
            .mnh-theme-digital-lavender .mnh-button-secondary:active, .mnh-theme-digital-lavender .mnh-more-pill:active { background: rgba(67,56,101,0.82) !important; border-color: rgba(196,181,253,0.40) !important; }
            .mnh-theme-digital-lavender .mnh-more-pill { background: linear-gradient(135deg, rgba(46,31,67,0.90), rgba(17,14,28,0.86)) !important; border: 1px solid rgba(250,204,21,0.18) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04) !important; color: #f5f3ff !important; }
            .mnh-theme-digital-lavender .mnh-more-pill-open { border-color: rgba(196,181,253,0.50) !important; box-shadow: 0 0 14px rgba(139,92,246,0.22), inset 0 1px 0 rgba(255,255,255,0.07) !important; }
            .mnh-theme-digital-lavender .mnh-more-tray { background: rgba(17,14,28,0.48); outline-color: rgba(196,181,253,0.12); }
            .mnh-theme-digital-lavender .mnh-select { background: rgba(34,24,48,0.94) !important; border: 1px solid rgba(196,181,253,0.24) !important; border-radius: 10px !important; color: #f5f3ff !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.018) !important; }
            .mnh-theme-digital-lavender .mnh-select:focus { border-color: rgba(196,181,253,0.48) !important; box-shadow: 0 0 0 2px rgba(139,92,246,0.15), inset 0 0 0 1px rgba(255,255,255,0.025) !important; outline: none !important; }
            .mnh-theme-digital-lavender .mnh-slider-card { box-sizing: border-box; background: rgba(46,31,67,0.30); outline: 1px solid rgba(196,181,253,0.12); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
            .mnh-theme-digital-lavender .mnh-slider-card span, .mnh-theme-digital-lavender .mnh-slider-card label { color: #ddd6fe !important; }
            .mnh-theme-digital-lavender .mnh-slider-card:focus-within { outline-color: rgba(196,181,253,0.36); box-shadow: 0 0 10px rgba(139,92,246,0.13); }
            .mnh-theme-digital-lavender .mnh-slider-cluster { background: rgba(17,14,28,0.28); outline: 1px solid rgba(196,181,253,0.10); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
            .mnh-theme-digital-lavender .mnh-slider-cluster .mnh-slider-card { background: transparent; outline: none; box-shadow: none; justify-content: center !important; }
            .mnh-theme-digital-lavender .mnh-slider-cluster .mnh-slider-card span, .mnh-theme-digital-lavender .mnh-slider-cluster .mnh-slider-card label { color: rgba(221,214,254,0.84) !important; font-size: 9px !important; font-weight: 500 !important; }
            .mnh-theme-digital-lavender.mnh-collapsed-deck .mnh-slider-card { background: transparent; outline-color: transparent; box-shadow: none; }
            .mnh-theme-digital-lavender .mnh-slider { --sm-accent: 167, 139, 250; accent-color: #a78bfa !important; filter: drop-shadow(0 0 4px rgba(139,92,246,0.20)); }
            .mnh-theme-digital-lavender .mnh-chip, .mnh-theme-digital-lavender #mnh-row-stems button { background: rgba(46,31,67,0.64) !important; border: 1px solid rgba(196,181,253,0.18) !important; border-radius: 10px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important; color: #ddd6fe !important; font-weight: 650 !important; }
            .mnh-theme-digital-lavender .mnh-chip-active, .mnh-theme-digital-lavender #mnh-row-stems button[aria-pressed="true"] { background: linear-gradient(180deg, rgba(139,92,246,0.32), rgba(109,40,217,0.24)) !important; border-color: rgba(196,181,253,0.54) !important; box-shadow: 0 0 12px rgba(139,92,246,0.20), inset 0 1px 0 rgba(255,255,255,0.09) !important; color: #f5f3ff !important; }
            .mnh-theme-digital-lavender .mnh-button-active, .mnh-theme-digital-lavender .nd-detect-btn[class*="bg-green"] { background: linear-gradient(180deg, rgba(34,197,94,0.32), rgba(21,128,61,0.24)) !important; border: 1px solid rgba(74,222,128,0.44) !important; border-radius: 11px !important; box-shadow: 0 0 12px rgba(34,197,94,0.18), inset 0 1px 0 rgba(255,255,255,0.08) !important; color: #ecfdf5 !important; font-weight: 700 !important; }
            .mnh-theme-digital-lavender button:disabled, .mnh-theme-digital-lavender .mnh-button-disabled { opacity: 0.48 !important; background: rgba(34,24,48,0.46) !important; border-color: rgba(196,181,253,0.13) !important; box-shadow: none !important; color: #c4b5fd !important; cursor: not-allowed !important; }

            .mnh-theme-verdant-green.mnh-control-deck { background: linear-gradient(180deg, rgba(22,37,25,0.98), rgba(9,18,12,0.96)) !important; border-radius: 16px 16px 0 0 !important; box-shadow: 0 -9px 24px rgba(9,18,12,0.46), inset 0 1px 0 rgba(132,204,22,0.15) !important; color: #ecfccb !important; }
            .mnh-theme-verdant-green.mnh-collapsed-deck { background: linear-gradient(180deg, rgba(22,37,25,0.94), rgba(9,18,12,0.92)) !important; box-shadow: 0 -7px 18px rgba(9,18,12,0.40), inset 0 1px 0 rgba(132,204,22,0.12) !important; color: #ecfccb !important; }
            .mnh-theme-verdant-green .mnh-section-row { background: rgba(31,50,31,0.32); outline: 1px solid rgba(132,204,22,0.12); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
            .mnh-theme-verdant-green .mnh-button-primary { background: linear-gradient(180deg, #84cc16, #4d7c0f) !important; border: 1px solid rgba(190,242,100,0.54) !important; border-radius: 12px !important; box-shadow: 0 0 13px rgba(101,163,13,0.25), inset 0 1px 0 rgba(255,255,255,0.18) !important; color: #17210a !important; font-weight: 800 !important; }
            .mnh-theme-verdant-green .mnh-button-secondary, .mnh-theme-verdant-green .nd-detect-btn { background: rgba(31,50,31,0.64) !important; border: 1px solid rgba(132,204,22,0.16) !important; border-radius: 11px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important; color: #d9f99d !important; }
            .mnh-theme-verdant-green .mnh-button-secondary:active, .mnh-theme-verdant-green .mnh-more-pill:active { background: rgba(54,83,20,0.80) !important; border-color: rgba(190,242,100,0.36) !important; }
            .mnh-theme-verdant-green .mnh-more-pill { background: linear-gradient(135deg, rgba(31,50,31,0.88), rgba(9,18,12,0.84)) !important; border: 1px solid rgba(250,204,21,0.18) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.035) !important; color: #ecfccb !important; }
            .mnh-theme-verdant-green .mnh-more-pill-open { border-color: rgba(190,242,100,0.46) !important; box-shadow: 0 0 13px rgba(101,163,13,0.18), inset 0 1px 0 rgba(255,255,255,0.06) !important; }
            .mnh-theme-verdant-green .mnh-more-tray { background: rgba(9,18,12,0.46); outline-color: rgba(250,204,21,0.08); }
            .mnh-theme-verdant-green .mnh-select { background: rgba(22,37,25,0.92) !important; border: 1px solid rgba(132,204,22,0.22) !important; border-radius: 10px !important; color: #ecfccb !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.015) !important; }
            .mnh-theme-verdant-green .mnh-select:focus { border-color: rgba(190,242,100,0.42) !important; box-shadow: 0 0 0 2px rgba(101,163,13,0.13), inset 0 0 0 1px rgba(255,255,255,0.02) !important; outline: none !important; }
            .mnh-theme-verdant-green .mnh-slider-card { box-sizing: border-box; background: rgba(31,50,31,0.30); outline: 1px solid rgba(132,204,22,0.11); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025); }
            .mnh-theme-verdant-green .mnh-slider-card span, .mnh-theme-verdant-green .mnh-slider-card label { color: #d9f99d !important; }
            .mnh-theme-verdant-green .mnh-slider-card:focus-within { outline-color: rgba(190,242,100,0.32); box-shadow: 0 0 10px rgba(101,163,13,0.12); }
            .mnh-theme-verdant-green .mnh-slider-cluster { background: rgba(9,18,12,0.26); outline: 1px solid rgba(132,204,22,0.09); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025); }
            .mnh-theme-verdant-green .mnh-slider-cluster .mnh-slider-card { background: transparent; outline: none; box-shadow: none; justify-content: center !important; }
            .mnh-theme-verdant-green .mnh-slider-cluster .mnh-slider-card span, .mnh-theme-verdant-green .mnh-slider-cluster .mnh-slider-card label { color: rgba(217,249,157,0.84) !important; font-size: 9px !important; font-weight: 500 !important; }
            .mnh-theme-verdant-green.mnh-collapsed-deck .mnh-slider-card { background: transparent; outline-color: transparent; box-shadow: none; }
            .mnh-theme-verdant-green .mnh-slider { --sm-accent: 132, 204, 22; accent-color: #84cc16 !important; filter: drop-shadow(0 0 3px rgba(101,163,13,0.18)); }
            .mnh-theme-verdant-green .mnh-chip, .mnh-theme-verdant-green #mnh-row-stems button { background: rgba(31,50,31,0.62) !important; border: 1px solid rgba(132,204,22,0.16) !important; border-radius: 10px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important; color: #d9f99d !important; font-weight: 650 !important; }
            .mnh-theme-verdant-green .mnh-chip-active, .mnh-theme-verdant-green #mnh-row-stems button[aria-pressed="true"] { background: linear-gradient(180deg, rgba(132,204,22,0.30), rgba(77,124,15,0.24)) !important; border-color: rgba(190,242,100,0.48) !important; box-shadow: 0 0 10px rgba(101,163,13,0.18), inset 0 1px 0 rgba(255,255,255,0.08) !important; color: #ecfccb !important; }
            .mnh-theme-verdant-green .mnh-button-active, .mnh-theme-verdant-green .nd-detect-btn[class*="bg-green"] { background: linear-gradient(180deg, rgba(34,197,94,0.34), rgba(21,128,61,0.26)) !important; border: 1px solid rgba(74,222,128,0.44) !important; border-radius: 11px !important; box-shadow: 0 0 12px rgba(34,197,94,0.18), inset 0 1px 0 rgba(255,255,255,0.08) !important; color: #ecfdf5 !important; font-weight: 700 !important; }
            .mnh-theme-verdant-green button:disabled, .mnh-theme-verdant-green .mnh-button-disabled { opacity: 0.48 !important; background: rgba(22,37,25,0.44) !important; border-color: rgba(132,204,22,0.12) !important; box-shadow: none !important; color: #bef264 !important; cursor: not-allowed !important; }

            .mnh-theme-sunset.mnh-control-deck { background: linear-gradient(180deg, rgba(50,27,39,0.98), rgba(22,12,20,0.96)) !important; border-radius: 16px 16px 0 0 !important; box-shadow: 0 -9px 24px rgba(22,12,20,0.48), inset 0 1px 0 rgba(251,146,60,0.16) !important; color: #fff7ed !important; }
            .mnh-theme-sunset.mnh-collapsed-deck { background: linear-gradient(180deg, rgba(50,27,39,0.94), rgba(22,12,20,0.92)) !important; box-shadow: 0 -7px 18px rgba(22,12,20,0.42), inset 0 1px 0 rgba(251,146,60,0.12) !important; color: #fff7ed !important; }
            .mnh-theme-sunset .mnh-section-row { background: rgba(67,31,43,0.32); outline: 1px solid rgba(251,146,60,0.12); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
            .mnh-theme-sunset .mnh-button-primary { background: linear-gradient(180deg, #fb923c, #ea580c) !important; border: 1px solid rgba(253,186,116,0.58) !important; border-radius: 12px !important; box-shadow: 0 0 14px rgba(234,88,12,0.25), inset 0 1px 0 rgba(255,255,255,0.20) !important; color: #2b1203 !important; font-weight: 800 !important; }
            .mnh-theme-sunset .mnh-button-secondary, .mnh-theme-sunset .nd-detect-btn { background: rgba(67,31,43,0.64) !important; border: 1px solid rgba(251,146,60,0.16) !important; border-radius: 11px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important; color: #fed7aa !important; }
            .mnh-theme-sunset .mnh-button-secondary:active, .mnh-theme-sunset .mnh-more-pill:active { background: rgba(88,42,45,0.80) !important; border-color: rgba(253,186,116,0.38) !important; }
            .mnh-theme-sunset .mnh-more-pill { background: linear-gradient(135deg, rgba(67,31,43,0.88), rgba(22,12,20,0.84)) !important; border: 1px solid rgba(250,204,21,0.20) !important; box-shadow: 0 0 10px rgba(234,88,12,0.10), inset 0 1px 0 rgba(255,255,255,0.04) !important; color: #fff7ed !important; }
            .mnh-theme-sunset .mnh-more-pill-open { border-color: rgba(253,186,116,0.50) !important; box-shadow: 0 0 14px rgba(234,88,12,0.22), inset 0 1px 0 rgba(255,255,255,0.07) !important; }
            .mnh-theme-sunset .mnh-more-tray { background: rgba(22,12,20,0.48); outline-color: rgba(250,204,21,0.10); }
            .mnh-theme-sunset .mnh-select { background: rgba(50,27,39,0.94) !important; border: 1px solid rgba(251,146,60,0.22) !important; border-radius: 10px !important; color: #fff7ed !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.016) !important; }
            .mnh-theme-sunset .mnh-select:focus { border-color: rgba(253,186,116,0.46) !important; box-shadow: 0 0 0 2px rgba(234,88,12,0.15), inset 0 0 0 1px rgba(255,255,255,0.022) !important; outline: none !important; }
            .mnh-theme-sunset .mnh-slider-card { box-sizing: border-box; background: rgba(67,31,43,0.30); outline: 1px solid rgba(251,146,60,0.11); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025); }
            .mnh-theme-sunset .mnh-slider-card span, .mnh-theme-sunset .mnh-slider-card label { color: #fed7aa !important; }
            .mnh-theme-sunset .mnh-slider-card:focus-within { outline-color: rgba(253,186,116,0.34); box-shadow: 0 0 10px rgba(234,88,12,0.13); }
            .mnh-theme-sunset .mnh-slider-cluster { background: rgba(22,12,20,0.28); outline: 1px solid rgba(251,146,60,0.09); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025); }
            .mnh-theme-sunset .mnh-slider-cluster .mnh-slider-card { background: transparent; outline: none; box-shadow: none; justify-content: center !important; }
            .mnh-theme-sunset .mnh-slider-cluster .mnh-slider-card span, .mnh-theme-sunset .mnh-slider-cluster .mnh-slider-card label { color: rgba(254,215,170,0.84) !important; font-size: 9px !important; font-weight: 500 !important; }
            .mnh-theme-sunset.mnh-collapsed-deck .mnh-slider-card { background: transparent; outline-color: transparent; box-shadow: none; }
            .mnh-theme-sunset .mnh-slider { --sm-accent: 251, 146, 60; accent-color: #fb923c !important; filter: drop-shadow(0 0 3px rgba(234,88,12,0.20)); }
            .mnh-theme-sunset .mnh-chip, .mnh-theme-sunset #mnh-row-stems button { background: rgba(67,31,43,0.62) !important; border: 1px solid rgba(251,146,60,0.16) !important; border-radius: 10px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025) !important; color: #fed7aa !important; font-weight: 650 !important; }
            .mnh-theme-sunset .mnh-chip-active, .mnh-theme-sunset #mnh-row-stems button[aria-pressed="true"] { background: linear-gradient(180deg, rgba(251,146,60,0.32), rgba(234,88,12,0.24)) !important; border-color: rgba(253,186,116,0.52) !important; box-shadow: 0 0 12px rgba(234,88,12,0.20), inset 0 1px 0 rgba(255,255,255,0.08) !important; color: #ffedd5 !important; }
            .mnh-theme-sunset .mnh-button-active, .mnh-theme-sunset .nd-detect-btn[class*="bg-green"] { background: linear-gradient(180deg, rgba(34,197,94,0.32), rgba(21,128,61,0.24)) !important; border: 1px solid rgba(74,222,128,0.42) !important; border-radius: 11px !important; box-shadow: 0 0 12px rgba(34,197,94,0.17), inset 0 1px 0 rgba(255,255,255,0.08) !important; color: #ecfdf5 !important; font-weight: 700 !important; }
            .mnh-theme-sunset button:disabled, .mnh-theme-sunset .mnh-button-disabled { opacity: 0.48 !important; background: rgba(50,27,39,0.44) !important; border-color: rgba(251,146,60,0.12) !important; box-shadow: none !important; color: #fdba74 !important; cursor: not-allowed !important; }

            .mnh-theme-mocha-mousse.mnh-control-deck { background: linear-gradient(180deg, rgba(45,31,26,0.98), rgba(22,14,11,0.96)) !important; border-radius: 16px 16px 0 0 !important; box-shadow: 0 -8px 22px rgba(22,14,11,0.44), inset 0 1px 0 rgba(202,138,4,0.13) !important; color: #f5e6d3 !important; }
            .mnh-theme-mocha-mousse.mnh-collapsed-deck { background: linear-gradient(180deg, rgba(45,31,26,0.94), rgba(22,14,11,0.92)) !important; box-shadow: 0 -6px 18px rgba(22,14,11,0.38), inset 0 1px 0 rgba(202,138,4,0.10) !important; color: #f5e6d3 !important; }
            .mnh-theme-mocha-mousse .mnh-section-row { background: rgba(57,40,33,0.30); outline: 1px solid rgba(202,138,4,0.11); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025); }
            .mnh-theme-mocha-mousse .mnh-button-primary { background: linear-gradient(180deg, #b8875f, #7c4a2d) !important; border: 1px solid rgba(217,176,128,0.48) !important; border-radius: 12px !important; box-shadow: 0 0 10px rgba(124,74,45,0.20), inset 0 1px 0 rgba(255,255,255,0.16) !important; color: #fff7ed !important; font-weight: 800 !important; }
            .mnh-theme-mocha-mousse .mnh-button-secondary, .mnh-theme-mocha-mousse .nd-detect-btn { background: rgba(57,40,33,0.62) !important; border: 1px solid rgba(202,138,4,0.14) !important; border-radius: 11px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.02) !important; color: #ead7c4 !important; }
            .mnh-theme-mocha-mousse .mnh-button-secondary:active, .mnh-theme-mocha-mousse .mnh-more-pill:active { background: rgba(75,53,43,0.78) !important; border-color: rgba(217,176,128,0.32) !important; }
            .mnh-theme-mocha-mousse .mnh-more-pill { background: linear-gradient(135deg, rgba(57,40,33,0.86), rgba(22,14,11,0.82)) !important; border: 1px solid rgba(202,138,4,0.18) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.035) !important; color: #f5e6d3 !important; }
            .mnh-theme-mocha-mousse .mnh-more-pill-open { border-color: rgba(217,176,128,0.44) !important; box-shadow: 0 0 11px rgba(124,74,45,0.16), inset 0 1px 0 rgba(255,255,255,0.06) !important; }
            .mnh-theme-mocha-mousse .mnh-more-tray { background: rgba(22,14,11,0.44); outline-color: rgba(202,138,4,0.08); }
            .mnh-theme-mocha-mousse .mnh-select { background: rgba(45,31,26,0.92) !important; border: 1px solid rgba(202,138,4,0.20) !important; border-radius: 10px !important; color: #f5e6d3 !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.014) !important; }
            .mnh-theme-mocha-mousse .mnh-select:focus { border-color: rgba(217,176,128,0.40) !important; box-shadow: 0 0 0 2px rgba(124,74,45,0.12), inset 0 0 0 1px rgba(255,255,255,0.02) !important; outline: none !important; }
            .mnh-theme-mocha-mousse .mnh-slider-card { box-sizing: border-box; background: rgba(57,40,33,0.28); outline: 1px solid rgba(202,138,4,0.10); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.022); }
            .mnh-theme-mocha-mousse .mnh-slider-card span, .mnh-theme-mocha-mousse .mnh-slider-card label { color: #ead7c4 !important; }
            .mnh-theme-mocha-mousse .mnh-slider-card:focus-within { outline-color: rgba(217,176,128,0.30); box-shadow: 0 0 9px rgba(124,74,45,0.10); }
            .mnh-theme-mocha-mousse .mnh-slider-cluster { background: rgba(22,14,11,0.24); outline: 1px solid rgba(202,138,4,0.08); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.022); }
            .mnh-theme-mocha-mousse .mnh-slider-cluster .mnh-slider-card { background: transparent; outline: none; box-shadow: none; justify-content: center !important; }
            .mnh-theme-mocha-mousse .mnh-slider-cluster .mnh-slider-card span, .mnh-theme-mocha-mousse .mnh-slider-cluster .mnh-slider-card label { color: rgba(234,215,196,0.84) !important; font-size: 9px !important; font-weight: 500 !important; }
            .mnh-theme-mocha-mousse.mnh-collapsed-deck .mnh-slider-card { background: transparent; outline-color: transparent; box-shadow: none; }
            .mnh-theme-mocha-mousse .mnh-slider { --sm-accent: 184, 135, 95; accent-color: #b8875f !important; filter: drop-shadow(0 0 3px rgba(124,74,45,0.15)); }
            .mnh-theme-mocha-mousse .mnh-chip, .mnh-theme-mocha-mousse #mnh-row-stems button { background: rgba(57,40,33,0.60) !important; border: 1px solid rgba(202,138,4,0.14) !important; border-radius: 10px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.02) !important; color: #ead7c4 !important; font-weight: 650 !important; }
            .mnh-theme-mocha-mousse .mnh-chip-active, .mnh-theme-mocha-mousse #mnh-row-stems button[aria-pressed="true"] { background: linear-gradient(180deg, rgba(184,135,95,0.30), rgba(124,74,45,0.24)) !important; border-color: rgba(217,176,128,0.44) !important; box-shadow: 0 0 10px rgba(124,74,45,0.14), inset 0 1px 0 rgba(255,255,255,0.07) !important; color: #fff7ed !important; }
            .mnh-theme-mocha-mousse .mnh-button-active, .mnh-theme-mocha-mousse .nd-detect-btn[class*="bg-green"] { background: linear-gradient(180deg, rgba(34,197,94,0.30), rgba(21,128,61,0.23)) !important; border: 1px solid rgba(74,222,128,0.40) !important; border-radius: 11px !important; box-shadow: 0 0 10px rgba(34,197,94,0.15), inset 0 1px 0 rgba(255,255,255,0.07) !important; color: #ecfdf5 !important; font-weight: 700 !important; }
            .mnh-theme-mocha-mousse button:disabled, .mnh-theme-mocha-mousse .mnh-button-disabled { opacity: 0.48 !important; background: rgba(45,31,26,0.42) !important; border-color: rgba(202,138,4,0.11) !important; box-shadow: none !important; color: #d9b990 !important; cursor: not-allowed !important; }

            .mnh-theme-desert-sand.mnh-control-deck { background: linear-gradient(180deg, rgba(48,43,35,0.98), rgba(24,21,17,0.96)) !important; border-radius: 16px 16px 0 0 !important; box-shadow: 0 -8px 22px rgba(24,21,17,0.42), inset 0 1px 0 rgba(214,180,122,0.14) !important; color: #f6ead7 !important; }
            .mnh-theme-desert-sand.mnh-collapsed-deck { background: linear-gradient(180deg, rgba(48,43,35,0.94), rgba(24,21,17,0.92)) !important; box-shadow: 0 -6px 18px rgba(24,21,17,0.36), inset 0 1px 0 rgba(214,180,122,0.10) !important; color: #f6ead7 !important; }
            .mnh-theme-desert-sand .mnh-section-row { background: rgba(61,53,42,0.30); outline: 1px solid rgba(214,180,122,0.11); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025); }
            .mnh-theme-desert-sand .mnh-button-primary { background: linear-gradient(180deg, #d6b47a, #a67c3d) !important; border: 1px solid rgba(238,210,160,0.50) !important; border-radius: 12px !important; box-shadow: 0 0 10px rgba(166,124,61,0.18), inset 0 1px 0 rgba(255,255,255,0.16) !important; color: #281d0e !important; font-weight: 800 !important; }
            .mnh-theme-desert-sand .mnh-button-secondary, .mnh-theme-desert-sand .nd-detect-btn { background: rgba(61,53,42,0.60) !important; border: 1px solid rgba(214,180,122,0.14) !important; border-radius: 11px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.02) !important; color: #eadcc4 !important; }
            .mnh-theme-desert-sand .mnh-button-secondary:active, .mnh-theme-desert-sand .mnh-more-pill:active { background: rgba(75,66,52,0.78) !important; border-color: rgba(238,210,160,0.32) !important; }
            .mnh-theme-desert-sand .mnh-more-pill { background: linear-gradient(135deg, rgba(61,53,42,0.86), rgba(24,21,17,0.82)) !important; border: 1px solid rgba(214,180,122,0.18) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.035) !important; color: #f6ead7 !important; }
            .mnh-theme-desert-sand .mnh-more-pill-open { border-color: rgba(238,210,160,0.44) !important; box-shadow: 0 0 10px rgba(166,124,61,0.14), inset 0 1px 0 rgba(255,255,255,0.06) !important; }
            .mnh-theme-desert-sand .mnh-more-tray { background: rgba(24,21,17,0.44); outline-color: rgba(214,180,122,0.08); }
            .mnh-theme-desert-sand .mnh-select { background: rgba(48,43,35,0.92) !important; border: 1px solid rgba(214,180,122,0.20) !important; border-radius: 10px !important; color: #f6ead7 !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.014) !important; }
            .mnh-theme-desert-sand .mnh-select:focus { border-color: rgba(238,210,160,0.40) !important; box-shadow: 0 0 0 2px rgba(166,124,61,0.12), inset 0 0 0 1px rgba(255,255,255,0.02) !important; outline: none !important; }
            .mnh-theme-desert-sand .mnh-slider-card { box-sizing: border-box; background: rgba(61,53,42,0.28); outline: 1px solid rgba(214,180,122,0.10); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.022); }
            .mnh-theme-desert-sand .mnh-slider-card span, .mnh-theme-desert-sand .mnh-slider-card label { color: #eadcc4 !important; }
            .mnh-theme-desert-sand .mnh-slider-card:focus-within { outline-color: rgba(238,210,160,0.30); box-shadow: 0 0 9px rgba(166,124,61,0.10); }
            .mnh-theme-desert-sand .mnh-slider-cluster { background: rgba(24,21,17,0.24); outline: 1px solid rgba(214,180,122,0.08); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.022); }
            .mnh-theme-desert-sand .mnh-slider-cluster .mnh-slider-card { background: transparent; outline: none; box-shadow: none; justify-content: center !important; }
            .mnh-theme-desert-sand .mnh-slider-cluster .mnh-slider-card span, .mnh-theme-desert-sand .mnh-slider-cluster .mnh-slider-card label { color: rgba(234,220,196,0.84) !important; font-size: 9px !important; font-weight: 500 !important; }
            .mnh-theme-desert-sand.mnh-collapsed-deck .mnh-slider-card { background: transparent; outline-color: transparent; box-shadow: none; }
            .mnh-theme-desert-sand .mnh-slider { --sm-accent: 214, 180, 122; accent-color: #d6b47a !important; filter: drop-shadow(0 0 3px rgba(166,124,61,0.14)); }
            .mnh-theme-desert-sand .mnh-chip, .mnh-theme-desert-sand #mnh-row-stems button { background: rgba(61,53,42,0.60) !important; border: 1px solid rgba(214,180,122,0.14) !important; border-radius: 10px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.02) !important; color: #eadcc4 !important; font-weight: 650 !important; }
            .mnh-theme-desert-sand .mnh-chip-active, .mnh-theme-desert-sand #mnh-row-stems button[aria-pressed="true"] { background: linear-gradient(180deg, rgba(214,180,122,0.30), rgba(166,124,61,0.22)) !important; border-color: rgba(238,210,160,0.42) !important; box-shadow: 0 0 9px rgba(166,124,61,0.12), inset 0 1px 0 rgba(255,255,255,0.07) !important; color: #fff7ed !important; }
            .mnh-theme-desert-sand .mnh-button-active, .mnh-theme-desert-sand .nd-detect-btn[class*="bg-green"] { background: linear-gradient(180deg, rgba(34,197,94,0.28), rgba(21,128,61,0.22)) !important; border: 1px solid rgba(74,222,128,0.38) !important; border-radius: 11px !important; box-shadow: 0 0 10px rgba(34,197,94,0.14), inset 0 1px 0 rgba(255,255,255,0.07) !important; color: #ecfdf5 !important; font-weight: 700 !important; }
            .mnh-theme-desert-sand button:disabled, .mnh-theme-desert-sand .mnh-button-disabled { opacity: 0.48 !important; background: rgba(48,43,35,0.42) !important; border-color: rgba(214,180,122,0.11) !important; box-shadow: none !important; color: #d6b47a !important; cursor: not-allowed !important; }

            .mnh-theme-muted-rose.mnh-control-deck { background: linear-gradient(180deg, rgba(52,30,39,0.98), rgba(24,13,18,0.96)) !important; border-radius: 16px 16px 0 0 !important; box-shadow: 0 -8px 22px rgba(24,13,18,0.44), inset 0 1px 0 rgba(251,113,133,0.14) !important; color: #fff1f2 !important; }
            .mnh-theme-muted-rose.mnh-collapsed-deck { background: linear-gradient(180deg, rgba(52,30,39,0.94), rgba(24,13,18,0.92)) !important; box-shadow: 0 -6px 18px rgba(24,13,18,0.38), inset 0 1px 0 rgba(251,113,133,0.10) !important; color: #fff1f2 !important; }
            .mnh-theme-muted-rose .mnh-section-row { background: rgba(66,35,47,0.30); outline: 1px solid rgba(251,113,133,0.11); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025); }
            .mnh-theme-muted-rose .mnh-button-primary { background: linear-gradient(180deg, #fb7185, #be445a) !important; border: 1px solid rgba(253,164,175,0.50) !important; border-radius: 12px !important; box-shadow: 0 0 11px rgba(190,68,90,0.18), inset 0 1px 0 rgba(255,255,255,0.16) !important; color: #fff1f2 !important; font-weight: 800 !important; }
            .mnh-theme-muted-rose .mnh-button-secondary, .mnh-theme-muted-rose .nd-detect-btn { background: rgba(66,35,47,0.60) !important; border: 1px solid rgba(251,113,133,0.14) !important; border-radius: 11px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.02) !important; color: #ffe4e6 !important; }
            .mnh-theme-muted-rose .mnh-button-secondary:active, .mnh-theme-muted-rose .mnh-more-pill:active { background: rgba(88,45,60,0.78) !important; border-color: rgba(253,164,175,0.34) !important; }
            .mnh-theme-muted-rose .mnh-more-pill { background: linear-gradient(135deg, rgba(66,35,47,0.86), rgba(24,13,18,0.82)) !important; border: 1px solid rgba(250,204,21,0.14) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.035) !important; color: #fff1f2 !important; }
            .mnh-theme-muted-rose .mnh-more-pill-open { border-color: rgba(253,164,175,0.44) !important; box-shadow: 0 0 11px rgba(190,68,90,0.16), inset 0 1px 0 rgba(255,255,255,0.06) !important; }
            .mnh-theme-muted-rose .mnh-more-tray { background: rgba(24,13,18,0.44); outline-color: rgba(251,113,133,0.08); }
            .mnh-theme-muted-rose .mnh-select { background: rgba(52,30,39,0.92) !important; border: 1px solid rgba(251,113,133,0.20) !important; border-radius: 10px !important; color: #fff1f2 !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.014) !important; }
            .mnh-theme-muted-rose .mnh-select:focus { border-color: rgba(253,164,175,0.40) !important; box-shadow: 0 0 0 2px rgba(190,68,90,0.12), inset 0 0 0 1px rgba(255,255,255,0.02) !important; outline: none !important; }
            .mnh-theme-muted-rose .mnh-slider-card { box-sizing: border-box; background: rgba(66,35,47,0.28); outline: 1px solid rgba(251,113,133,0.10); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.022); }
            .mnh-theme-muted-rose .mnh-slider-card span, .mnh-theme-muted-rose .mnh-slider-card label { color: #ffe4e6 !important; }
            .mnh-theme-muted-rose .mnh-slider-card:focus-within { outline-color: rgba(253,164,175,0.32); box-shadow: 0 0 9px rgba(190,68,90,0.10); }
            .mnh-theme-muted-rose .mnh-slider-cluster { background: rgba(24,13,18,0.24); outline: 1px solid rgba(251,113,133,0.08); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.022); }
            .mnh-theme-muted-rose .mnh-slider-cluster .mnh-slider-card { background: transparent; outline: none; box-shadow: none; justify-content: center !important; }
            .mnh-theme-muted-rose .mnh-slider-cluster .mnh-slider-card span, .mnh-theme-muted-rose .mnh-slider-cluster .mnh-slider-card label { color: rgba(255,228,230,0.84) !important; font-size: 9px !important; font-weight: 500 !important; }
            .mnh-theme-muted-rose.mnh-collapsed-deck .mnh-slider-card { background: transparent; outline-color: transparent; box-shadow: none; }
            .mnh-theme-muted-rose .mnh-slider { --sm-accent: 251, 113, 133; accent-color: #fb7185 !important; filter: drop-shadow(0 0 3px rgba(190,68,90,0.15)); }
            .mnh-theme-muted-rose .mnh-chip, .mnh-theme-muted-rose #mnh-row-stems button { background: rgba(66,35,47,0.60) !important; border: 1px solid rgba(251,113,133,0.14) !important; border-radius: 10px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.02) !important; color: #ffe4e6 !important; font-weight: 650 !important; }
            .mnh-theme-muted-rose .mnh-chip-active, .mnh-theme-muted-rose #mnh-row-stems button[aria-pressed="true"] { background: linear-gradient(180deg, rgba(251,113,133,0.30), rgba(190,68,90,0.22)) !important; border-color: rgba(253,164,175,0.44) !important; box-shadow: 0 0 10px rgba(190,68,90,0.14), inset 0 1px 0 rgba(255,255,255,0.07) !important; color: #fff1f2 !important; }
            .mnh-theme-muted-rose .mnh-button-active, .mnh-theme-muted-rose .nd-detect-btn[class*="bg-green"] { background: linear-gradient(180deg, rgba(34,197,94,0.28), rgba(21,128,61,0.22)) !important; border: 1px solid rgba(74,222,128,0.38) !important; border-radius: 11px !important; box-shadow: 0 0 10px rgba(34,197,94,0.14), inset 0 1px 0 rgba(255,255,255,0.07) !important; color: #ecfdf5 !important; font-weight: 700 !important; }
            .mnh-theme-muted-rose button:disabled, .mnh-theme-muted-rose .mnh-button-disabled { opacity: 0.48 !important; background: rgba(52,30,39,0.42) !important; border-color: rgba(251,113,133,0.11) !important; box-shadow: none !important; color: #fda4af !important; cursor: not-allowed !important; }

            .mnh-theme-corporate-navy.mnh-control-deck { background: linear-gradient(180deg, rgba(13,28,48,0.98), rgba(6,16,30,0.96)) !important; border-radius: 16px 16px 0 0 !important; box-shadow: 0 -8px 22px rgba(6,16,30,0.44), inset 0 1px 0 rgba(96,165,250,0.13) !important; color: #e2e8f0 !important; }
            .mnh-theme-corporate-navy.mnh-collapsed-deck { background: linear-gradient(180deg, rgba(13,28,48,0.94), rgba(6,16,30,0.92)) !important; box-shadow: 0 -6px 18px rgba(6,16,30,0.38), inset 0 1px 0 rgba(96,165,250,0.10) !important; color: #e2e8f0 !important; }
            .mnh-theme-corporate-navy .mnh-section-row { background: rgba(15,35,59,0.30); outline: 1px solid rgba(96,165,250,0.11); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025); }
            .mnh-theme-corporate-navy .mnh-button-primary { background: linear-gradient(180deg, #3b82f6, #1d4ed8) !important; border: 1px solid rgba(147,197,253,0.50) !important; border-radius: 12px !important; box-shadow: 0 0 11px rgba(29,78,216,0.18), inset 0 1px 0 rgba(255,255,255,0.16) !important; color: #eff6ff !important; font-weight: 800 !important; }
            .mnh-theme-corporate-navy .mnh-button-secondary, .mnh-theme-corporate-navy .nd-detect-btn { background: rgba(15,35,59,0.60) !important; border: 1px solid rgba(96,165,250,0.14) !important; border-radius: 11px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.02) !important; color: #cbd5e1 !important; }
            .mnh-theme-corporate-navy .mnh-button-secondary:active, .mnh-theme-corporate-navy .mnh-more-pill:active { background: rgba(30,58,94,0.78) !important; border-color: rgba(147,197,253,0.34) !important; }
            .mnh-theme-corporate-navy .mnh-more-pill { background: linear-gradient(135deg, rgba(15,35,59,0.86), rgba(6,16,30,0.82)) !important; border: 1px solid rgba(96,165,250,0.18) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.035) !important; color: #e2e8f0 !important; }
            .mnh-theme-corporate-navy .mnh-more-pill-open { border-color: rgba(147,197,253,0.44) !important; box-shadow: 0 0 11px rgba(29,78,216,0.16), inset 0 1px 0 rgba(255,255,255,0.06) !important; }
            .mnh-theme-corporate-navy .mnh-more-tray { background: rgba(6,16,30,0.44); outline-color: rgba(96,165,250,0.08); }
            .mnh-theme-corporate-navy .mnh-select { background: rgba(13,28,48,0.92) !important; border: 1px solid rgba(96,165,250,0.20) !important; border-radius: 10px !important; color: #e2e8f0 !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.014) !important; }
            .mnh-theme-corporate-navy .mnh-select:focus { border-color: rgba(147,197,253,0.40) !important; box-shadow: 0 0 0 2px rgba(29,78,216,0.12), inset 0 0 0 1px rgba(255,255,255,0.02) !important; outline: none !important; }
            .mnh-theme-corporate-navy .mnh-slider-card { box-sizing: border-box; background: rgba(15,35,59,0.28); outline: 1px solid rgba(96,165,250,0.10); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.022); }
            .mnh-theme-corporate-navy .mnh-slider-card span, .mnh-theme-corporate-navy .mnh-slider-card label { color: #cbd5e1 !important; }
            .mnh-theme-corporate-navy .mnh-slider-card:focus-within { outline-color: rgba(147,197,253,0.30); box-shadow: 0 0 9px rgba(29,78,216,0.10); }
            .mnh-theme-corporate-navy .mnh-slider-cluster { background: rgba(6,16,30,0.24); outline: 1px solid rgba(96,165,250,0.08); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.022); }
            .mnh-theme-corporate-navy .mnh-slider-cluster .mnh-slider-card { background: transparent; outline: none; box-shadow: none; justify-content: center !important; }
            .mnh-theme-corporate-navy .mnh-slider-cluster .mnh-slider-card span, .mnh-theme-corporate-navy .mnh-slider-cluster .mnh-slider-card label { color: rgba(203,213,225,0.84) !important; font-size: 9px !important; font-weight: 500 !important; }
            .mnh-theme-corporate-navy.mnh-collapsed-deck .mnh-slider-card { background: transparent; outline-color: transparent; box-shadow: none; }
            .mnh-theme-corporate-navy .mnh-slider { --sm-accent: 59, 130, 246; accent-color: #3b82f6 !important; filter: drop-shadow(0 0 3px rgba(29,78,216,0.15)); }
            .mnh-theme-corporate-navy .mnh-chip, .mnh-theme-corporate-navy #mnh-row-stems button { background: rgba(15,35,59,0.60) !important; border: 1px solid rgba(96,165,250,0.14) !important; border-radius: 10px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.02) !important; color: #cbd5e1 !important; font-weight: 650 !important; }
            .mnh-theme-corporate-navy .mnh-chip-active, .mnh-theme-corporate-navy #mnh-row-stems button[aria-pressed="true"] { background: linear-gradient(180deg, rgba(59,130,246,0.30), rgba(29,78,216,0.22)) !important; border-color: rgba(147,197,253,0.42) !important; box-shadow: 0 0 9px rgba(29,78,216,0.12), inset 0 1px 0 rgba(255,255,255,0.07) !important; color: #dbeafe !important; }
            .mnh-theme-corporate-navy .mnh-button-active, .mnh-theme-corporate-navy .nd-detect-btn[class*="bg-green"] { background: linear-gradient(180deg, rgba(34,197,94,0.28), rgba(21,128,61,0.22)) !important; border: 1px solid rgba(74,222,128,0.38) !important; border-radius: 11px !important; box-shadow: 0 0 10px rgba(34,197,94,0.14), inset 0 1px 0 rgba(255,255,255,0.07) !important; color: #ecfdf5 !important; font-weight: 700 !important; }
            .mnh-theme-corporate-navy button:disabled, .mnh-theme-corporate-navy .mnh-button-disabled { opacity: 0.48 !important; background: rgba(13,28,48,0.42) !important; border-color: rgba(96,165,250,0.11) !important; box-shadow: none !important; color: #93c5fd !important; cursor: not-allowed !important; }

            .mnh-theme-nordic-slate.mnh-control-deck { background: linear-gradient(180deg, rgba(31,41,55,0.98), rgba(15,23,42,0.96)) !important; border-radius: 16px 16px 0 0 !important; box-shadow: 0 -8px 22px rgba(15,23,42,0.42), inset 0 1px 0 rgba(148,163,184,0.14) !important; color: #e5e7eb !important; }
            .mnh-theme-nordic-slate.mnh-collapsed-deck { background: linear-gradient(180deg, rgba(31,41,55,0.94), rgba(15,23,42,0.92)) !important; box-shadow: 0 -6px 18px rgba(15,23,42,0.36), inset 0 1px 0 rgba(148,163,184,0.10) !important; color: #e5e7eb !important; }
            .mnh-theme-nordic-slate .mnh-section-row { background: rgba(51,65,85,0.26); outline: 1px solid rgba(148,163,184,0.11); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.025); }
            .mnh-theme-nordic-slate .mnh-button-primary { background: linear-gradient(180deg, #60a5fa, #2563eb) !important; border: 1px solid rgba(147,197,253,0.50) !important; border-radius: 12px !important; box-shadow: 0 0 10px rgba(37,99,235,0.16), inset 0 1px 0 rgba(255,255,255,0.16) !important; color: #eff6ff !important; font-weight: 800 !important; }
            .mnh-theme-nordic-slate .mnh-button-secondary, .mnh-theme-nordic-slate .nd-detect-btn { background: rgba(51,65,85,0.56) !important; border: 1px solid rgba(148,163,184,0.14) !important; border-radius: 11px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.02) !important; color: #d1d5db !important; }
            .mnh-theme-nordic-slate .mnh-button-secondary:active, .mnh-theme-nordic-slate .mnh-more-pill:active { background: rgba(71,85,105,0.76) !important; border-color: rgba(147,197,253,0.32) !important; }
            .mnh-theme-nordic-slate .mnh-more-pill { background: linear-gradient(135deg, rgba(51,65,85,0.84), rgba(15,23,42,0.82)) !important; border: 1px solid rgba(148,163,184,0.18) !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.035) !important; color: #e5e7eb !important; }
            .mnh-theme-nordic-slate .mnh-more-pill-open { border-color: rgba(147,197,253,0.42) !important; box-shadow: 0 0 10px rgba(37,99,235,0.12), inset 0 1px 0 rgba(255,255,255,0.06) !important; }
            .mnh-theme-nordic-slate .mnh-more-tray { background: rgba(15,23,42,0.42); outline-color: rgba(148,163,184,0.08); }
            .mnh-theme-nordic-slate .mnh-select { background: rgba(31,41,55,0.92) !important; border: 1px solid rgba(148,163,184,0.20) !important; border-radius: 10px !important; color: #e5e7eb !important; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.014) !important; }
            .mnh-theme-nordic-slate .mnh-select:focus { border-color: rgba(147,197,253,0.38) !important; box-shadow: 0 0 0 2px rgba(37,99,235,0.10), inset 0 0 0 1px rgba(255,255,255,0.02) !important; outline: none !important; }
            .mnh-theme-nordic-slate .mnh-slider-card { box-sizing: border-box; background: rgba(51,65,85,0.26); outline: 1px solid rgba(148,163,184,0.10); border-radius: 12px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.022); }
            .mnh-theme-nordic-slate .mnh-slider-card span, .mnh-theme-nordic-slate .mnh-slider-card label { color: #cbd5e1 !important; }
            .mnh-theme-nordic-slate .mnh-slider-card:focus-within { outline-color: rgba(147,197,253,0.28); box-shadow: 0 0 9px rgba(37,99,235,0.09); }
            .mnh-theme-nordic-slate .mnh-slider-cluster { background: rgba(15,23,42,0.22); outline: 1px solid rgba(148,163,184,0.08); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.022); }
            .mnh-theme-nordic-slate .mnh-slider-cluster .mnh-slider-card { background: transparent; outline: none; box-shadow: none; justify-content: center !important; }
            .mnh-theme-nordic-slate .mnh-slider-cluster .mnh-slider-card span, .mnh-theme-nordic-slate .mnh-slider-cluster .mnh-slider-card label { color: rgba(203,213,225,0.84) !important; font-size: 9px !important; font-weight: 500 !important; }
            .mnh-theme-nordic-slate.mnh-collapsed-deck .mnh-slider-card { background: transparent; outline-color: transparent; box-shadow: none; }
            .mnh-theme-nordic-slate .mnh-slider { --sm-accent: 96, 165, 250; accent-color: #60a5fa !important; filter: drop-shadow(0 0 3px rgba(37,99,235,0.14)); }
            .mnh-theme-nordic-slate .mnh-chip, .mnh-theme-nordic-slate #mnh-row-stems button { background: rgba(51,65,85,0.56) !important; border: 1px solid rgba(148,163,184,0.14) !important; border-radius: 10px !important; box-shadow: inset 0 1px 0 rgba(255,255,255,0.02) !important; color: #cbd5e1 !important; font-weight: 650 !important; }
            .mnh-theme-nordic-slate .mnh-chip-active, .mnh-theme-nordic-slate #mnh-row-stems button[aria-pressed="true"] { background: linear-gradient(180deg, rgba(96,165,250,0.28), rgba(37,99,235,0.20)) !important; border-color: rgba(147,197,253,0.40) !important; box-shadow: 0 0 9px rgba(37,99,235,0.10), inset 0 1px 0 rgba(255,255,255,0.07) !important; color: #dbeafe !important; }
            .mnh-theme-nordic-slate .mnh-button-active, .mnh-theme-nordic-slate .nd-detect-btn[class*="bg-green"] { background: linear-gradient(180deg, rgba(34,197,94,0.28), rgba(21,128,61,0.22)) !important; border: 1px solid rgba(74,222,128,0.38) !important; border-radius: 11px !important; box-shadow: 0 0 10px rgba(34,197,94,0.14), inset 0 1px 0 rgba(255,255,255,0.07) !important; color: #ecfdf5 !important; font-weight: 700 !important; }
            .mnh-theme-nordic-slate button:disabled, .mnh-theme-nordic-slate .mnh-button-disabled { opacity: 0.48 !important; background: rgba(31,41,55,0.42) !important; border-color: rgba(148,163,184,0.11) !important; box-shadow: none !important; color: #94a3b8 !important; cursor: not-allowed !important; }
            
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

    /**
     * Check if a control element is a priority control that should stay
     * at its natural order position (not pushed to CONTROL_ORDER.REST).
     */
    function isPriorityControl(el) {
        return el.id === 'arr-select' ||
               el.id === 'mobile-back-btn' ||
               el.id === 'btn-play' ||
               (el.tagName === 'BUTTON' && el.getAttribute('onclick')?.includes('seekBy('));
    }

    /**
     * Find the home/back close button within player controls.
     */
    function findHomeCloseButton(controls) {
        if (!controls) return null;
        return Array.from(controls.querySelectorAll('button')).find(function(btn) {
            const onclick = btn.getAttribute('onclick');
            return onclick && onclick.includes("showScreen('home')");
        });
    }

    /**
     * Apply mobile back-button layout: transform icon, set order, clear
     * auto margins, apply device/state-sensitive right margin.
     */
    function applyMobileBackButtonLayout(btn) {
        if (!btn) return;
        transformCloseButton(btn);
        btn.style.order = CONTROL_ORDER.BACK;
        btn.classList.remove('ml-auto');
        btn.style.marginLeft = '0';
        btn.style.marginRight = _ui.expanded ? '0' : ((DEVICE === 'phone') ? '4px' : '12px');
    }

    // ═══════════════════════════════════════════════════════════════
    // Essential Control Detection
    // ═══════════════════════════════════════════════════════════════
    
    // ─────────────────────────────────────────────────────────────────
    // Collapsed Visibility (isEssentialControl / hideControl)
    // ─────────────────────────────────────────────────────────────────
    // isEssentialControl controls collapsed visibility only.
    // Expanded organization is handled separately by ROW_IDS and
    // classifyControlForExpandedRow().

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

    function shouldShareStemsAndToolsRow() {
        var controls = document.getElementById('player-controls');
        return !!(_ui.expanded && controls && controls.clientWidth >= 720);
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
            wrapper.classList.toggle('mnh-more-tray', row.id === ROW_IDS.FEATURES || row.id === ROW_IDS.PLUGINS);
            wrapper.classList.toggle('mnh-slider-cluster', row.id === ROW_IDS.SLIDERS);
            wrappers[row.id] = wrapper;
        }
        return wrappers;
    }

    function isDetectButton(btn) {
        if (!btn) return false;
        if (btn.classList && btn.classList.contains('nd-detect-btn')) return true;
        return /^detect\b/i.test((btn.textContent || '').trim());
    }

    function isDetectButtonActive(btn) {
        if (!btn) return false;
        var text = (btn.textContent || '').toLowerCase();
        var className = String(btn.className || '').toLowerCase();
        return btn.getAttribute('aria-pressed') === 'true' ||
            text.indexOf('\u2713') !== -1 ||
            /\b(on|active|enabled|running)\b/.test(text) ||
            className.indexOf('bg-green') !== -1;
    }

    function normalizeThemeId(themeId) {
        return VALID_MNH_THEME_IDS.indexOf(themeId) !== -1 ? themeId : DEFAULT_MNH_THEME_ID;
    }

    function getActiveThemeId() {
        try {
            return normalizeThemeId(localStorage.getItem('mobile_note_highway.theme') || DEFAULT_MNH_THEME_ID);
        } catch (_) {
            return DEFAULT_MNH_THEME_ID;
        }
    }

    function getThemeClassName(themeId) {
        return 'mnh-theme-' + normalizeThemeId(themeId);
    }

    function applyMobileControlTheme(controls, mode) {
        if (!controls) return;

        var themeClass = getThemeClassName(getActiveThemeId());
        var isExpandedMode = mode === 'expanded';
        controls.classList.add('mnh-themed-controls', themeClass, 'mnh-control-deck');
        controls.classList.toggle('mnh-expanded-deck', isExpandedMode);
        controls.classList.toggle('mnh-collapsed-deck', mode === 'collapsed');

        Array.from(controls.querySelectorAll('button')).forEach(function(btn) {
            btn.classList.toggle('mnh-button-disabled', !!btn.disabled || btn.getAttribute('aria-disabled') === 'true');

            if (btn.id === SECTION_HEADER_IDS.PLUGINS) {
                btn.classList.toggle('mnh-more-pill', isExpandedMode);
                return;
            }

            if (btn.closest && btn.closest('#stems-mixer')) {
                btn.classList.toggle('mnh-chip', isExpandedMode);
                btn.classList.toggle('mnh-chip-active', isExpandedMode && btn.getAttribute('aria-pressed') === 'true');
                return;
            }

            if (btn.id === 'btn-play') {
                btn.classList.add('mnh-button-primary');
                btn.classList.remove('mnh-button-secondary');
                return;
            }

            if (isDetectButton(btn)) {
                btn.classList.toggle('mnh-button-active', isDetectButtonActive(btn));
            }

            btn.classList.add('mnh-button-secondary');
        });

        Array.from(controls.querySelectorAll('select')).forEach(function(select) {
            select.classList.toggle('mnh-select', isExpandedMode || !select.classList.contains('mobile-hidden'));
        });

        [
            WRAPPER_IDS.MASTERY,
            WRAPPER_IDS.SPEED,
            WRAPPER_IDS.AV
        ].forEach(function(id) {
            var wrapper = document.getElementById(id);
            if (wrapper) wrapper.classList.toggle('mnh-slider-card', isExpandedMode || !wrapper.classList.contains('mobile-hidden'));
        });

        [
            'mastery-slider',
            'speed-slider',
            'player-av-offset-slider'
        ].forEach(function(id) {
            var slider = document.getElementById(id);
            if (slider) slider.classList.toggle('mnh-slider', isExpandedMode || !slider.classList.contains('mobile-hidden'));
        });
    }

    function removeMobileControlTheme(controls) {
        if (!controls) return;

        controls.classList.remove(
            'mnh-themed-controls',
            'mnh-control-deck',
            'mnh-expanded-deck',
            'mnh-collapsed-deck'
        );
        VALID_MNH_THEME_IDS.forEach(function(themeId) {
            controls.classList.remove(getThemeClassName(themeId));
        });

        controls.querySelectorAll('.mnh-button-primary, .mnh-button-secondary, .mnh-button-active, .mnh-button-disabled, .mnh-chip, .mnh-chip-active, .mnh-more-pill, .mnh-more-pill-open, .mnh-more-tray, .mnh-select, .mnh-slider-card, .mnh-slider-cluster, .mnh-slider').forEach(function(el) {
            el.classList.remove(
                'mnh-button-primary',
                'mnh-button-secondary',
                'mnh-button-active',
                'mnh-button-disabled',
                'mnh-chip',
                'mnh-chip-active',
                'mnh-more-pill',
                'mnh-more-pill-open',
                'mnh-more-tray',
                'mnh-select',
                'mnh-slider-card',
                'mnh-slider-cluster',
                'mnh-slider'
            );
        });
    }

    function shouldRefreshThemeForMutation(target) {
        if (!target || target.nodeType !== Node.ELEMENT_NODE) return false;
        return target.tagName === 'BUTTON' ||
            target.tagName === 'SELECT' ||
            (target.tagName === 'INPUT' && target.type === 'range') ||
            target.classList.contains('mnh-slider-card') ||
            target.classList.contains('mnh-section-row');
    }

    function scheduleMobileControlThemeRefresh(controls) {
        if (!controls || _themeReapplyScheduled) return;

        _themeReapplyScheduled = true;
        requestAnimationFrame(function() {
            _themeReapplyScheduled = false;
            if (!controls.isConnected) return;

            applyMobileControlTheme(controls, _ui.expanded ? 'expanded' : 'collapsed');
            if (_ui.expanded) {
                applyToolsSectionVisibility();
            }
        });
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
        applyMobileControlTheme(controls, 'expanded');
    }

    function teardownExpandedControlRows(controls) {
        removeMobileControlTheme(controls);

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

    function applyStemsToolsSharedRowLayout() {
        var stemsRow = document.getElementById(ROW_IDS.STEMS);
        var header = document.getElementById(SECTION_HEADER_IDS.PLUGINS);
        var shouldShare = shouldShareStemsAndToolsRow();

        if (stemsRow) {
            if (shouldShare) {
                stemsRow.style.width = 'auto';
                stemsRow.style.flex = '0 1 auto';
                stemsRow.style.minWidth = '0';
                stemsRow.style.maxWidth = '';
                stemsRow.style.flexWrap = 'wrap';
                stemsRow.style.marginRight = '8px';
            } else {
                stemsRow.style.width = '100%';
                stemsRow.style.flex = '';
                stemsRow.style.minWidth = '';
                stemsRow.style.maxWidth = '';
                stemsRow.style.flexWrap = '';
                stemsRow.style.marginRight = '';
            }
        }

        if (header) {
            header.style.marginLeft = '';
        }
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

        header.style.display = 'inline-flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'center';
        header.style.gap = '6px';
        header.style.width = 'auto';
        header.style.height = '36px';
        header.style.minHeight = '36px';
        header.style.padding = '0 12px';
        header.style.borderRadius = '999px';
        header.style.whiteSpace = 'nowrap';
        header.style.flex = '0 0 auto';
        header.style.textAlign = 'center';
        header.style.marginBottom = '6px';
        applyStemsToolsSharedRowLayout();
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
        
        Array.from(controls.querySelectorAll('.seek-label')).forEach(label => {
            label.style.display = 'none';
        });
        
        Array.from(controls.querySelectorAll('input[type="range"]')).forEach(slider => {
            slider.style.minHeight = CFG.buttonHeight + 'px';
            if (CFG.sliderMinWidth > 0) {
                slider.style.minWidth = CFG.sliderMinWidth + 'px';
            }
        });
        
        Array.from(controls.querySelectorAll('select')).forEach(select => {
            select.style.setProperty('height', CFG.selectHeight + 'px', 'important');
            select.style.setProperty('min-height', CFG.selectHeight + 'px', 'important');
        });
        
        // Stack speed label above speed slider to save horizontal space
        const speedSlider = document.getElementById('speed-slider');
        const speedLabel = document.getElementById('speed-label');
        if (speedSlider && speedLabel && speedSlider.parentElement === controls && speedLabel.parentElement === controls) {
            var speedWrapper = createMobileSliderWrapper(WRAPPER_IDS.SPEED);

            var speedLabelRow = createMobileSliderLabelRow();

            var speedStaticLabel = document.createElement('span');
            speedStaticLabel.textContent = 'Speed';
            speedStaticLabel.id = 'mobile-speed-static-label';
            speedStaticLabel.className = 'text-xs text-gray-500 ml-1';
            applyMobileSliderLabelTextStyles(speedStaticLabel);

            applyMobileSliderLabelTextStyles(speedLabel);

            speedSlider.parentElement.insertBefore(speedWrapper, speedSlider);
            speedWrapper.appendChild(speedLabelRow);
            speedLabelRow.appendChild(speedStaticLabel);
            speedLabelRow.appendChild(createMobileSliderSeparator());
            speedLabelRow.appendChild(speedLabel);
            speedWrapper.appendChild(speedSlider);

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
            
            var masteryWrapper = createMobileSliderWrapper(WRAPPER_IDS.MASTERY);
            
            var masteryLabelRow = createMobileSliderLabelRow();
            
            // Insert wrapper before the label (label comes first in DOM)
            masteryLabel.parentElement.insertBefore(masteryWrapper, masteryLabel);
            
            masteryWrapper.appendChild(masteryLabelRow);
            masteryLabelRow.appendChild(masteryLabel);
            masteryLabelRow.appendChild(createMobileSliderSeparator());
            masteryLabelRow.appendChild(masteryValue);
            masteryWrapper.appendChild(masterySlider);
            
            masteryLabel.textContent = 'Difficulty';
            applyMobileSliderLabelTextStyles(masteryLabel);
            applyMobileSliderLabelTextStyles(masteryValue);

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
            
            var avWrapper = createMobileSliderWrapper(WRAPPER_IDS.AV);
            
            var avLabelRow = createMobileSliderLabelRow();
            
            // Insert wrapper before the label (label comes first in DOM)
            avLabel.parentElement.insertBefore(avWrapper, avLabel);
            
            avWrapper.appendChild(avLabelRow);
            avLabelRow.appendChild(avLabel);
            avLabelRow.appendChild(createMobileSliderSeparator());
            avLabelRow.appendChild(avValue);
            avWrapper.appendChild(avSlider);
            
            avLabel.textContent = 'Offset';
            applyMobileSliderLabelTextStyles(avLabel);
            applyMobileSliderLabelTextStyles(avValue);

            applyMobileSliderInputBaseStyles(avSlider);
        }
        
        Array.from(controls.children).forEach(el => {
            if (!isPriorityControl(el) && !el.id?.startsWith('mobile-')) {
                el.style.order = CONTROL_ORDER.REST;
            }
            
            if (!isEssentialControl(el)) {
                hideControl(el);
            }
        });
        
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
        
        applyControlOrder();

        controls.style.position = 'relative';
        
        const closeButton = findHomeCloseButton(controls);
        applyMobileBackButtonLayout(closeButton);

        if (!_ui.expanded) {
            applyMobileControlTheme(controls, 'collapsed');
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
            
            if (!isPriorityControl(el) && !el.id?.startsWith('mobile-') && !el.style.order) {
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
        const closeButton = findHomeCloseButton(controls);
        if (closeButton && closeButton.style.order !== CONTROL_ORDER.BACK) {
            applyMobileBackButtonLayout(closeButton);
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

                        if (shouldRefreshThemeForMutation(target)) {
                            scheduleMobileControlThemeRefresh(controls);
                        }

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
            
            if (!isPriorityControl(el) && !el.id?.startsWith('mobile-') && !el.style.order) {
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
        const closeButton = findHomeCloseButton(controls);
        applyMobileBackButtonLayout(closeButton);

        if (!_ui.expanded) {
            applyMobileControlTheme(controls, 'collapsed');
        }

        scheduleHighwayLayoutRefresh();
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

    function scheduleHighwayLayoutRefresh() {
        scheduleEnhancement(refreshHighwayLayout, 50);
        scheduleEnhancement(refreshHighwayLayout, 250);
    }

    function scheduleOrientationHighwayLayoutRefresh() {
        scheduleHighwayLayoutRefresh();
        scheduleEnhancement(refreshHighwayLayout, 500);
        scheduleEnhancement(refreshHighwayLayout, 800);
    }

    function scheduleHighwayViewChangeRefresh() {
        scheduleHighwayLayoutRefresh();
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
            
            switch (_whoosh.type) {
                case 'sawtooth':
                case 'sine':
                    _whoosh.source = _whoosh.context.createOscillator();
                    _whoosh.source.type = _whoosh.type;
                    _whoosh.source.frequency.value = isForward ? 150 : 200;
                    
                    _whoosh.filter = _whoosh.context.createBiquadFilter();
                    _whoosh.filter.type = 'bandpass';
                    _whoosh.filter.frequency.value = 800;
                    _whoosh.filter.Q.value = 5;
                    
                    _whoosh.source.connect(_whoosh.filter);
                    _whoosh.filter.connect(_whoosh.gain);
                    break;
                    
                case 'whitenoise':
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
        
        injectMobileStyles();
        
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
                clearPendingEnhancements();
                
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

    window.mnhSetTheme = function(themeId) {
        var normalized = normalizeThemeId(themeId);

        try {
            localStorage.setItem('mobile_note_highway.theme', normalized);
        } catch (err) {
            console.error('[mobile_note_highway] Failed to save theme:', err);
        }

        updateMobileStyles();

        var controls = document.getElementById('player-controls');
        if (controls) {
            removeMobileControlTheme(controls);
            applyMobileControlTheme(controls, _ui.expanded ? 'expanded' : 'collapsed');

            if (_ui.expanded) {
                applyToolsSectionVisibility();
            }
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
