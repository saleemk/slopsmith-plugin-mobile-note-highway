(function() {
    'use strict';
    
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
    // Device Detection
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Detect device class.
     * - tablet: touch device with width >= 600px (iPad portrait & up)
     * - phone:  touch device with width < 600px
     * - desktop: non-touch (mouse-driven)
     * @returns {'phone'|'tablet'|'desktop'}
     */
    function detectDevice() {
        const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
        const hasTouch = hasCoarsePointer || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (!hasTouch) return 'desktop';
        return window.innerWidth >= 600 ? 'tablet' : 'phone';
    }
    
    let DEVICE = detectDevice();
    
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
            // Gestures (same on both today; deferred refinement)
            swipeHorizontalThreshold: 50,
            swipeVerticalThreshold: 40,
            swipeMaxDurationMs: 500,
            tapMaxDurationMs: 300,
            tapMaxMovementPx: 10,
            doubleTapWindowMs: 250,
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
            // Gestures — same numbers across devices (per user)
            swipeHorizontalThreshold: 50,
            swipeVerticalThreshold: 40,
            swipeMaxDurationMs: 500,
            tapMaxDurationMs: 300,
            tapMaxMovementPx: 10,
            doubleTapWindowMs: 250,
            pullToRefreshGuardPx: 10,
        },
    };
    
    let CFG = CONFIG[DEVICE] || CONFIG.phone;
    let IS_TABLET = DEVICE === 'tablet';
    
    /**
     * Plugin activates on phone AND tablet; not on desktop.
     * @returns {boolean}
     */
    function isMobile() {
        return DEVICE === 'phone' || DEVICE === 'tablet';
    }
    
    // ═══════════════════════════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════════════════════════
    
    // UI state and refs
    const _ui = {
        expanded: false,           // was _toolsExpanded
        swipeIndicator: null,      // was _swipeIndicator
    };
    
    // Highway gesture state (swipes, taps, loop markers)
    const _highway = {
        gestureStartX: 0,          // was _gestureStartX
        gestureStartY: 0,          // was _gestureStartY
        gestureStartTime: 0,       // was _gestureStartTime
        gestureActive: false,      // was _gestureActive
        lastTapTime: 0,            // was _lastTapTime
        loopMarkerState: 'ready',  // was _loopMarkerState ('ready' | 'a-set' | 'b-set')
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
    let _highway3dObserver = null;
    let _highway3dAdjusted = false;
    
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
    };
    
    /**
     * Check if element is inside one of our wrapper divs
     * (wrappers fully own their children - skip observer processing)
     */
    function isInsideWrapper(element) {
        const parentId = element?.parentElement?.id;
        return parentId === WRAPPER_IDS.MASTERY ||
               parentId === WRAPPER_IDS.SPEED ||
               parentId === WRAPPER_IDS.AV;
    }
    
    /**
     * Check if element is one of our helper elements (indicator/spacer)
     */
    function isHelperElement(element) {
        const id = element?.id;
        return id === HELPER_IDS.SWIPE_INDICATOR || id === HELPER_IDS.END_SPACER;
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
    
    /**
     * Inject CSS classes for mobile note highway to avoid inline style thrashing
     */
    function injectMobileStyles() {
        if (document.getElementById('mobile-ui-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'mobile-ui-styles';
        style.textContent = `
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
            
            /* Phantom spacer reserves space for the floating "?" help button on the last flex row only */
            #mobile-end-spacer {
                order: 9999;
                width: 56px;
                min-height: 1px;
                flex-shrink: 0;
                pointer-events: none;
            }
            
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
        document.head.appendChild(style);
    }
    
    /**
     * Update CSS variables when device type changes
     */
    function updateMobileStyles() {
        const style = document.getElementById('mobile-ui-styles');
        if (!style) return;
        
        style.textContent = `
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
            
            /* Phantom spacer reserves space for the floating "?" help button on the last flex row only */
            #mobile-end-spacer {
                order: 9999;
                width: 56px;
                min-height: 1px;
                flex-shrink: 0;
                pointer-events: none;
            }
            
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
    
    // ═══════════════════════════════════════════════════════════════
    // Device Resize Handling
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Handle viewport resize (orientation change, browser resize)
     * Re-detects device type and re-enhances if needed
     */
    function handleResize() {
        const newDevice = detectDevice();
        if (newDevice !== DEVICE) {
            console.log('[mobile_note_highway] Device changed:', DEVICE, '->', newDevice);
            DEVICE = newDevice;
            CFG = CONFIG[DEVICE] || CONFIG.phone;
            IS_TABLET = DEVICE === 'tablet';
            updateMobileStyles();
            
            // Re-enhance if on player screen
            const currentScreen = window.slopsmith?.getCurrentScreen?.();
            if (currentScreen === 'player') {
                scheduleEnhancement(enhancePlayerControls, 100);
            }
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
    
    /**
     * Check if an element should remain visible (not hidden in Tools)
     * @param {HTMLElement} el - Element to check
     * @returns {boolean} True if element is essential and should stay visible
     */
    function isEssentialControl(el) {
        // Essential control IDs (phone: play + arrangement; tablet adds difficulty + speed)
        const essentialIds = [
            'btn-play',
            'arr-select'
        ];
        if (IS_TABLET) {
            essentialIds.push('mastery-slider', 'mastery-slider-label', 'mastery-label', 'speed-slider', 'speed-label');
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
            arrSelect.style.marginLeft = '12px';
            arrSelect.style.width = CFG.selectWidth + 'px';
            arrSelect.style.marginRight = (!IS_TABLET && _ui.expanded) ? 'auto' : '0';
        }
        
        if (arrDefaultPin) {
            arrDefaultPin.style.order = '101';  // After A/V offset (order 100)
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
            avWrapper.style.order = CONTROL_ORDER.REST;
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Collapsible Controls
    // ═══════════════════════════════════════════════════════════════
    
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
            const speedWrapper = document.createElement('div');
            speedWrapper.id = WRAPPER_IDS.SPEED;  // Unique ID for later targeting
            speedWrapper.style.display = 'inline-flex';
            speedWrapper.style.flexDirection = 'column';
            speedWrapper.style.alignItems = 'center';
            speedWrapper.style.gap = '0';  // No gap between label and slider
            speedWrapper.style.height = CFG.sliderWrapperHeight + 'px';
            speedWrapper.style.justifyContent = 'flex-start';  // Align to top
            
            // Insert wrapper before the slider
            speedSlider.parentElement.insertBefore(speedWrapper, speedSlider);
            
            // Move label and slider into wrapper
            speedWrapper.appendChild(speedLabel);
            speedWrapper.appendChild(speedSlider);
            
            // Adjust label styling
            speedLabel.style.fontSize = CFG.sliderLabelFontSize + 'px';
            speedLabel.style.lineHeight = '1';
            speedLabel.style.marginTop = '0';  // Align to top of wrapper
            speedLabel.style.marginBottom = '0';
            speedLabel.style.paddingTop = '0';
            speedLabel.style.paddingBottom = '5px';  // Gap between label and slider
            speedLabel.style.textAlign = 'center';
            speedLabel.style.width = 'auto';  // Override w-10 class
            
            // Adjust slider styling
            speedSlider.style.minHeight = 'auto';
            speedSlider.style.height = CFG.sliderTrackHeight + 'px';
            if (CFG.sliderMinWidth > 0) {
                speedSlider.style.minWidth = CFG.sliderMinWidth + 'px';
            }
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
            const masteryWrapper = document.createElement('div');
            masteryWrapper.id = WRAPPER_IDS.MASTERY;
            masteryWrapper.style.display = 'inline-flex';
            masteryWrapper.style.flexDirection = 'column';
            masteryWrapper.style.alignItems = 'center';
            masteryWrapper.style.gap = '2px';
            masteryWrapper.style.height = CFG.sliderWrapperHeight + 'px';
            masteryWrapper.style.justifyContent = 'flex-start';
            
            // Create horizontal row for label + value
            const masteryLabelRow = document.createElement('div');
            masteryLabelRow.style.display = 'flex';
            masteryLabelRow.style.alignItems = 'center';
            masteryLabelRow.style.justifyContent = 'center';
            masteryLabelRow.style.gap = '4px';
            masteryLabelRow.style.fontSize = CFG.sliderLabelFontSize + 'px';
            masteryLabelRow.style.lineHeight = '1';
            masteryLabelRow.style.paddingBottom = '5px';
            
            // Insert wrapper before the label (label comes first in DOM)
            masteryLabel.parentElement.insertBefore(masteryWrapper, masteryLabel);
            
            // Move elements into structure
            masteryWrapper.appendChild(masteryLabelRow);
            masteryLabelRow.appendChild(masteryLabel);
            
            // Add separator
            const masterySeparator = document.createElement('span');
            masterySeparator.textContent = '•';
            masterySeparator.style.opacity = '0.5';
            masteryLabelRow.appendChild(masterySeparator);
            
            masteryLabelRow.appendChild(masteryValue);
            masteryWrapper.appendChild(masterySlider);
            
            // Style label
            masteryLabel.textContent = 'Difficulty';
            masteryLabel.style.fontSize = CFG.sliderLabelFontSize + 'px';
            masteryLabel.style.lineHeight = '1';
            masteryLabel.style.margin = '0';
            masteryLabel.style.padding = '0';
            masteryLabel.style.width = 'auto';
            
            // Style value
            masteryValue.style.fontSize = CFG.sliderLabelFontSize + 'px';
            masteryValue.style.lineHeight = '1';
            masteryValue.style.margin = '0';
            masteryValue.style.padding = '0';
            masteryValue.style.width = 'auto';
            
            // Adjust slider styling
            masterySlider.style.minHeight = 'auto';
            masterySlider.style.height = CFG.sliderTrackHeight + 'px';
            if (CFG.sliderMinWidth > 0) {
                masterySlider.style.minWidth = CFG.sliderMinWidth + 'px';
            }
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
            const avWrapper = document.createElement('div');
            avWrapper.id = WRAPPER_IDS.AV;  // Unique ID for later targeting
            avWrapper.style.display = 'inline-flex';
            avWrapper.style.flexDirection = 'column';
            avWrapper.style.alignItems = 'center';
            avWrapper.style.gap = '2px';
            avWrapper.style.height = CFG.sliderWrapperHeight + 'px';
            avWrapper.style.justifyContent = 'flex-start';
            
            // Create horizontal row for label + value
            const avLabelRow = document.createElement('div');
            avLabelRow.style.display = 'flex';
            avLabelRow.style.alignItems = 'center';
            avLabelRow.style.justifyContent = 'center';
            avLabelRow.style.gap = '4px';
            avLabelRow.style.fontSize = CFG.sliderLabelFontSize + 'px';
            avLabelRow.style.lineHeight = '1';
            avLabelRow.style.paddingBottom = '5px';
            
            // Insert wrapper before the label (label comes first in DOM)
            avLabel.parentElement.insertBefore(avWrapper, avLabel);
            
            // Move elements into structure
            avWrapper.appendChild(avLabelRow);
            avLabelRow.appendChild(avLabel);
            
            // Add separator
            const avSeparator = document.createElement('span');
            avSeparator.textContent = '•';
            avSeparator.style.opacity = '0.5';
            avLabelRow.appendChild(avSeparator);
            
            avLabelRow.appendChild(avValue);
            avWrapper.appendChild(avSlider);
            
            // Style label
            avLabel.textContent = 'Offset';
            avLabel.style.fontSize = CFG.sliderLabelFontSize + 'px';
            avLabel.style.lineHeight = '1';
            avLabel.style.margin = '0';
            avLabel.style.padding = '0';
            avLabel.style.width = 'auto';
            
            // Style value
            avValue.style.fontSize = CFG.sliderLabelFontSize + 'px';
            avValue.style.lineHeight = '1';
            avValue.style.margin = '0';
            avValue.style.padding = '0';
            avValue.style.width = 'auto';
            
            // Adjust slider styling
            avSlider.style.minHeight = 'auto';
            avSlider.style.height = CFG.sliderTrackHeight + 'px';
            if (CFG.sliderMinWidth > 0) {
                avSlider.style.minWidth = CFG.sliderMinWidth + 'px';
            }
        }
        
        // Hide all non-essential controls (after styling, so display: 'none' wins)
        // Also set order for non-priority controls
        let hiddenCount = 0;
        Array.from(controls.children).forEach(el => {
            // Set order for non-priority controls (back/play/arr/seekBy are priority, mobile-* excluded)
            const isPriority = el.id === 'arr-select' || 
                              el.id === 'mobile-back-btn' ||
                              el.id === 'btn-play' ||
                              (el.tagName === 'BUTTON' && el.getAttribute('onclick')?.includes('seekBy('));
            
            if (!isPriority && !el.id?.startsWith('mobile-')) {
                // Non-priority controls: order 100
                el.style.order = CONTROL_ORDER.REST;
            }
            
            if (!isEssentialControl(el)) {
                hideControl(el);
                hiddenCount++;
            }
        });
        
        // Watch for plugin buttons being injected after initial load
        startControlsObserver(controls);
        
        // Run multiple passes to catch late-injected buttons (plugins load at different times)
        // Pass 1: 100ms - catches early plugins
        setTimeout(() => reclassifyAllControls(), 100);
        // Pass 2: 300ms - catches most plugins
        setTimeout(() => reclassifyAllControls(), 300);
        // Pass 3: 600ms - catches slow plugins
        setTimeout(() => reclassifyAllControls(), 600);
        
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
            
            // Inner element for bounce animation
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
        
        // Inject a phantom end-spacer that reserves 56px on the LAST flex row
        // for the floating "?" help button. Using order:9999 + flex-shrink:0
        // ensures it always lands as the last item on whatever row is last.
        if (!document.getElementById(HELPER_IDS.END_SPACER)) {
            const spacer = document.createElement('div');
            spacer.id = HELPER_IDS.END_SPACER;
            spacer.setAttribute('aria-hidden', 'true');
            controls.appendChild(spacer);
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
            closeButton.style.marginRight = '12px';
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
        // Apply order and margins
        applyControlOrder();
        
        // Re-set wrapper display (can get cleared on song change)
        const masteryWrapper = document.getElementById(WRAPPER_IDS.MASTERY);
        const speedWrapper = document.getElementById(WRAPPER_IDS.SPEED);
        const avWrapper = document.getElementById(WRAPPER_IDS.AV);
        
        if (masteryWrapper) {
            masteryWrapper.style.display = 'inline-flex';
        }
        if (speedWrapper) {
            speedWrapper.style.display = 'inline-flex';
        }
        if (avWrapper) {
            avWrapper.style.display = 'inline-flex';
        }
        
        // Reset slider heights (they get overridden to 44px)
        const speedSlider = document.getElementById('speed-slider');
        const masterySlider = document.getElementById('mastery-slider');
        const avSlider = document.getElementById('player-av-offset-slider');
        
        if (speedSlider) {
            speedSlider.style.minHeight = 'auto';
            speedSlider.style.height = CFG.sliderTrackHeight + 'px';
        }
        if (masterySlider) {
            masterySlider.style.minHeight = 'auto';
            masterySlider.style.height = CFG.sliderTrackHeight + 'px';
        }
        if (avSlider) {
            avSlider.style.minHeight = 'auto';
            avSlider.style.height = CFG.sliderTrackHeight + 'px';
        }
        
        // Re-classify controls to fix visibility (the actual fix for missing sliders)
        reclassifyAllControls();
    }
    
    /**
     * Re-classify all controls in the player (catches late-injected buttons)
     * Forces correct display state on ALL controls, not just new ones
     */
    function reclassifyAllControls() {
        const controls = document.getElementById('player-controls');
        if (!controls) return;
        
        let fixedCount = 0;
        Array.from(controls.children).forEach(el => {
            // Skip our injected helpers
            if (isHelperElement(el)) return;
            
            // Set order for non-priority controls (back/play/arr/seekBy are priority, mobile-* excluded)
            const isPriority = el.id === 'arr-select' || 
                              el.id === 'mobile-back-btn' ||
                              el.id === 'btn-play' ||
                              (el.tagName === 'BUTTON' && el.getAttribute('onclick')?.includes('seekBy('));
            
            if (!isPriority && !el.id?.startsWith('mobile-') && !el.style.order) {
                el.style.order = CONTROL_ORDER.REST;
            }
            
            if (isEssentialControl(el)) {
                // Essential controls - ensure visible and no hide class
                if (el.classList.contains('mobile-hide-advanced')) {
                    el.classList.remove('mobile-hide-advanced');
                    el.classList.remove('mobile-hidden');
                    fixedCount++;
                }
            } else {
                // Non-essential controls - mark with hide class and apply visibility based on expanded state
                const wasFixed = !el.classList.contains('mobile-hide-advanced');
                el.classList.add('mobile-hide-advanced');
                // Use CSS class instead of inline style
                if (_ui.expanded) {
                    el.classList.remove('mobile-hidden');
                } else {
                    el.classList.add('mobile-hidden');
                }
                if (wasFixed) {
                    fixedCount++;
                }
            }
        });
        
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
            closeButton.style.marginRight = '12px';
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
                            
                            if (node.tagName === 'BUTTON') {
                                node.classList.add('mobile-button');
                            }
                            
                            if (!isEssentialControl(node)) {
                                hideControl(node);
                            }
                        });
                    } else if (mutation.type === 'attributes') {
                        const target = mutation.target;
                        
                        if (isHelperElement(target)) return;
                        if (isInsideWrapper(target)) return;
                        
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

        // Get controls element for subsequent operations
        const controls = document.getElementById('player-controls');

        // Re-apply explicit order values
        applyControlOrder();

        // Close button: keep transformed into a Back icon at far left
        if (controls) {
            const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
                const onclick = btn.getAttribute('onclick');
                return onclick && onclick.includes("showScreen('home')");
            });
            if (closeButton) {
                transformCloseButton(closeButton);
                closeButton.style.order = CONTROL_ORDER.BACK;
                closeButton.style.marginLeft = '0';
                closeButton.style.marginRight = '12px';
            }
        }
        
        // Re-scan ALL controls to catch any late-injected buttons
        if (controls) {
            Array.from(controls.children).forEach(el => {
                // Skip our injected helpers
                if (isHelperElement(el)) return;
                
                // Set order for non-priority controls (back/play/arr/seekBy are priority, mobile-* excluded)
                const isPriority = el.id === 'arr-select' || 
                                  el.id === 'mobile-back-btn' ||
                                  el.id === 'btn-play' ||
                                  (el.tagName === 'BUTTON' && el.getAttribute('onclick')?.includes('seekBy('));
                
                if (!isPriority && !el.id?.startsWith('mobile-') && !el.style.order) {
                    el.style.order = CONTROL_ORDER.REST;
                }
                
                const isEssential = isEssentialControl(el);
                
                if (isEssential) {
                    // Essential controls - always visible, ensure no hide class
                    el.classList.remove('mobile-hide-advanced');
                } else {
                    // Non-essential - mark for hiding and set display based on expanded state
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
            
            // Ensure close button stays transformed as Back icon at far left
            const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
                const onclick = btn.getAttribute('onclick');
                return onclick && onclick.includes("showScreen('home')");
            });
            if (closeButton) {
                transformCloseButton(closeButton);
                closeButton.style.order = CONTROL_ORDER.BACK;
                closeButton.classList.remove('ml-auto');
                closeButton.style.marginLeft = '0';
                closeButton.style.marginRight = '12px';
            }
        }
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
    
    // ═══════════════════════════════════════════════════════════════
    // Section Map Mobile Enhancement
    // ═══════════════════════════════════════════════════════════════
    
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
        
        const wrap = document.querySelector('.h3d-wrap');
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
        
        const wrap = document.querySelector('.h3d-wrap');
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
    // Gesture Detection
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Enable swipe and tap gestures on the highway
     */
    function enableHighwayGestures() {
        const highway = document.getElementById('highway');
        if (!highway) return;
        
        highway.addEventListener('touchstart', onGestureStart, { passive: true });
        highway.addEventListener('touchend', onGestureEnd, { passive: false });
    }
    
    /**
     * Disable highway gestures
     */
    function disableHighwayGestures() {
        const highway = document.getElementById('highway');
        if (!highway) return;
        
        highway.removeEventListener('touchstart', onGestureStart);
        highway.removeEventListener('touchend', onGestureEnd);
    }
    
    /**
     * Handle touch start for gesture detection
     */
    function onGestureStart(e) {
        if (!e.touches || e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        _highway.gestureStartX = touch.clientX;
        _highway.gestureStartY = touch.clientY;
        _highway.gestureStartTime = Date.now();
        _highway.gestureActive = true;
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
        
        _highway.gestureActive = false;
        
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
        
        const isSwipe = Math.abs(deltaX) > CFG.swipeHorizontalThreshold && deltaTime < CFG.swipeMaxDurationMs && Math.abs(deltaX) > Math.abs(deltaY) * 1.5;
        
        if (isSwipe) {
            e.preventDefault();
            handleSwipe(deltaX > 0 ? 'right' : 'left');
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
     * Handle swipe gesture (Seek ±5 seconds)
     */
    function handleSwipe(direction) {
        const audio = document.getElementById('audio');
        if (!audio) return;
        
        const seekAmount = direction === 'right' ? 5 : -5;
        const currentTime = audio.currentTime;
        const newTime = Math.max(0, Math.min(audio.duration || 0, currentTime + seekAmount));
        
        if (typeof lastAudioTime !== 'undefined') lastAudioTime = newTime;
        
        audio.currentTime = newTime;
        showGestureFeedback(direction === 'right' ? '+5s' : '-5s');
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
        
        controls.addEventListener('touchstart', onControlsGestureStart, { passive: true });
        controls.addEventListener('touchmove', onControlsGestureMove, { passive: false });
        controls.addEventListener('touchend', onControlsGestureEnd, { passive: false });
    }
    
    /**
     * Disable controls gestures
     */
    function disableControlsGestures() {
        const controls = document.getElementById('player-controls');
        if (!controls) return;
        
        controls.removeEventListener('touchstart', onControlsGestureStart);
        controls.removeEventListener('touchmove', onControlsGestureMove);
        controls.removeEventListener('touchend', onControlsGestureEnd);
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
    
    /**
     * Remove Mobile Note Highway enhancements
     */
    function cleanup() {
        // Cancel all pending timeouts
        _timers.pending.forEach(clearTimeout);
        _timers.pending = [];
        
        if (_timers.doubleTap) {
            clearTimeout(_timers.doubleTap);
            _timers.doubleTap = null;
        }
        
        // Stop observing
        stopControlsObserver();
        
        // Remove swipe indicator
        if (_ui.swipeIndicator && _ui.swipeIndicator.parentElement) {
            _ui.swipeIndicator.remove();
            _ui.swipeIndicator = null;
        }
        
        // Remove phantom end-spacer
        const endSpacer = document.getElementById(HELPER_IDS.END_SPACER);
        if (endSpacer) endSpacer.remove();
        
        // Get controls element
        const controls = document.getElementById('player-controls');

        // Restore close button to original state and clear positioning
        if (controls) {
            const backBtn = controls.querySelector('#mobile-back-btn') || Array.from(controls.querySelectorAll('button')).find(btn => {
                const onclick = btn.getAttribute('onclick');
                return onclick && onclick.includes("showScreen('home')");
            });
            if (backBtn) {
                restoreCloseButton(backBtn);
                backBtn.style.order = '';
                backBtn.style.marginLeft = '';
                backBtn.style.marginRight = '';
            }
        }

        // Restore all hidden controls
        document.querySelectorAll('.mobile-hide-advanced').forEach(el => {
            el.classList.remove('mobile-hide-advanced');
            el.style.display = '';
        });
        
        // Unwrap speed slider/label if wrapped
        const speedSlider = document.getElementById('speed-slider');
        const speedLabel = document.getElementById('speed-label');
        if (speedSlider && speedLabel && speedSlider.parentElement && speedSlider.parentElement !== controls) {
            const wrapper = speedSlider.parentElement;
            if (controls && wrapper.parentElement === controls) {
                // Move elements back to controls
                controls.insertBefore(speedSlider, wrapper);
                controls.insertBefore(speedLabel, wrapper);
                // Remove wrapper
                wrapper.remove();
                // Restore original styles
                speedLabel.style.fontSize = '';
                speedLabel.style.lineHeight = '';
                speedLabel.style.marginBottom = '';
                speedLabel.style.paddingTop = '';
                speedLabel.style.paddingBottom = '';
                speedLabel.style.textAlign = '';
                speedLabel.style.width = '';
                speedSlider.style.minHeight = '';
                speedSlider.style.height = '';
            }
        }
        
        // Reset touch target sizes
        if (controls) {
            Array.from(controls.querySelectorAll('button')).forEach(btn => {
                btn.style.minHeight = '';
                btn.style.minWidth = '';
                btn.style.padding = '';
            });
            
            // Restore seek button labels
            Array.from(controls.querySelectorAll('.seek-label')).forEach(label => {
                label.style.display = '';
            });
            
            Array.from(controls.querySelectorAll('input[type="range"]')).forEach(slider => {
                slider.style.minHeight = '';
            });
        }
        
        _ui.expanded = false;
    }
    
    /**
     * Initialize Mobile Note Highway plugin
     */
    function init() {
        if (!isMobile()) return;
        
        console.log('[mobile_note_highway] Activating on device:', DEVICE);
        
        // Inject CSS classes
        injectMobileStyles();
        
        // Setup resize listener
        setupResizeListener();
        
        window.slopsmith.on('screen:changed', (e) => {
            const screenId = e.detail.id || e.detail.screen;
            
            if (screenId === 'player') {
                scheduleEnhancement(enhancePlayerControls, 100);
                // Section map might already exist or appear soon (200ms)
                scheduleEnhancement(enhanceSectionMap, 200);
                // Adjust HUD position (200ms)
                scheduleEnhancement(adjustPlayerHud, 200);
                // Enable gesture controls (300ms)
                scheduleEnhancement(enableHighwayGestures, 300);
                // Enable controls swipe gestures (150ms - after controls are enhanced)
                scheduleEnhancement(enableControlsGestures, 150);
                // Start observing 3D highway overlay (500ms - needs more time to load)
                scheduleEnhancement(startHighway3dObserver, 500);
                scheduleEnhancement(syncLoopMarkerState, 100);
            } else {
                cleanup();
                restoreSectionMap();
                restorePlayerHud();
                restoreHighway3dOverlay();
                disableHighwayGestures();
                disableControlsGestures();
            }
        });
        
        // Hook into playSong to re-enhance section map when it re-renders
        const origPlaySong = window.playSong;
        if (origPlaySong) {
            window.playSong = async function(filename, arrangement) {
                // Cancel any pending enhancements from previous song
                _timers.pending.forEach(clearTimeout);
                _timers.pending = [];
                
                await origPlaySong(filename, arrangement);
                
                syncLoopMarkerState();
                
                scheduleEnhancement(reapplyControlOrder, 50);
                scheduleEnhancement(enhanceSectionMap, 300);
                scheduleEnhancement(adjustPlayerHud, 300);
                scheduleEnhancement(enableHighwayGestures, 400);
                scheduleEnhancement(enableControlsGestures, 150);
                scheduleEnhancement(startHighway3dObserver, 600);
            };
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
            scheduleEnhancement(enhancePlayerControls, 100);
            scheduleEnhancement(enhanceSectionMap, 200);
            scheduleEnhancement(adjustPlayerHud, 200);
            scheduleEnhancement(enableHighwayGestures, 300);
            scheduleEnhancement(enableControlsGestures, 150);
            scheduleEnhancement(startHighway3dObserver, 500);
            scheduleEnhancement(syncLoopMarkerState, 100);
        }
    }
    
    // Boot when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
