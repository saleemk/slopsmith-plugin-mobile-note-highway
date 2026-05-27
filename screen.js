(function() {
    'use strict';
    
    /**
     * Mobile UI Plugin
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
            sliderMinWidth: 0,          // px (0 = natural browser default)
            // Dropdowns
            selectHeight: 44,           // px (arrangement, HD, 3D highway dropdowns)
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
    
    let _toolsExpanded = false;
    let _swipeIndicator = null;
    let _controlsObserver = null;
    let _sectionMapOriginalStyles = null;
    let _playerHudOriginalStyles = null;
    let _highway3dOverlayOriginalStyles = null;
    let _highway3dObserver = null;
    let _highway3dRetryInterval = null;
    let _highway3dAdjusted = false;
    
    // Gesture state (highway swipes and tap)
    let _gestureStartX = 0;
    let _gestureStartY = 0;
    let _gestureStartTime = 0;
    let _gestureActive = false;
    let _lastTapTime = 0;
    let _loopMarkerState = 'ready'; // 'ready' | 'a-set' | 'b-set'
    
    // Controls gesture state (swipe up/down to expand/collapse)
    let _controlsGestureStartX = 0;
    let _controlsGestureStartY = 0;
    let _controlsGestureStartTime = 0;
    let _controlsGestureActive = false;
    
    // Pending timeouts (for cleanup on song change / screen exit)
    let _pendingTimeouts = [];
    let _pendingDoubleTapTimeout = null;
    
    // Resize handling
    let _resizeTimeout = null;
    
    // Observer batching (requestAnimationFrame)
    let _pendingObserverUpdate = false;
    
    // ═══════════════════════════════════════════════════════════════
    // CSS Classes Injection
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Inject CSS classes for mobile UI to avoid inline style thrashing
     */
    function injectMobileStyles() {
        if (document.getElementById('mobile-ui-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'mobile-ui-styles';
        style.textContent = `
            /* Mobile UI Plugin Styles */
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
            /* Mobile UI Plugin Styles */
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
            console.log('[mobile_ui] Device changed:', DEVICE, '->', newDevice);
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
            if (_resizeTimeout) {
                clearTimeout(_resizeTimeout);
            }
            _resizeTimeout = setTimeout(handleResize, 300);
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
    // Essential Control Detection
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Check if an element should remain visible (not hidden in Tools)
     * @param {HTMLElement} el - Element to check
     * @returns {boolean} True if element is essential and should stay visible
     */
    function isEssentialControl(el) {
        // Essential control IDs (phone default; tablet adds mastery so the
        // difficulty slider stays visible in collapsed view alongside speed)
        const essentialIds = [
            'btn-play',
            'speed-slider',
            'speed-label',
            'current-time',
            'audio-progress'
        ];
        if (IS_TABLET) {
            essentialIds.push('mastery-slider', 'mastery-slider-label', 'mastery-label', 'arr-select');
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
            if (_toolsExpanded) {
                el.classList.remove('mobile-hidden');
            } else {
                el.classList.add('mobile-hidden');
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Collapsible Controls
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Enhance player controls for mobile:
     * - Add "⚙️ Tools" toggle button
     * - Hide advanced controls by default
     * - Make all buttons 44px minimum (touch-friendly)
     */
    function enhancePlayerControls() {
        const controls = document.getElementById('player-controls');
        if (!controls) {
            console.warn('[mobile_ui] No #player-controls found');
            return;
        }
        
        //console.log('[mobile_ui] Enhancing player controls');
        
        // Make all buttons touch-friendly with consistent height FIRST
        // (before hiding, so display: 'none' can overwrite display: 'inline-flex')
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
            speedWrapper.id = 'mobile-speed-wrapper';  // Unique ID for later targeting
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
            masteryWrapper.id = 'mobile-mastery-wrapper';
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
        let hiddenCount = 0;
        Array.from(controls.children).forEach(el => {
            if (!isEssentialControl(el)) {
                hideControl(el);
                hiddenCount++;
            }
        });
        
        //console.log(`[mobile_ui] Hiding ${hiddenCount} advanced controls`);
        
        // Watch for plugin buttons being injected after initial load
        startControlsObserver(controls);
        
        // Run multiple passes to catch late-injected buttons (plugins load at different times)
        // Pass 1: 100ms - catches early plugins
        setTimeout(() => reclassifyAllControls(), 100);
        // Pass 2: 300ms - catches most plugins
        setTimeout(() => reclassifyAllControls(), 300);
        // Pass 3: 600ms - catches slow plugins
        setTimeout(() => reclassifyAllControls(), 600);
        
        // Create minimalist chevron indicator (absolutely positioned, always centered at top)
        if (!_swipeIndicator) {
            _swipeIndicator = document.createElement('div');
            _swipeIndicator.id = 'mobile-swipe-indicator';
            _swipeIndicator.textContent = '⌄';  // Always use down chevron, flip via transform
            _swipeIndicator.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scaleY(-1);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: ${CFG.chevronSize}px;
                line-height: 1;
                color: rgba(255, 255, 255, 0.35);
                pointer-events: none;
                user-select: none;
                z-index: 100;
                transition: transform 0.2s ease;
            `;
            
            controls.appendChild(_swipeIndicator);
            console.log('[mobile_ui] ✅ Minimalist chevron indicator created');
        }

        // Inject a flex spacer that carves a center gap in the first row of the
        // expanded view (so the absolutely-positioned chevron above doesn't sit on
        // top of the arrangement dropdown). Placed in DOM right before #arr-select
        // so it naturally lands after the seek/play button group. ~30px wide
        // keeps the speed/difficulty sliders close together.
        const arrSelect = document.getElementById('arr-select');
        if (arrSelect && !document.getElementById('mobile-chevron-spacer')) {
            const spacer = document.createElement('div');
            spacer.id = 'mobile-chevron-spacer';
            // On tablet the spacer is always visible (sits between speed and
            // mastery sliders in both collapsed and expanded views). On phone
            // it's only visible when expanded (creates the chevron gap in row 1).
            const visible = IS_TABLET || _toolsExpanded;
            spacer.style.cssText = 'flex: 0 0 ' + CFG.chevronSpacerWidth + 'px; height: 1px; display: ' +
                (visible ? 'block' : 'none') + ';';
            spacer.setAttribute('aria-hidden', 'true');
            arrSelect.parentElement.insertBefore(spacer, arrSelect);
        }

        // Reorder the first row for expanded view: move the speed and mastery
        // wrappers to sit right after the chevron spacer (before the arrangement
        // dropdown), so the top row reads:
        //   [seek<<][play][seek>>] [chevron gap] [Speed] [Difficulty] ... [Combo]
        // The collapsed view is unaffected because the speed wrapper has
        // `order: 998` + `marginLeft: auto` which still wins regardless of DOM
        // position, and the mastery wrapper / arrangement select are hidden in
        // collapsed mode.
        //
        // On TABLET the layout is `[Speed] [chevron] [Difficulty]` in BOTH
        // views, so we insert the spacer BETWEEN the two wrappers (DOM order:
        // speed -> spacer -> mastery -> arrSelect).
        const _speedWrapperEl = document.getElementById('mobile-speed-wrapper');
        const _masteryWrapperEl = document.getElementById('mobile-mastery-wrapper');
        const _chevSpacerEl = document.getElementById('mobile-chevron-spacer');
        if (arrSelect && IS_TABLET) {
            // Tablet: speed -> spacer -> mastery, all before arrSelect
            if (_speedWrapperEl) arrSelect.parentElement.insertBefore(_speedWrapperEl, arrSelect);
            if (_chevSpacerEl) arrSelect.parentElement.insertBefore(_chevSpacerEl, arrSelect);
            if (_masteryWrapperEl) arrSelect.parentElement.insertBefore(_masteryWrapperEl, arrSelect);
        } else if (arrSelect) {
            // Phone (original): spacer was already inserted before arrSelect;
            // move speed and mastery before arrSelect so they land after spacer.
            if (_speedWrapperEl) arrSelect.parentElement.insertBefore(_speedWrapperEl, arrSelect);
            if (_masteryWrapperEl) arrSelect.parentElement.insertBefore(_masteryWrapperEl, arrSelect);
        }

        // Ensure controls container has position: relative for absolute positioning
        controls.style.position = 'relative';

        // Set button ordering for proper layout.
        // PHONE: in COLLAPSED mode speed wrapper gets order:998 + marginLeft:auto
        // to push it to the right side. In EXPANDED mode speed gets marginLeft:auto
        // with no special order so it sits with mastery after the chevron spacer.
        // TABLET: speed always sits left-of-center with marginLeft:auto (no order
        // hack) so the layout is [play] [speed][chevron][mastery] [close] in both
        // collapsed and expanded views.
        const speedWrapper = document.getElementById('mobile-speed-wrapper');
        if (speedWrapper) {
            speedWrapper.style.order = (IS_TABLET || _toolsExpanded) ? '' : '998';
            // Tablet: speed sits adjacent to play controls (no auto margin).
            // Phone: marginLeft:auto pushes speed to the right of play group.
            speedWrapper.style.marginLeft = IS_TABLET ? '' : 'auto';
            speedWrapper.style.marginRight = '';
        }
        const masteryWrapper = document.getElementById('mobile-mastery-wrapper');
        if (masteryWrapper) {
            masteryWrapper.style.marginLeft = '';  // Sits next to spacer
        }
        // Tablet: spacer gets marginLeft:auto to create the gap and push
        // difficulty+arrangement to the right. Phone: no auto margin.
        const _spacerEl2 = document.getElementById('mobile-chevron-spacer');
        if (_spacerEl2) {
            _spacerEl2.style.marginLeft = IS_TABLET ? 'auto' : '';
            // Ensure flex properties are maintained
            if (IS_TABLET) {
                _spacerEl2.style.flex = '0 0 ' + CFG.chevronSpacerWidth + 'px';
            }
        }
        
        // Find and position close button at far right
        const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
            const onclick = btn.getAttribute('onclick');
            return onclick && onclick.includes("showScreen('home')");
        });
        if (closeButton) {
            closeButton.style.order = '999';
            closeButton.classList.remove('ml-auto');
            // Tablet: close always gets marginLeft:auto in both views so the
            // [speed][chev][diff][arr] cluster centers with gap on both sides.
            // Phone: marginLeft:auto only when expanded (collapsed mode has
            // speed wrapper at order:998 + ml:auto claiming the right space).
            closeButton.style.marginLeft = (IS_TABLET || _toolsExpanded) ? 'auto' : '0';
            //console.log('[mobile_ui] ✅ Close button positioned at order 999');
        }
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
            if (el.id === 'mobile-swipe-indicator') return;
            if (el.id === 'mobile-chevron-spacer') return;
            
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
                if (_toolsExpanded) {
                    el.classList.remove('mobile-hidden');
                } else {
                    el.classList.add('mobile-hidden');
                }
                if (wasFixed) {
                    //console.log('[mobile_ui] Fixing control:', el.textContent || el.id || 'unknown');
                    fixedCount++;
                }
            }
        });
        
        // Ensure close button is at far right (order: 999) with correct margin
        const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
            const onclick = btn.getAttribute('onclick');
            return onclick && onclick.includes("showScreen('home')");
        });
        if (closeButton && closeButton.style.order !== '999') {
            closeButton.style.order = '999';
            closeButton.classList.remove('ml-auto');
            closeButton.style.marginLeft = (IS_TABLET || _toolsExpanded) ? 'auto' : '0';
        }

        // if (fixedCount > 0) {
        //     console.log(`[mobile_ui] Fixed ${fixedCount} controls in reclassify pass`);
        // }
    }
    
    /**
     * Start observing #player-controls for new buttons added by plugins
     * @param {HTMLElement} controls - The player controls container
     */
    function startControlsObserver(controls) {
        // Disconnect any existing observer
        stopControlsObserver();
        
        _controlsObserver = new MutationObserver((mutations) => {
            // Batch updates with requestAnimationFrame
            if (_pendingObserverUpdate) return;
            _pendingObserverUpdate = true;
            
            requestAnimationFrame(() => {
                _pendingObserverUpdate = false;
                
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        // Check each added node
                        mutation.addedNodes.forEach(node => {
                            // Only process element nodes (not text nodes)
                            if (node.nodeType !== Node.ELEMENT_NODE) return;
                            
                            // Skip if it's our swipe indicator
                            if (node.id === 'mobile-swipe-indicator') return;
                            if (node.id === 'mobile-chevron-spacer') return;
                            
                            // Apply touch-friendly styling to buttons
                            if (node.tagName === 'BUTTON') {
                                node.classList.add('mobile-button');
                            }
                            
                            // If it's not essential, hide it
                            if (!isEssentialControl(node)) {
                                hideControl(node);
                            }
                        });
                    } else if (mutation.type === 'attributes') {
                        // Re-apply mobile classes when className is replaced by core
                        // (e.g., loop buttons have their classes wiped when activated)
                        const target = mutation.target;
                        
                        // Skip our injected helpers
                        if (target.id === 'mobile-swipe-indicator') return;
                        if (target.id === 'mobile-chevron-spacer') return;
                        
                        if (target.nodeType === Node.ELEMENT_NODE && !isEssentialControl(target)) {
                            // If mobile-hide-advanced class was wiped, re-add it
                            if (!target.classList.contains('mobile-hide-advanced')) {
                                target.classList.add('mobile-hide-advanced');
                            }
                            // Apply mobile-button class to buttons
                            if (target.tagName === 'BUTTON' && !target.classList.contains('mobile-button')) {
                                target.classList.add('mobile-button');
                            }
                            // Re-enforce collapsed state if needed
                            if (!_toolsExpanded && !target.classList.contains('mobile-hidden')) {
                                target.classList.add('mobile-hidden');
                            }
                        }
                    }
                }
            });
        });
        
        // Start observing
        _controlsObserver.observe(controls, {
            childList: true,      // Watch for children being added/removed
            subtree: true,        // Watch nested changes (children's attributes)
            attributes: true,     // Watch for attribute changes (className, style, etc.)
            attributeFilter: ['class', 'style']  // Only watch class and style changes
        });
        
        //console.log('[mobile_ui] Controls observer started');
    }
    
    /**
     * Stop observing #player-controls
     */
    function stopControlsObserver() {
        if (_controlsObserver) {
            _controlsObserver.disconnect();
            _controlsObserver = null;
            //console.log('[mobile_ui] Controls observer stopped');
        }
    }
    
    /**
     * Toggle advanced controls visibility
     */
    function toggleAdvancedControls(forceState) {
        if (typeof forceState === 'boolean') {
            _toolsExpanded = forceState;
        } else {
            _toolsExpanded = !_toolsExpanded;
        }
        
        // Update chevron indicator - position and flip based on mode
        if (_swipeIndicator) {
            if (_toolsExpanded) {
                // Expanded: down chevron (normal), positioned at top of first row
                _swipeIndicator.style.top = '12px';
                _swipeIndicator.style.transform = 'translateX(-50%) scaleY(1)';
            } else {
                // Collapsed: up chevron (flipped), centered vertically in single row
                _swipeIndicator.style.top = '50%';
                _swipeIndicator.style.transform = 'translate(-50%, -50%) scaleY(-1)';
            }
        }

        // Show/hide the inline chevron spacer. On TABLET it's always visible
        // (sits between speed and mastery in both views). On PHONE it's only
        // visible in expanded mode (creates the chevron gap in row 1).
        const chevSpacer = document.getElementById('mobile-chevron-spacer');
        if (chevSpacer) {
            chevSpacer.style.display = (IS_TABLET || _toolsExpanded) ? 'block' : 'none';
        }

        // Get controls element for subsequent operations
        const controls = document.getElementById('player-controls');

        // Toggle speed wrapper positioning: see enhancePlayerControls() for the
        // full phone/tablet rationale. On tablet, no order hack ever.
        const speedWrapper = document.getElementById('mobile-speed-wrapper');
        if (speedWrapper) {
            speedWrapper.style.order = (IS_TABLET || _toolsExpanded) ? '' : '998';
            // Tablet: speed sits adjacent to play controls (no auto margin).
            // Phone: marginLeft:auto pushes speed to the right of play group.
            speedWrapper.style.marginLeft = IS_TABLET ? '' : 'auto';
        }

        // Difficulty slider sits naturally next to spacer (no marginLeft).
        const masteryWrapper = document.getElementById('mobile-mastery-wrapper');
        if (masteryWrapper) {
            masteryWrapper.style.marginLeft = '';
        }

        // Tablet: spacer gets marginLeft:auto to create the gap and push
        // difficulty+arrangement to the right. Phone: no auto margin.
        if (chevSpacer) {
            chevSpacer.style.marginLeft = IS_TABLET ? 'auto' : '';
            // Ensure flex properties are maintained (in case something reset them)
            if (IS_TABLET) {
                chevSpacer.style.flex = '0 0 ' + CFG.chevronSpacerWidth + 'px';
            }
        }

        // Arrangement select sits in natural DOM position (after speed/mastery
        // wrappers) so it wraps to row 2 at the left edge in expanded mode.
        // No order manipulation needed.

        // Close button: push to right edge in expanded mode, neutral in collapsed
        // (where speed wrapper with order:998 + marginLeft:auto is far right).
        if (controls) {
            const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
                const onclick = btn.getAttribute('onclick');
                return onclick && onclick.includes("showScreen('home')");
            });
            if (closeButton) {
                closeButton.style.marginLeft = (IS_TABLET || _toolsExpanded) ? 'auto' : '0';
            }
        }
        
        // Re-scan ALL controls to catch any late-injected buttons
        if (controls) {
            Array.from(controls.children).forEach(el => {
                // Skip our injected helpers
                if (el.id === 'mobile-swipe-indicator') return;
                if (el.id === 'mobile-chevron-spacer') return;
                
                if (isEssentialControl(el)) {
                    // Essential controls - always visible, ensure no hide class
                    el.classList.remove('mobile-hide-advanced');
                } else {
                    // Non-essential - mark for hiding and set display based on expanded state
                    if (!el.classList.contains('mobile-hide-advanced')) {
                        el.classList.add('mobile-hide-advanced');
                        //console.log('[mobile_ui] Late classification:', el.textContent || el.id || 'unknown');
                    }
                    if (_toolsExpanded) {
                        el.classList.remove('mobile-hidden');
                    } else {
                        el.classList.add('mobile-hidden');
                    }
                }
            });
            
            // Ensure close button is at far right with correct margin
            const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
                const onclick = btn.getAttribute('onclick');
                return onclick && onclick.includes("showScreen('home')");
            });
            if (closeButton) {
                closeButton.style.order = '999';
                closeButton.classList.remove('ml-auto');
                closeButton.style.marginLeft = (IS_TABLET || _toolsExpanded) ? 'auto' : '0';
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Cleanup
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Schedule an enhancement with automatic cleanup tracking
     */
    function scheduleEnhancement(fn, delay) {
        const id = setTimeout(() => {
            _pendingTimeouts = _pendingTimeouts.filter(tid => tid !== id);
            fn();
        }, delay);
        _pendingTimeouts.push(id);
    }
    
    /**
     * Remove mobile UI enhancements
     */
    function cleanup() {
        //console.log('[mobile_ui] ❗ Cleanup called');
        
        // Cancel all pending timeouts
        _pendingTimeouts.forEach(clearTimeout);
        _pendingTimeouts = [];
        
        if (_pendingDoubleTapTimeout) {
            clearTimeout(_pendingDoubleTapTimeout);
            _pendingDoubleTapTimeout = null;
        }
        
        // Stop observing
        stopControlsObserver();
        
        // Remove swipe indicator
        if (_swipeIndicator && _swipeIndicator.parentElement) {
            _swipeIndicator.remove();
            _swipeIndicator = null;
        }
        
        // Get controls element
        const controls = document.getElementById('player-controls');

        // Remove our injected chevron spacer
        const chevSpacer = document.getElementById('mobile-chevron-spacer');
        if (chevSpacer) {
            chevSpacer.remove();
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
        
        _toolsExpanded = false;
        
        //console.log('[mobile_ui] Cleanup complete');
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Section Map Mobile Enhancement
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Make section map more touch-friendly on mobile
     */
    function enhanceSectionMap() {
        const sectionMap = document.getElementById('section-map');
        if (!sectionMap) {
            //console.log('[mobile_ui] No section map found');
            return;
        }
        
        //console.log('[mobile_ui] Enhancing section map for mobile');
        
        // Store original styles for cleanup
        if (!_sectionMapOriginalStyles) {
            _sectionMapOriginalStyles = {
                height: sectionMap.style.height || '20px'
            };
        }
        
        // Increase height for better touch targets (default 20px → CFG.sectionMapHeight)
        sectionMap.style.height = CFG.sectionMapHeight + 'px';
        
        // Hide section labels (too small to read on mobile - tooltip shows them on drag)
        const labels = sectionMap.querySelectorAll('.sm-block span');
        labels.forEach(label => {
            if (!label.hasAttribute('data-original-display')) {
                label.setAttribute('data-original-display', label.style.display || '');
            }
            label.style.display = 'none';
        });
        
        //console.log('[mobile_ui] Section map enhanced: 44px height, labels hidden');
    }
    
    /**
     * Restore section map to original state
     */
    function restoreSectionMap() {
        const sectionMap = document.getElementById('section-map');
        if (!sectionMap) return;
        
        //console.log('[mobile_ui] Restoring section map');
        
        // Restore height
        if (_sectionMapOriginalStyles) {
            sectionMap.style.height = _sectionMapOriginalStyles.height;
            _sectionMapOriginalStyles = null;
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
        if (!playerHud) {
            //console.log('[mobile_ui] No player HUD found');
            return;
        }
        
        //console.log('[mobile_ui] Adjusting player HUD position');
        
        // Store original styles for cleanup
        if (!_playerHudOriginalStyles) {
            _playerHudOriginalStyles = {
                top: playerHud.style.top || '0'
            };
        }
        
        // Push it below the section map (add some spacing)
        playerHud.style.top = CFG.playerHudTop + 'px';
        
        //console.log('[mobile_ui] Player HUD moved below section map');
    }
    
    /**
     * Restore player HUD to original position
     */
    function restorePlayerHud() {
        const playerHud = document.getElementById('player-hud');
        if (!playerHud) return;
        
        //console.log('[mobile_ui] Restoring player HUD');
        
        // Restore position
        if (_playerHudOriginalStyles) {
            playerHud.style.top = _playerHudOriginalStyles.top;
            _playerHudOriginalStyles = null;
        }
    }
    
    /**
     * Adjust 3D Highway overlay canvas (where "Up Next" text is drawn)
     */
    function adjustHighway3dOverlay() {
        // Skip if already adjusted to avoid infinite loop
        if (_highway3dAdjusted) return;
        
        // The 3D highway plugin creates a .h3d-wrap div that contains the overlay canvas.
        // The canvas position is managed by the 3D plugin, so we adjust the wrapper instead.
        const wrap = document.querySelector('.h3d-wrap');
        
        if (!wrap) return;
        
        //console.log('[mobile_ui] Adjusting 3D highway wrapper (.h3d-wrap)...');
        //console.log('[mobile_ui] Wrapper BEFORE - top:', wrap.style.top || 'not set');
        
        // Store original styles for cleanup (only once)
        if (!_highway3dOverlayOriginalStyles) {
            _highway3dOverlayOriginalStyles = {
                top: wrap.style.top || ''
            };
        }
        
        // Push the entire wrapper down to clear section map + player HUD
        // This moves the whole 3D highway overlay (lyrics, "Up Next" text, chord diagrams)
        // Need enough space for: section map + player HUD text + small gap
        wrap.style.setProperty('top', CFG.highway3dTop + 'px', 'important');
        
        //console.log('[mobile_ui] Wrapper AFTER - top:', wrap.style.top);
        
        // Mark as adjusted and stop all observation/retrying
        _highway3dAdjusted = true;
        
        // Stop retry interval
        if (_highway3dRetryInterval) {
            clearInterval(_highway3dRetryInterval);
            _highway3dRetryInterval = null;
        }
        
        // Stop mutation observer
        if (_highway3dObserver) {
            _highway3dObserver.disconnect();
            _highway3dObserver = null;
        }
        
        //console.log('[mobile_ui] ✓ 3D highway wrapper adjusted successfully');
    }
    
    /**
     * Start observing for 3D highway overlay creation/changes
     */
    function startHighway3dObserver() {
        //console.log('[mobile_ui] Starting 3D highway observer...');
        
        // Stop any existing observer
        stopHighway3dObserver();
        
        // Reset the adjusted flag
        _highway3dAdjusted = false;
        
        // Try to adjust immediately
        adjustHighway3dOverlay();
        
        // Set up periodic retry every 500ms until it succeeds
        _highway3dRetryInterval = setInterval(() => {
            adjustHighway3dOverlay();
        }, 500);
        
        // Watch for the .h3d-wrap to appear
        const player = document.getElementById('player');
        if (!player) {
            //console.log('[mobile_ui] ✗ No #player found');
            return;
        }
        
        _highway3dObserver = new MutationObserver(() => {
            adjustHighway3dOverlay();
        });
        
        // Watch the player for new children (the .h3d-wrap gets added here)
        // Don't watch style attributes - that causes infinite loop
        _highway3dObserver.observe(player, {
            childList: true,
            subtree: true
        });
        
        //console.log('[mobile_ui] ✓ Observer started (will retry every 500ms until 3D highway found)');
    }
    
    /**
     * Stop observing 3D highway overlay
     */
    function stopHighway3dObserver() {
        if (_highway3dRetryInterval) {
            clearInterval(_highway3dRetryInterval);
            _highway3dRetryInterval = null;
        }
        
        if (_highway3dObserver) {
            _highway3dObserver.disconnect();
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
        
        //console.log('[mobile_ui] Restoring 3D highway wrapper');
        
        // Restore wrapper position
        if (_highway3dOverlayOriginalStyles) {
            wrap.style.top = _highway3dOverlayOriginalStyles.top;
            wrap.style.removeProperty('top');
            _highway3dOverlayOriginalStyles = null;
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
        //console.log('[mobile_ui] enableHighwayGestures called');
        //console.log('[mobile_ui] highway element:', highway);
        
        if (!highway) {
            //console.warn('[mobile_ui] ✗ No highway canvas found for gestures');
            return;
        }
        
        //console.log('[mobile_ui] ✓ Enabling highway gestures (swipe left/right, single tap)');
        //console.log('[mobile_ui] Highway dimensions:', highway.offsetWidth, 'x', highway.offsetHeight);
        
        highway.addEventListener('touchstart', onGestureStart, { passive: true });
        highway.addEventListener('touchend', onGestureEnd, { passive: false });
        
        //console.log('[mobile_ui] ✓ Touch event listeners attached');
    }
    
    /**
     * Disable highway gestures
     */
    function disableHighwayGestures() {
        const highway = document.getElementById('highway');
        if (!highway) return;
        
        //console.log('[mobile_ui] Disabling highway gestures');
        
        highway.removeEventListener('touchstart', onGestureStart);
        highway.removeEventListener('touchend', onGestureEnd);
    }
    
    /**
     * Handle touch start for gesture detection
     */
    function onGestureStart(e) {
        //console.log('[mobile_ui] touchstart event fired');
        //console.log('[mobile_ui] touches:', e.touches ? e.touches.length : 'none');
        
        if (!e.touches || e.touches.length !== 1) {
            //console.log('[mobile_ui] Ignoring - not single touch');
            return;
        }
        
        const touch = e.touches[0];
        _gestureStartX = touch.clientX;
        _gestureStartY = touch.clientY;
        _gestureStartTime = Date.now();
        _gestureActive = true;
        
        //console.log('[mobile_ui] Gesture started at:', _gestureStartX, ',', _gestureStartY);
    }
    
    /**
     * Handle touch end for gesture detection
     */
    function onGestureEnd(e) {
        //console.log('[mobile_ui] touchend event fired');
        //console.log('[mobile_ui] _gestureActive:', _gestureActive);
        
        if (!_gestureActive) {
            //console.log('[mobile_ui] No active gesture');
            return;
        }
        
        if (!e.changedTouches || e.changedTouches.length !== 1) {
            //console.log('[mobile_ui] Ignoring - not single touch end');
            return;
        }
        
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - _gestureStartX;
        const deltaY = touch.clientY - _gestureStartY;
        const deltaTime = Date.now() - _gestureStartTime;
        
        //console.log('[mobile_ui] Touch ended - deltaX:', deltaX, 'deltaY:', deltaY, 'deltaTime:', deltaTime);
        
        _gestureActive = false;
        
        // Check for tap (quick touch with minimal movement)
        const isQuickTap = deltaTime < CFG.tapMaxDurationMs && Math.abs(deltaX) < CFG.tapMaxMovementPx && Math.abs(deltaY) < CFG.tapMaxMovementPx;
        
        if (isQuickTap) {
            e.preventDefault();
            const now = Date.now();
            const timeSinceLastTap = now - _lastTapTime;
            
            if (timeSinceLastTap < CFG.doubleTapWindowMs && timeSinceLastTap > 0) {
                // Second tap detected: cancel timeout, reverse first tap, execute double-tap
                if (_pendingDoubleTapTimeout) {
                    clearTimeout(_pendingDoubleTapTimeout);
                    _pendingDoubleTapTimeout = null;
                }
                _lastTapTime = 0;
                
                // Clear any existing feedback from the first tap
                const existing = document.getElementById('gesture-feedback');
                if (existing) existing.remove();
                
                // Reverse the single tap (toggle play/pause back) - silently, no feedback
                handleSingleTap(true);
                // Then execute the double-tap action
                handleDoubleTap();
            } else {
                // First tap: execute immediately
                _lastTapTime = now;
                handleSingleTap();
                
                // Start double-tap window timer
                _pendingDoubleTapTimeout = setTimeout(() => {
                    _lastTapTime = 0;
                    _pendingDoubleTapTimeout = null;
                }, CFG.doubleTapWindowMs);
            }
            return;
        }
        
        // Check for swipe (horizontal > threshold, quick, mostly horizontal)
        const isSwipe = Math.abs(deltaX) > CFG.swipeHorizontalThreshold && deltaTime < CFG.swipeMaxDurationMs && Math.abs(deltaX) > Math.abs(deltaY) * 1.5;
        //console.log('[mobile_ui] isSwipe:', isSwipe, '(|deltaX| > 50 && deltaTime < 500 && horizontal)');
        
        if (isSwipe) {
            //console.log('[mobile_ui] ✓ SWIPE DETECTED:', deltaX > 0 ? 'right' : 'left');
            e.preventDefault();
            handleSwipe(deltaX > 0 ? 'right' : 'left');
            return;
        }
        
        //console.log('[mobile_ui] No gesture recognized');
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
            if (!silent) showGestureFeedback('Play');
        } else {
            audio.pause();
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
            _loopMarkerState = 'b-set';
        } else if (loop.loopA !== null) {
            _loopMarkerState = 'a-set';
        } else {
            _loopMarkerState = 'ready';
        }
    }
    
    /**
     * Handle double tap gesture (Set A/B loop markers)
     * Cycles through: set A → set B → clear
     */
    function handleDoubleTap() {
        // Sync state before acting (in case loop was set externally)
        syncLoopMarkerState();
        
        if (_loopMarkerState === 'ready') {
            // Set loop start (A)
            if (typeof window.setLoopStart === 'function') {
                window.setLoopStart();
                _loopMarkerState = 'a-set';
                triggerHaptic(10);  // Short buzz for A
                showGestureFeedback('Loop Start (A)');
            }
        } else if (_loopMarkerState === 'a-set') {
            // Set loop end (B)
            if (typeof window.setLoopEnd === 'function') {
                window.setLoopEnd();
                _loopMarkerState = 'b-set';
                triggerHaptic(20);  // Medium buzz for B
                showGestureFeedback('Loop End (B)');
            }
        } else {
            // Clear loop and reset
            if (typeof window.clearLoop === 'function') {
                window.clearLoop();
                _loopMarkerState = 'ready';
                triggerHaptic(30);  // Longer buzz for clear
                showGestureFeedback('Loop Cleared');
            }
        }
    }
    
    /**
     * Handle swipe gesture (Seek ±5 seconds)
     */
    function handleSwipe(direction) {
        //console.log('[mobile_ui] handleSwipe called, direction:', direction);
        
        const audio = document.getElementById('audio');
        if (!audio) {
            //console.warn('[mobile_ui] No audio element found');
            return;
        }
        
        const seekAmount = direction === 'right' ? 5 : -5;
        const currentTime = audio.currentTime;
        const newTime = Math.max(0, Math.min(audio.duration || 0, currentTime + seekAmount));
        
        //console.log('[mobile_ui] Seeking from', Math.floor(currentTime), 's to', Math.floor(newTime), 's');
        
        // Update lastAudioTime to prevent the jump detector from resetting
        if (typeof lastAudioTime !== 'undefined') lastAudioTime = newTime;
        
        audio.currentTime = newTime;
        
        showGestureFeedback(direction === 'right' ? '+5s' : '-5s');
        
        //console.log('[mobile_ui] ✓ Seeked to', Math.floor(newTime), 's');
    }
    
    /**
     * Show visual feedback for gesture actions
     */
    function showGestureFeedback(text) {
        //console.log('[mobile_ui] showGestureFeedback:', text);
        
        // Remove any existing feedback
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
        if (!controls) {
            //console.log('[mobile_ui] No player-controls found for gestures');
            return;
        }
        
        //console.log('[mobile_ui] ✓ Enabling controls gestures (swipe up/down)');
        
        controls.addEventListener('touchstart', onControlsGestureStart, { passive: true });
        controls.addEventListener('touchmove', onControlsGestureMove, { passive: false });
        controls.addEventListener('touchend', onControlsGestureEnd, { passive: false });
        
        //console.log('[mobile_ui] ✓ Controls gesture listeners attached');
    }
    
    /**
     * Disable controls gestures
     */
    function disableControlsGestures() {
        const controls = document.getElementById('player-controls');
        if (!controls) return;
        
        //console.log('[mobile_ui] Disabling controls gestures');
        
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
        _controlsGestureStartX = touch.clientX;
        _controlsGestureStartY = touch.clientY;
        _controlsGestureStartTime = Date.now();
        _controlsGestureActive = true;
    }
    
    /**
     * Handle touch move on controls - prevent pull-to-refresh when swiping vertically
     */
    function onControlsGestureMove(e) {
        if (!_controlsGestureActive) return;
        if (!e.touches || e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        const deltaY = _controlsGestureStartY - touch.clientY;
        const deltaX = touch.clientX - _controlsGestureStartX;
        
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
        if (!_controlsGestureActive) return;
        if (!e.changedTouches || e.changedTouches.length !== 1) return;
        
        const touch = e.changedTouches[0];
        const deltaY = _controlsGestureStartY - touch.clientY;  // Negative = down, positive = up
        const deltaTime = Date.now() - _controlsGestureStartTime;
        
        _controlsGestureActive = false;
        
        // Detect vertical swipe (threshold + max duration, mostly vertical)
        const isSwipe = Math.abs(deltaY) > CFG.swipeVerticalThreshold && deltaTime < CFG.swipeMaxDurationMs;
        
        if (!isSwipe) return;
        
        //console.log('[mobile_ui] Controls swipe detected: deltaY =', deltaY);
        
        // Swipe up (positive deltaY) = expand, swipe down (negative deltaY) = collapse
        if (deltaY > 0 && !_toolsExpanded) {
            // Swipe up to expand
            toggleAdvancedControls();
        } else if (deltaY < 0 && _toolsExpanded) {
            // Swipe down to collapse
            toggleAdvancedControls();
        }
        
        // Prevent any click events from firing
        e.preventDefault();
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Lifecycle
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Initialize mobile UI plugin
     */
    function init() {
        // Only activate on phone / tablet; not on desktop
        if (!isMobile()) {
            // console.log('[mobile_ui] Desktop detected - not activating');
            return;
        }
        
        console.log('[mobile_ui] Activating on device:', DEVICE);
        
        // Inject CSS classes
        injectMobileStyles();
        
        // Setup resize listener
        setupResizeListener();
        
        // Listen for screen changes
        window.slopsmith.on('screen:changed', (e) => {
            const screenId = e.detail.id || e.detail.screen;
            //console.log('[mobile_ui] 🔄 Screen changed to:', screenId);
            
            if (screenId === 'player') {
                //console.log('[mobile_ui] Player screen detected - enhancing controls');
                // Give the player screen time to render (100ms)
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
                // Sync loop state
                scheduleEnhancement(syncLoopMarkerState, 100);
            } else {
                // Clean up when leaving player
                //console.log('[mobile_ui] 🚪 Leaving player screen (now on:', screenId, ')');
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
                _pendingTimeouts.forEach(clearTimeout);
                _pendingTimeouts = [];
                
                await origPlaySong(filename, arrangement);
                //console.log('[mobile_ui] playSong completed - re-enhancing');
                
                // Sync loop marker state from actual loop values
                syncLoopMarkerState();
                
                // Section map gets created after playSong, give it time (300ms for section_map plugin to render)
                scheduleEnhancement(enhanceSectionMap, 300);
                // Adjust HUD position (same timing as section map)
                scheduleEnhancement(adjustPlayerHud, 300);
                // Re-enable gestures (400ms - highway canvas recreates after WebSocket ready)
                scheduleEnhancement(enableHighwayGestures, 400);
                // Re-enable controls gestures (150ms - controls already exist)
                scheduleEnhancement(enableControlsGestures, 150);
                // Re-observe 3D highway overlay (600ms - it recreates on song change, needs time)
                scheduleEnhancement(startHighway3dObserver, 600);
            };
        }
        
        // Hook into loop functions to sync marker state when user clicks UI buttons
        const origSetLoopStart = window.setLoopStart;
        if (typeof origSetLoopStart === 'function') {
            window.setLoopStart = function() {
                origSetLoopStart();
                _loopMarkerState = 'a-set';
            };
        }
        
        const origSetLoopEnd = window.setLoopEnd;
        if (typeof origSetLoopEnd === 'function') {
            window.setLoopEnd = function() {
                origSetLoopEnd();
                _loopMarkerState = 'b-set';
            };
        }
        
        const origClearLoop = window.clearLoop;
        if (typeof origClearLoop === 'function') {
            window.clearLoop = function() {
                origClearLoop();
                _loopMarkerState = 'ready';
            };
        }
        
        // If we're already on the player screen, enhance it now
        const currentScreen = window.slopsmith.getCurrentScreen?.();
       // console.log('[mobile_ui] 🎬 Init check - current screen:', currentScreen);
        if (currentScreen === 'player') {
            //console.log('[mobile_ui] Already on player screen - enhancing');
            scheduleEnhancement(enhancePlayerControls, 100);
            scheduleEnhancement(enhanceSectionMap, 200);
            scheduleEnhancement(adjustPlayerHud, 200);
            scheduleEnhancement(enableHighwayGestures, 300);
            scheduleEnhancement(enableControlsGestures, 150);
            scheduleEnhancement(startHighway3dObserver, 500);
            // Sync loop state on init
            scheduleEnhancement(syncLoopMarkerState, 100);
        } else {
            console.log('[mobile_ui] Not on player screen, waiting for screen:changed event');
        }
    }
    
    // Boot when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
