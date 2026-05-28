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
    // Back Button Transformation
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Transform the core "× Close" button into a left-positioned icon-only
     * Back button. Idempotent - safe to call multiple times.
     * @param {HTMLButtonElement} btn - The close button to transform
     */
    function transformCloseButton(btn) {
        if (!btn) {
            console.log('[mobile_note_highway] transformCloseButton: no btn passed');
            return;
        }
        // Already transformed?
        if (btn.id === 'mobile-back-btn') {
            console.log('[mobile_note_highway] transformCloseButton: already transformed, innerHTML length =', btn.innerHTML.length);
            return;
        }
        
        console.log('[mobile_note_highway] transformCloseButton: TRANSFORMING. Original innerHTML:', btn.innerHTML.substring(0, 100));
        
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
        
        console.log('[mobile_note_highway] transformCloseButton: DONE. New innerHTML:', btn.innerHTML.substring(0, 200));
        console.log('[mobile_note_highway] transformCloseButton: button classes =', btn.className);
        console.log('[mobile_note_highway] transformCloseButton: button computed display =', window.getComputedStyle(btn).display);
        
        // Check after a microtask to see if something wipes it
        setTimeout(() => {
            const checkBtn = document.getElementById('mobile-back-btn');
            if (checkBtn) {
                const chev = checkBtn.querySelector('.mobile-back-chevron');
                console.log('[mobile_note_highway] After 100ms - chevron present:', !!chev, 'dimensions:', chev ? `${chev.offsetWidth}x${chev.offsetHeight}` : 'N/A');
            }
        }, 100);
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
            console.warn('[mobile_note_highway] No #player-controls found');
            return;
        }
        
        //console.log('[mobile_note_highway] Enhancing player controls');
        
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
            avWrapper.id = 'mobile-av-wrapper';  // Unique ID for later targeting
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
                el.style.order = '100';
            }
            
            if (!isEssentialControl(el)) {
                hideControl(el);
                hiddenCount++;
            }
        });
        
        //console.log(`[mobile_note_highway] Hiding ${hiddenCount} advanced controls`);
        
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
        if (!_swipeIndicator) {
            _swipeIndicator = document.createElement('div');
            _swipeIndicator.id = 'mobile-swipe-indicator';
            _swipeIndicator.style.cssText = `
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
            
            _swipeIndicator.appendChild(chevronInner);
            controls.appendChild(_swipeIndicator);
            console.log('[mobile_note_highway] ✅ Minimalist chevron indicator created');
        }
        
        // Inject a phantom end-spacer that reserves 56px on the LAST flex row
        // for the floating "?" help button. Using order:9999 + flex-shrink:0
        // ensures it always lands as the last item on whatever row is last.
        if (!document.getElementById('mobile-end-spacer')) {
            const spacer = document.createElement('div');
            spacer.id = 'mobile-end-spacer';
            spacer.setAttribute('aria-hidden', 'true');
            controls.appendChild(spacer);
        }

        // Reorder the first row for expanded view: move the speed and mastery
        // wrappers before the arrangement dropdown, so the top row reads:
        //   [seek<<][play][seek>>] [Arrangement] [Speed] [Difficulty]
        // Use explicit CSS order values for clear positioning.
        const arrSelect = document.getElementById('arr-select');
        const _speedWrapperEl = document.getElementById('mobile-speed-wrapper');
        const _masteryWrapperEl = document.getElementById('mobile-mastery-wrapper');
        
        console.log('[mobile_note_highway] Setting control order - IS_TABLET:', IS_TABLET, '_toolsExpanded:', _toolsExpanded);
        
        // Priority order (simple consecutive values):
        // -1: Back button (set later)
        //  0: Player controls (natural)
        //  1: Arrangement
        //  2: Difficulty
        //  3: Speed
        // 100+: Everything else
        
        if (arrSelect) {
            arrSelect.style.order = '1';
            arrSelect.style.marginLeft = '12px';
            arrSelect.style.width = CFG.selectWidth + 'px';
            // Force wrap to row 2 on phone expanded by eating remaining space
            arrSelect.style.marginRight = (!IS_TABLET && _toolsExpanded) ? 'auto' : '0';
            console.log('[mobile_note_highway] arr-select order=1, marginRight:', arrSelect.style.marginRight);
        }
        
        if (_masteryWrapperEl) {
            _masteryWrapperEl.style.order = '2';
            _masteryWrapperEl.style.marginLeft = '0';
            console.log('[mobile_note_highway] mastery-wrapper order=2');
        }
        
        if (_speedWrapperEl) {
            _speedWrapperEl.style.order = '3';
            _speedWrapperEl.style.marginLeft = '0';
            _speedWrapperEl.style.marginRight = '0';
            console.log('[mobile_note_highway] speed-wrapper order=3');
        }
        
        // A/V offset wrapper gets order 100 (non-essential, appears after priority controls)
        const _avWrapperEl = document.getElementById('mobile-av-wrapper');
        if (_avWrapperEl) {
            _avWrapperEl.style.order = '100';
            console.log('[mobile_note_highway] av-wrapper order=100');
        }

        // Ensure controls container has position: relative for absolute positioning
        controls.style.position = 'relative';
        
        // Find close button and transform into a left-positioned Back icon button
        const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
            const onclick = btn.getAttribute('onclick');
            return onclick && onclick.includes("showScreen('home')");
        });
        if (closeButton) {
            transformCloseButton(closeButton);
            closeButton.style.order = '-1';
            closeButton.classList.remove('ml-auto');
            closeButton.style.marginLeft = '0';
            closeButton.style.marginRight = '12px';
        }
    }
    
    /**
     * Reapply control order values without recreating wrappers.
     * Used on song re-entry to fix misalignment.
     */
    function reapplyControlOrder() {
        const arrSelect = document.getElementById('arr-select');
        const masteryWrapper = document.getElementById('mobile-mastery-wrapper');
        const speedWrapper = document.getElementById('mobile-speed-wrapper');
        
        if (arrSelect) {
            arrSelect.style.order = '1';
            arrSelect.style.marginLeft = '12px';
            arrSelect.style.width = CFG.selectWidth + 'px';
            arrSelect.style.marginRight = (!IS_TABLET && _toolsExpanded) ? 'auto' : '0';
        }
        
        if (masteryWrapper) {
            masteryWrapper.style.order = '2';
            masteryWrapper.style.marginLeft = '0';
        }
        
        if (speedWrapper) {
            speedWrapper.style.order = '3';
            speedWrapper.style.marginLeft = '0';
            speedWrapper.style.marginRight = '0';
        }
        
        // A/V offset wrapper gets order 100 (non-essential)
        const avWrapper = document.getElementById('mobile-av-wrapper');
        if (avWrapper) {
            avWrapper.style.order = '100';
        }
        
        // Re-set wrapper display (can get cleared on song change)
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
        
        console.log('[mobile_note_highway] reclassifyAllControls - IS_TABLET:', IS_TABLET, '_toolsExpanded:', _toolsExpanded);
        
        // Show what's essential for debugging
        const essentialIds = ['btn-play', 'arr-select'];
        if (IS_TABLET) {
            essentialIds.push('mastery-slider', 'mastery-slider-label', 'mastery-label', 'speed-slider', 'speed-label');
        }
        console.log('[mobile_note_highway] Essential controls (visible in collapsed):', essentialIds);
        
        let fixedCount = 0;
        Array.from(controls.children).forEach(el => {
            // Skip our injected helpers
            if (el.id === 'mobile-swipe-indicator') return;
            if (el.id === 'mobile-end-spacer') return;
            
            // Set order for non-priority controls (back/play/arr/seekBy are priority, mobile-* excluded)
            const isPriority = el.id === 'arr-select' || 
                              el.id === 'mobile-back-btn' ||
                              el.id === 'btn-play' ||
                              (el.tagName === 'BUTTON' && el.getAttribute('onclick')?.includes('seekBy('));
            
            if (!isPriority && !el.id?.startsWith('mobile-') && !el.style.order) {
                el.style.order = '100';
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
                if (_toolsExpanded) {
                    el.classList.remove('mobile-hidden');
                } else {
                    el.classList.add('mobile-hidden');
                }
                if (wasFixed) {
                    //console.log('[mobile_note_highway] Fixing control:', el.textContent || el.id || 'unknown');
                    fixedCount++;
                }
            }
        });
        
        // Ensure close button is transformed into a Back icon at far left (order: -1)
        const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
            const onclick = btn.getAttribute('onclick');
            return onclick && onclick.includes("showScreen('home')");
        });
        if (closeButton && closeButton.style.order !== '-1') {
            transformCloseButton(closeButton);
            closeButton.style.order = '-1';
            closeButton.classList.remove('ml-auto');
            closeButton.style.marginLeft = '0';
            closeButton.style.marginRight = '12px';
        }

        if (fixedCount > 0) {
            console.log(`[mobile_note_highway] Fixed ${fixedCount} controls in reclassify pass`);
        }
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
                            if (node.id === 'mobile-end-spacer') return;
                            
                            // Skip elements inside wrappers - wrappers manage their children
                            const parentId = node.parentElement?.id;
                            if (parentId === 'mobile-mastery-wrapper' || 
                                parentId === 'mobile-speed-wrapper' || 
                                parentId === 'mobile-av-wrapper') {
                                return;
                            }
                            
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
                        if (target.id === 'mobile-end-spacer') return;
                        
                        // Skip elements inside wrappers - wrappers manage their children
                        const parentId = target.parentElement?.id;
                        if (parentId === 'mobile-mastery-wrapper' || 
                            parentId === 'mobile-speed-wrapper' || 
                            parentId === 'mobile-av-wrapper') {
                            return;
                        }
                        
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
        
        //console.log('[mobile_note_highway] Controls observer started');
    }
    
    /**
     * Stop observing #player-controls
     */
    function stopControlsObserver() {
        if (_controlsObserver) {
            _controlsObserver.disconnect();
            _controlsObserver = null;
            //console.log('[mobile_note_highway] Controls observer stopped');
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
        
        // Update chevron indicator - flip and reposition based on mode
        if (_swipeIndicator) {
            if (_toolsExpanded) {
                // Expanded: down chevron (normal), position higher (2 rows of controls)
                // Tablet needs more clearance due to larger layout
                _swipeIndicator.style.top = IS_TABLET ? '-42px' : '-28px';
                _swipeIndicator.style.transform = 'translateX(-50%) scaleY(1)';
            } else {
                // Collapsed: up chevron (flipped), position closer (1 row of controls)
                _swipeIndicator.style.top = '-18px';
                _swipeIndicator.style.transform = 'translateX(-50%) scaleY(-1)';
            }
        }

        // Get controls element for subsequent operations
        const controls = document.getElementById('player-controls');

        console.log('[mobile_note_highway] toggleAdvancedControls - IS_TABLET:', IS_TABLET, '_toolsExpanded:', _toolsExpanded);

        // Re-apply explicit order values (priority order: back=-1, player=0, arr=1, diff=2, speed=3)
        const arrSelect = document.getElementById('arr-select');
        if (arrSelect) {
            arrSelect.style.order = '1';
            arrSelect.style.marginLeft = '12px';
            arrSelect.style.width = CFG.selectWidth + 'px';
            // Force wrap to row 2 on phone expanded
            arrSelect.style.marginRight = (!IS_TABLET && _toolsExpanded) ? 'auto' : '0';
            console.log('[mobile_note_highway] [toggle] arr-select order=1, marginRight:', arrSelect.style.marginRight);
        }

        const masteryWrapper = document.getElementById('mobile-mastery-wrapper');
        if (masteryWrapper) {
            masteryWrapper.style.order = '2';
            masteryWrapper.style.marginLeft = '0';
            console.log('[mobile_note_highway] [toggle] mastery-wrapper order=2');
        }

        const speedWrapper = document.getElementById('mobile-speed-wrapper');
        if (speedWrapper) {
            speedWrapper.style.order = '3';
            speedWrapper.style.marginLeft = '0';
            speedWrapper.style.marginRight = '0';
            console.log('[mobile_note_highway] [toggle] speed-wrapper order=3');
        }
        
        // A/V offset wrapper gets order 100 (non-essential)
        const avWrapper = document.getElementById('mobile-av-wrapper');
        if (avWrapper) {
            avWrapper.style.order = '100';
            console.log('[mobile_note_highway] [toggle] av-wrapper order=100');
        }

        // Close button: keep transformed into a Back icon at far left
        if (controls) {
            const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
                const onclick = btn.getAttribute('onclick');
                return onclick && onclick.includes("showScreen('home')");
            });
            if (closeButton) {
                transformCloseButton(closeButton);
                closeButton.style.order = '-1';
                closeButton.style.marginLeft = '0';
                closeButton.style.marginRight = '12px';
            }
        }
        
        // Re-scan ALL controls to catch any late-injected buttons
        if (controls) {
            console.log('[mobile_note_highway] [toggle] Re-scanning controls, _toolsExpanded=', _toolsExpanded);
            Array.from(controls.children).forEach(el => {
                // Skip our injected helpers
                if (el.id === 'mobile-swipe-indicator') return;
                if (el.id === 'mobile-end-spacer') return;
                
                // Set order for non-priority controls (back/play/arr/seekBy are priority, mobile-* excluded)
                const isPriority = el.id === 'arr-select' || 
                                  el.id === 'mobile-back-btn' ||
                                  el.id === 'btn-play' ||
                                  (el.tagName === 'BUTTON' && el.getAttribute('onclick')?.includes('seekBy('));
                
                if (!isPriority && !el.id?.startsWith('mobile-') && !el.style.order) {
                    el.style.order = '100';
                }
                
                const isEssential = isEssentialControl(el);
                if (el.id === 'mobile-mastery-wrapper' || el.id === 'mobile-speed-wrapper') {
                    console.log('[mobile_note_highway] [toggle] Processing', el.id, '- isEssential:', isEssential, '_toolsExpanded:', _toolsExpanded);
                }
                
                if (isEssential) {
                    // Essential controls - always visible, ensure no hide class
                    el.classList.remove('mobile-hide-advanced');
                } else {
                    // Non-essential - mark for hiding and set display based on expanded state
                    if (!el.classList.contains('mobile-hide-advanced')) {
                        el.classList.add('mobile-hide-advanced');
                        //console.log('[mobile_note_highway] Late classification:', el.textContent || el.id || 'unknown');
                    }
                    if (_toolsExpanded) {
                        el.classList.remove('mobile-hidden');
                        if (el.id === 'mobile-mastery-wrapper' || el.id === 'mobile-speed-wrapper') {
                            console.log('[mobile_note_highway] [toggle] Removed mobile-hidden from', el.id, '- classList now:', el.classList.toString());
                            console.log('[mobile_note_highway] [toggle]  inline style.display:', el.style.display);
                            console.log('[mobile_note_highway] [toggle]  computed display:', window.getComputedStyle(el).display);
                        }
                    } else {
                        el.classList.add('mobile-hidden');
                    }
                }
            });
            
            // Log final state AFTER re-scan
            console.log('[mobile_note_highway] [toggle] Final state after re-scan:');
            const finalMastery = document.getElementById('mobile-mastery-wrapper');
            const finalSpeed = document.getElementById('mobile-speed-wrapper');
            if (finalMastery) {
                console.log('  mastery-wrapper: classList=', finalMastery.classList.toString(), 'inline display=', finalMastery.style.display, 'computed=', window.getComputedStyle(finalMastery).display);
            }
            if (finalSpeed) {
                console.log('  speed-wrapper: classList=', finalSpeed.classList.toString(), 'inline display=', finalSpeed.style.display, 'computed=', window.getComputedStyle(finalSpeed).display);
            }
            
            // Ensure close button stays transformed as Back icon at far left
            const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
                const onclick = btn.getAttribute('onclick');
                return onclick && onclick.includes("showScreen('home')");
            });
            if (closeButton) {
                transformCloseButton(closeButton);
                closeButton.style.order = '-1';
                closeButton.classList.remove('ml-auto');
                closeButton.style.marginLeft = '0';
                closeButton.style.marginRight = '12px';
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
     * Remove Mobile Note Highway enhancements
     */
    function cleanup() {
        //console.log('[mobile_note_highway] ❗ Cleanup called');
        
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
        
        // Remove phantom end-spacer
        const endSpacer = document.getElementById('mobile-end-spacer');
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
        
        _toolsExpanded = false;
        
        //console.log('[mobile_note_highway] Cleanup complete');
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
            //console.log('[mobile_note_highway] No section map found');
            return;
        }
        
        //console.log('[mobile_note_highway] Enhancing section map for mobile');
        
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
        
        //console.log('[mobile_note_highway] Section map enhanced: 44px height, labels hidden');
    }
    
    /**
     * Restore section map to original state
     */
    function restoreSectionMap() {
        const sectionMap = document.getElementById('section-map');
        if (!sectionMap) return;
        
        //console.log('[mobile_note_highway] Restoring section map');
        
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
            //console.log('[mobile_note_highway] No player HUD found');
            return;
        }
        
        //console.log('[mobile_note_highway] Adjusting player HUD position');
        
        // Store original styles for cleanup
        if (!_playerHudOriginalStyles) {
            _playerHudOriginalStyles = {
                top: playerHud.style.top || '0'
            };
        }
        
        // Push it below the section map (add some spacing)
        playerHud.style.top = CFG.playerHudTop + 'px';
        
        //console.log('[mobile_note_highway] Player HUD moved below section map');
    }
    
    /**
     * Restore player HUD to original position
     */
    function restorePlayerHud() {
        const playerHud = document.getElementById('player-hud');
        if (!playerHud) return;
        
        //console.log('[mobile_note_highway] Restoring player HUD');
        
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
        
        //console.log('[mobile_note_highway] Adjusting 3D highway wrapper (.h3d-wrap)...');
        //console.log('[mobile_note_highway] Wrapper BEFORE - top:', wrap.style.top || 'not set');
        
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
        
        //console.log('[mobile_note_highway] Wrapper AFTER - top:', wrap.style.top);
        
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
        
        //console.log('[mobile_note_highway] ✓ 3D highway wrapper adjusted successfully');
    }
    
    /**
     * Start observing for 3D highway overlay creation/changes
     */
    function startHighway3dObserver() {
        //console.log('[mobile_note_highway] Starting 3D highway observer...');
        
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
            //console.log('[mobile_note_highway] ✗ No #player found');
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
        
        //console.log('[mobile_note_highway] ✓ Observer started (will retry every 500ms until 3D highway found)');
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
        
        //console.log('[mobile_note_highway] Restoring 3D highway wrapper');
        
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
        //console.log('[mobile_note_highway] enableHighwayGestures called');
        //console.log('[mobile_note_highway] highway element:', highway);
        
        if (!highway) {
            //console.warn('[mobile_note_highway] ✗ No highway canvas found for gestures');
            return;
        }
        
        //console.log('[mobile_note_highway] ✓ Enabling highway gestures (swipe left/right, single tap)');
        //console.log('[mobile_note_highway] Highway dimensions:', highway.offsetWidth, 'x', highway.offsetHeight);
        
        highway.addEventListener('touchstart', onGestureStart, { passive: true });
        highway.addEventListener('touchend', onGestureEnd, { passive: false });
        
        //console.log('[mobile_note_highway] ✓ Touch event listeners attached');
    }
    
    /**
     * Disable highway gestures
     */
    function disableHighwayGestures() {
        const highway = document.getElementById('highway');
        if (!highway) return;
        
        //console.log('[mobile_note_highway] Disabling highway gestures');
        
        highway.removeEventListener('touchstart', onGestureStart);
        highway.removeEventListener('touchend', onGestureEnd);
    }
    
    /**
     * Handle touch start for gesture detection
     */
    function onGestureStart(e) {
        //console.log('[mobile_note_highway] touchstart event fired');
        //console.log('[mobile_note_highway] touches:', e.touches ? e.touches.length : 'none');
        
        if (!e.touches || e.touches.length !== 1) {
            //console.log('[mobile_note_highway] Ignoring - not single touch');
            return;
        }
        
        const touch = e.touches[0];
        _gestureStartX = touch.clientX;
        _gestureStartY = touch.clientY;
        _gestureStartTime = Date.now();
        _gestureActive = true;
        
        //console.log('[mobile_note_highway] Gesture started at:', _gestureStartX, ',', _gestureStartY);
    }
    
    /**
     * Handle touch end for gesture detection
     */
    function onGestureEnd(e) {
        //console.log('[mobile_note_highway] touchend event fired');
        //console.log('[mobile_note_highway] _gestureActive:', _gestureActive);
        
        if (!_gestureActive) {
            //console.log('[mobile_note_highway] No active gesture');
            return;
        }
        
        if (!e.changedTouches || e.changedTouches.length !== 1) {
            //console.log('[mobile_note_highway] Ignoring - not single touch end');
            return;
        }
        
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - _gestureStartX;
        const deltaY = touch.clientY - _gestureStartY;
        const deltaTime = Date.now() - _gestureStartTime;
        
        //console.log('[mobile_note_highway] Touch ended - deltaX:', deltaX, 'deltaY:', deltaY, 'deltaTime:', deltaTime);
        
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
        //console.log('[mobile_note_highway] isSwipe:', isSwipe, '(|deltaX| > 50 && deltaTime < 500 && horizontal)');
        
        if (isSwipe) {
            //console.log('[mobile_note_highway] ✓ SWIPE DETECTED:', deltaX > 0 ? 'right' : 'left');
            e.preventDefault();
            handleSwipe(deltaX > 0 ? 'right' : 'left');
            return;
        }
        
        //console.log('[mobile_note_highway] No gesture recognized');
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
        //console.log('[mobile_note_highway] handleSwipe called, direction:', direction);
        
        const audio = document.getElementById('audio');
        if (!audio) {
            //console.warn('[mobile_note_highway] No audio element found');
            return;
        }
        
        const seekAmount = direction === 'right' ? 5 : -5;
        const currentTime = audio.currentTime;
        const newTime = Math.max(0, Math.min(audio.duration || 0, currentTime + seekAmount));
        
        //console.log('[mobile_note_highway] Seeking from', Math.floor(currentTime), 's to', Math.floor(newTime), 's');
        
        // Update lastAudioTime to prevent the jump detector from resetting
        if (typeof lastAudioTime !== 'undefined') lastAudioTime = newTime;
        
        audio.currentTime = newTime;
        
        showGestureFeedback(direction === 'right' ? '+5s' : '-5s');
        
        //console.log('[mobile_note_highway] ✓ Seeked to', Math.floor(newTime), 's');
    }
    
    /**
     * Show visual feedback for gesture actions
     */
    function showGestureFeedback(text) {
        //console.log('[mobile_note_highway] showGestureFeedback:', text);
        
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
            //console.log('[mobile_note_highway] No player-controls found for gestures');
            return;
        }
        
        //console.log('[mobile_note_highway] ✓ Enabling controls gestures (swipe up/down)');
        
        controls.addEventListener('touchstart', onControlsGestureStart, { passive: true });
        controls.addEventListener('touchmove', onControlsGestureMove, { passive: false });
        controls.addEventListener('touchend', onControlsGestureEnd, { passive: false });
        
        //console.log('[mobile_note_highway] ✓ Controls gesture listeners attached');
    }
    
    /**
     * Disable controls gestures
     */
    function disableControlsGestures() {
        const controls = document.getElementById('player-controls');
        if (!controls) return;
        
        //console.log('[mobile_note_highway] Disabling controls gestures');
        
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
        
        //console.log('[mobile_note_highway] Controls swipe detected: deltaY =', deltaY);
        
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
     * Initialize Mobile Note Highway plugin
     */
    function init() {
        // Only activate on phone / tablet; not on desktop
        if (!isMobile()) {
            // console.log('[mobile_note_highway] Desktop detected - not activating');
            return;
        }
        
        console.log('[mobile_note_highway] Activating on device:', DEVICE);
        
        // Inject CSS classes
        injectMobileStyles();
        
        // Setup resize listener
        setupResizeListener();
        
        // Listen for screen changes
        window.slopsmith.on('screen:changed', (e) => {
            const screenId = e.detail.id || e.detail.screen;
            //console.log('[mobile_note_highway] 🔄 Screen changed to:', screenId);
            
            if (screenId === 'player') {
                //console.log('[mobile_note_highway] Player screen detected - enhancing controls');
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
                //console.log('[mobile_note_highway] 🚪 Leaving player screen (now on:', screenId, ')');
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
                //console.log('[mobile_note_highway] playSong completed - re-enhancing');
                
                // Sync loop marker state from actual loop values
                syncLoopMarkerState();
                
                // Re-apply control order values (fixes misalignment on re-entry without recreating wrappers)
                scheduleEnhancement(reapplyControlOrder, 50);
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
       // console.log('[mobile_note_highway] 🎬 Init check - current screen:', currentScreen);
        if (currentScreen === 'player') {
            //console.log('[mobile_note_highway] Already on player screen - enhancing');
            scheduleEnhancement(enhancePlayerControls, 100);
            scheduleEnhancement(enhanceSectionMap, 200);
            scheduleEnhancement(adjustPlayerHud, 200);
            scheduleEnhancement(enableHighwayGestures, 300);
            scheduleEnhancement(enableControlsGestures, 150);
            scheduleEnhancement(startHighway3dObserver, 500);
            // Sync loop state on init
            scheduleEnhancement(syncLoopMarkerState, 100);
        } else {
            console.log('[mobile_note_highway] Not on player screen, waiting for screen:changed event');
        }
    }
    
    // Boot when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
