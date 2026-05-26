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
     * Detect if the current device is mobile
     * @returns {boolean} True if mobile device detected
     */
    function isMobile() {
        return (
            window.matchMedia('(max-width: 768px)').matches ||
            ('ontouchstart' in window) ||
            (navigator.maxTouchPoints > 0)
        );
    }
    
    // ═══════════════════════════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════════════════════════
    
    let _toolsExpanded = false;
    let _expandButton = null;
    let _collapseButton = null;
    let _controlsObserver = null;
    let _sectionMapOriginalStyles = null;
    let _playerHudOriginalStyles = null;
    let _highway3dOverlayOriginalStyles = null;
    let _highway3dObserver = null;
    let _highway3dRetryInterval = null;
    let _highway3dAdjusted = false;
    
    // Gesture state (highway swipes and double-tap)
    let _gestureStartX = 0;
    let _gestureStartY = 0;
    let _gestureStartTime = 0;
    let _lastTapTime = 0;
    let _gestureActive = false;
    
    // Controls gesture state (swipe up/down to expand/collapse)
    let _controlsGestureStartY = 0;
    let _controlsGestureStartTime = 0;
    let _controlsGestureActive = false;
    
    // ═══════════════════════════════════════════════════════════════
    // Essential Control Detection
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Check if an element should remain visible (not hidden in Tools)
     * @param {HTMLElement} el - Element to check
     * @returns {boolean} True if element is essential and should stay visible
     */
    function isEssentialControl(el) {
        // Essential control IDs
        const essentialIds = [
            'btn-play',
            'speed-slider',
            'speed-label',
            'current-time',
            'audio-progress'
        ];
        
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
            el.style.display = _toolsExpanded ? '' : 'none';
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
        
        console.log('[mobile_ui] Enhancing player controls');
        
        // Make all buttons touch-friendly with consistent height FIRST
        // (before hiding, so display: 'none' can overwrite display: 'inline-flex')
        Array.from(controls.querySelectorAll('button')).forEach(btn => {
            btn.style.height = '44px';
            btn.style.minWidth = '44px';
            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.padding = '0 16px';
        });
        
        // Hide seek button labels (5s text) on mobile to make them icon-only
        Array.from(controls.querySelectorAll('.seek-label')).forEach(label => {
            label.style.display = 'none';
        });
        
        // Make sliders bigger
        Array.from(controls.querySelectorAll('input[type="range"]')).forEach(slider => {
            slider.style.minHeight = '44px';
        });
        
        // Stack speed label above speed slider to save horizontal space
        const speedSlider = document.getElementById('speed-slider');
        const speedLabel = document.getElementById('speed-label');
        if (speedSlider && speedLabel && speedSlider.parentElement === controls && speedLabel.parentElement === controls) {
            // Create wrapper container
            const speedWrapper = document.createElement('div');
            speedWrapper.style.display = 'inline-flex';
            speedWrapper.style.flexDirection = 'column';
            speedWrapper.style.alignItems = 'center';
            speedWrapper.style.gap = '0';  // No gap between label and slider
            speedWrapper.style.height = '44px';
            speedWrapper.style.justifyContent = 'center';  // Center the label+slider vertically
            
            // Insert wrapper before the slider
            speedSlider.parentElement.insertBefore(speedWrapper, speedSlider);
            
            // Move label and slider into wrapper
            speedWrapper.appendChild(speedLabel);
            speedWrapper.appendChild(speedSlider);
            
            // Adjust label styling
            speedLabel.style.fontSize = '9px';
            speedLabel.style.lineHeight = '1';
            speedLabel.style.marginTop = '0';  // Align to top of wrapper
            speedLabel.style.marginBottom = '0';
            speedLabel.style.paddingTop = '0';
            speedLabel.style.paddingBottom = '6px';  // Small gap between label and slider
            speedLabel.style.textAlign = 'center';
            speedLabel.style.width = 'auto';  // Override w-10 class
            
            // Adjust slider styling
            speedSlider.style.minHeight = 'auto';
            speedSlider.style.height = '20px';
        }
        
        // Hide all non-essential controls (after styling, so display: 'none' wins)
        let hiddenCount = 0;
        Array.from(controls.children).forEach(el => {
            if (!isEssentialControl(el)) {
                hideControl(el);
                hiddenCount++;
            }
        });
        
        console.log(`[mobile_ui] Hiding ${hiddenCount} advanced controls`);
        
        // Watch for plugin buttons being injected after initial load
        startControlsObserver(controls);
        
        // Run multiple passes to catch late-injected buttons (plugins load at different times)
        // Pass 1: 100ms - catches early plugins
        setTimeout(() => reclassifyAllControls(), 100);
        // Pass 2: 300ms - catches most plugins
        setTimeout(() => reclassifyAllControls(), 300);
        // Pass 3: 600ms - catches slow plugins
        setTimeout(() => reclassifyAllControls(), 600);
        
        // Create expand button (⌃)
        if (!_expandButton) {
            _expandButton = document.createElement('button');
            _expandButton.id = 'mobile-expand-btn';
            _expandButton.textContent = '⌃';
            _expandButton.title = 'Show Tools';
            _expandButton.style.cssText = `
                order: 997;
                margin-left: auto;
                background: rgba(255, 255, 255, 0.1);
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px 12px;
                font-size: 18px;
                min-width: 44px;
                min-height: 44px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            `;
            _expandButton.addEventListener('click', () => toggleAdvancedControls(true));
            controls.appendChild(_expandButton);
            console.log('[mobile_ui] ✅ Expand button created');
        }

        // Create collapse button (⌄)
        if (!_collapseButton) {
            _collapseButton = document.createElement('button');
            _collapseButton.id = 'mobile-collapse-btn';
            _collapseButton.textContent = '⌄';
            _collapseButton.title = 'Hide Tools';
            _collapseButton.style.cssText = `
                order: 997;
                margin-left: auto;
                background: rgba(255, 255, 255, 0.1);
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px 12px;
                font-size: 18px;
                min-width: 44px;
                min-height: 44px;
                cursor: pointer;
                display: none;
                align-items: center;
                justify-content: center;
            `;
            _collapseButton.addEventListener('click', () => toggleAdvancedControls(false));
            controls.appendChild(_collapseButton);
            console.log('[mobile_ui] ✅ Collapse button created');
        }

        // Set button ordering for proper layout
        const speedWrapper = controls.querySelector('div[style*="flex-direction: column"]');
        if (speedWrapper) {
            speedWrapper.style.order = '998';
            speedWrapper.style.marginLeft = '8px';
            console.log('[mobile_ui] ✅ Speed wrapper moved to order 998');
        }
        
        // Find and position close button at far right
        const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
            const onclick = btn.getAttribute('onclick');
            return onclick && onclick.includes("showScreen('home')");
        });
        if (closeButton) {
            closeButton.style.order = '999';
            console.log('[mobile_ui] ✅ Close button positioned at order 999');
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
            // Skip our expand/collapse buttons
            if (el.id === 'mobile-expand-btn' || el.id === 'mobile-collapse-btn') return;
            
            if (isEssentialControl(el)) {
                // Essential controls - ensure visible and no hide class
                if (el.classList.contains('mobile-hide-advanced')) {
                    el.classList.remove('mobile-hide-advanced');
                    el.style.display = '';  // Reset to default
                    fixedCount++;
                }
            } else {
                // Non-essential controls - FORCE hidden state
                const wasFixed = !el.classList.contains('mobile-hide-advanced') || el.style.display !== 'none';
                el.classList.add('mobile-hide-advanced');
                el.style.display = 'none';  // Force hidden since _toolsExpanded is false initially
                if (wasFixed) {
                    console.log('[mobile_ui] Fixing control:', el.textContent || el.id || 'unknown');
                    fixedCount++;
                }
            }
        });
        
        // Ensure close button is at far right (order: 999)
        const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
            const onclick = btn.getAttribute('onclick');
            return onclick && onclick.includes("showScreen('home')");
        });
        if (closeButton && closeButton.style.order !== '999') {
            closeButton.style.order = '999';
        }
        
        if (fixedCount > 0) {
            console.log(`[mobile_ui] Fixed ${fixedCount} controls in reclassify pass`);
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
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    // Check each added node
                    mutation.addedNodes.forEach(node => {
                        // Only process element nodes (not text nodes)
                        if (node.nodeType !== Node.ELEMENT_NODE) return;
                        
                        // Skip if it's our expand/collapse buttons
                        if (node.id === 'mobile-expand-btn' || node.id === 'mobile-collapse-btn') return;
                        
                        // If it's not essential, hide it
                        if (!isEssentialControl(node)) {
                            console.log(`[mobile_ui] Real-time plugin button detected:`, node.textContent || node.id || 'unknown');
                            hideControl(node);
                        }
                    });
                }
            }
        });
        
        // Start observing
        _controlsObserver.observe(controls, {
            childList: true,  // Watch for children being added/removed
            subtree: false    // Don't watch nested changes
        });
        
        console.log('[mobile_ui] Controls observer started');
    }
    
    /**
     * Stop observing #player-controls
     */
    function stopControlsObserver() {
        if (_controlsObserver) {
            _controlsObserver.disconnect();
            _controlsObserver = null;
            console.log('[mobile_ui] Controls observer stopped');
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
        
        // Toggle button visibility
        if (_expandButton && _collapseButton) {
            if (_toolsExpanded) {
                _expandButton.style.display = 'none';
                _collapseButton.style.display = 'flex';
            } else {
                _expandButton.style.display = 'flex';
                _collapseButton.style.display = 'none';
            }
        }
        
        // Re-scan ALL controls to catch any late-injected buttons
        const controls = document.getElementById('player-controls');
        if (controls) {
            Array.from(controls.children).forEach(el => {
                // Skip our expand/collapse buttons
                if (el.id === 'mobile-expand-btn' || el.id === 'mobile-collapse-btn') return;
                
                if (isEssentialControl(el)) {
                    // Essential controls - always visible, ensure no hide class
                    el.classList.remove('mobile-hide-advanced');
                } else {
                    // Non-essential - mark for hiding and set display based on expanded state
                    if (!el.classList.contains('mobile-hide-advanced')) {
                        el.classList.add('mobile-hide-advanced');
                        console.log('[mobile_ui] Late classification:', el.textContent || el.id || 'unknown');
                    }
                    el.style.display = _toolsExpanded ? '' : 'none';
                }
            });
            
            // Ensure close button is at far right
            const closeButton = Array.from(controls.querySelectorAll('button')).find(btn => {
                const onclick = btn.getAttribute('onclick');
                return onclick && onclick.includes("showScreen('home')");
            });
            if (closeButton) {
                closeButton.style.order = '999';
            }
        }
        
        console.log(`[mobile_ui] Advanced controls ${_toolsExpanded ? 'expanded' : 'collapsed'}`);
    }
    
    // ═══════════════════════════════════════════════════════════════
    // Cleanup
    // ═══════════════════════════════════════════════════════════════
    
    /**
     * Remove mobile UI enhancements
     */
    function cleanup() {
        console.log('[mobile_ui] ❗ Cleanup called');
        
        // Stop observing
        stopControlsObserver();
        
        // Remove expand button
        if (_expandButton && _expandButton.parentElement) {
            _expandButton.remove();
            _expandButton = null;
        }
        
        // Remove collapse button
        if (_collapseButton && _collapseButton.parentElement) {
            _collapseButton.remove();
            _collapseButton = null;
        }
        
        // Get controls element
        const controls = document.getElementById('player-controls');
        
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
        
        console.log('[mobile_ui] Cleanup complete');
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
            console.log('[mobile_ui] No section map found');
            return;
        }
        
        console.log('[mobile_ui] Enhancing section map for mobile');
        
        // Store original styles for cleanup
        if (!_sectionMapOriginalStyles) {
            _sectionMapOriginalStyles = {
                height: sectionMap.style.height || '20px'
            };
        }
        
        // Increase height for better touch targets (20px → 44px)
        sectionMap.style.height = '44px';
        
        // Hide section labels (too small to read on mobile - tooltip shows them on drag)
        const labels = sectionMap.querySelectorAll('.sm-block span');
        labels.forEach(label => {
            if (!label.hasAttribute('data-original-display')) {
                label.setAttribute('data-original-display', label.style.display || '');
            }
            label.style.display = 'none';
        });
        
        console.log('[mobile_ui] Section map enhanced: 44px height, labels hidden');
    }
    
    /**
     * Restore section map to original state
     */
    function restoreSectionMap() {
        const sectionMap = document.getElementById('section-map');
        if (!sectionMap) return;
        
        console.log('[mobile_ui] Restoring section map');
        
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
            console.log('[mobile_ui] No player HUD found');
            return;
        }
        
        console.log('[mobile_ui] Adjusting player HUD position');
        
        // Store original styles for cleanup
        if (!_playerHudOriginalStyles) {
            _playerHudOriginalStyles = {
                top: playerHud.style.top || '0'
            };
        }
        
        // Push it below the 44px section map (add some spacing)
        playerHud.style.top = '40px';
        
        console.log('[mobile_ui] Player HUD moved below section map');
    }
    
    /**
     * Restore player HUD to original position
     */
    function restorePlayerHud() {
        const playerHud = document.getElementById('player-hud');
        if (!playerHud) return;
        
        console.log('[mobile_ui] Restoring player HUD');
        
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
        
        console.log('[mobile_ui] Adjusting 3D highway wrapper (.h3d-wrap)...');
        console.log('[mobile_ui] Wrapper BEFORE - top:', wrap.style.top || 'not set');
        
        // Store original styles for cleanup (only once)
        if (!_highway3dOverlayOriginalStyles) {
            _highway3dOverlayOriginalStyles = {
                top: wrap.style.top || ''
            };
        }
        
        // Push the entire wrapper down to clear section map + player HUD
        // This moves the whole 3D highway overlay (lyrics, "Up Next" text, chord diagrams)
        // Need enough space for: section map (44px) + player HUD text (~40px) + small gap
        wrap.style.setProperty('top', '105px', 'important');
        
        console.log('[mobile_ui] Wrapper AFTER - top:', wrap.style.top);
        
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
        
        console.log('[mobile_ui] ✓ 3D highway wrapper adjusted successfully');
    }
    
    /**
     * Start observing for 3D highway overlay creation/changes
     */
    function startHighway3dObserver() {
        console.log('[mobile_ui] Starting 3D highway observer...');
        
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
            console.log('[mobile_ui] ✗ No #player found');
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
        
        console.log('[mobile_ui] ✓ Observer started (will retry every 500ms until 3D highway found)');
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
        
        console.log('[mobile_ui] Restoring 3D highway wrapper');
        
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
        console.log('[mobile_ui] enableHighwayGestures called');
        console.log('[mobile_ui] highway element:', highway);
        
        if (!highway) {
            console.warn('[mobile_ui] ✗ No highway canvas found for gestures');
            return;
        }
        
        console.log('[mobile_ui] ✓ Enabling highway gestures (swipe left/right, double tap)');
        console.log('[mobile_ui] Highway dimensions:', highway.offsetWidth, 'x', highway.offsetHeight);
        
        highway.addEventListener('touchstart', onGestureStart, { passive: true });
        highway.addEventListener('touchend', onGestureEnd, { passive: false });
        
        console.log('[mobile_ui] ✓ Touch event listeners attached');
    }
    
    /**
     * Disable highway gestures
     */
    function disableHighwayGestures() {
        const highway = document.getElementById('highway');
        if (!highway) return;
        
        console.log('[mobile_ui] Disabling highway gestures');
        
        highway.removeEventListener('touchstart', onGestureStart);
        highway.removeEventListener('touchend', onGestureEnd);
    }
    
    /**
     * Handle touch start for gesture detection
     */
    function onGestureStart(e) {
        console.log('[mobile_ui] touchstart event fired');
        console.log('[mobile_ui] touches:', e.touches ? e.touches.length : 'none');
        
        if (!e.touches || e.touches.length !== 1) {
            console.log('[mobile_ui] Ignoring - not single touch');
            return;
        }
        
        const touch = e.touches[0];
        _gestureStartX = touch.clientX;
        _gestureStartY = touch.clientY;
        _gestureStartTime = Date.now();
        _gestureActive = true;
        
        console.log('[mobile_ui] Gesture started at:', _gestureStartX, ',', _gestureStartY);
    }
    
    /**
     * Handle touch end for gesture detection
     */
    function onGestureEnd(e) {
        console.log('[mobile_ui] touchend event fired');
        console.log('[mobile_ui] _gestureActive:', _gestureActive);
        
        if (!_gestureActive) {
            console.log('[mobile_ui] No active gesture');
            return;
        }
        
        if (!e.changedTouches || e.changedTouches.length !== 1) {
            console.log('[mobile_ui] Ignoring - not single touch end');
            return;
        }
        
        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - _gestureStartX;
        const deltaY = touch.clientY - _gestureStartY;
        const deltaTime = Date.now() - _gestureStartTime;
        
        console.log('[mobile_ui] Touch ended - deltaX:', deltaX, 'deltaY:', deltaY, 'deltaTime:', deltaTime);
        
        _gestureActive = false;
        
        // Check for double tap (within 300ms, < 10px movement)
        const isQuickTap = deltaTime < 300 && Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10;
        console.log('[mobile_ui] isQuickTap:', isQuickTap, '(deltaTime < 300 && |deltaX| < 10 && |deltaY| < 10)');
        
        if (isQuickTap) {
            const timeSinceLastTap = Date.now() - _lastTapTime;
            console.log('[mobile_ui] timeSinceLastTap:', timeSinceLastTap, 'ms');
            _lastTapTime = Date.now();
            
            if (timeSinceLastTap < 400) {
                // Double tap detected!
                console.log('[mobile_ui] ✓ DOUBLE TAP DETECTED!');
                e.preventDefault();
                handleDoubleTap();
                return;
            } else {
                console.log('[mobile_ui] Single tap (time since last:', timeSinceLastTap, 'ms)');
            }
        }
        
        // Check for swipe (horizontal movement > 50px, quick < 500ms, mostly horizontal)
        const isSwipe = Math.abs(deltaX) > 50 && deltaTime < 500 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5;
        console.log('[mobile_ui] isSwipe:', isSwipe, '(|deltaX| > 50 && deltaTime < 500 && horizontal)');
        
        if (isSwipe) {
            console.log('[mobile_ui] ✓ SWIPE DETECTED:', deltaX > 0 ? 'right' : 'left');
            e.preventDefault();
            handleSwipe(deltaX > 0 ? 'right' : 'left');
            return;
        }
        
        console.log('[mobile_ui] No gesture recognized');
    }
    
    /**
     * Handle double tap gesture (Play/Pause)
     */
    function handleDoubleTap() {
        console.log('[mobile_ui] handleDoubleTap called');
        
        const audio = document.getElementById('audio');
        if (!audio) {
            console.warn('[mobile_ui] No audio element found');
            return;
        }
        
        console.log('[mobile_ui] Audio state before:', audio.paused ? 'paused' : 'playing');
        
        if (audio.paused) {
            audio.play();
            showGestureFeedback('▶ Play');
            console.log('[mobile_ui] ✓ Playing audio');
        } else {
            audio.pause();
            showGestureFeedback('⏸ Pause');
            console.log('[mobile_ui] ✓ Paused audio');
        }
    }
    
    /**
     * Handle swipe gesture (Seek ±5 seconds)
     */
    function handleSwipe(direction) {
        console.log('[mobile_ui] handleSwipe called, direction:', direction);
        
        const audio = document.getElementById('audio');
        if (!audio) {
            console.warn('[mobile_ui] No audio element found');
            return;
        }
        
        const seekAmount = direction === 'right' ? 5 : -5;
        const currentTime = audio.currentTime;
        const newTime = Math.max(0, Math.min(audio.duration || 0, currentTime + seekAmount));
        
        console.log('[mobile_ui] Seeking from', Math.floor(currentTime), 's to', Math.floor(newTime), 's');
        
        // Update lastAudioTime to prevent the jump detector from resetting
        if (typeof lastAudioTime !== 'undefined') lastAudioTime = newTime;
        
        audio.currentTime = newTime;
        
        showGestureFeedback(direction === 'right' ? '⏩ +5s' : '⏪ -5s');
        
        console.log('[mobile_ui] ✓ Seeked to', Math.floor(newTime), 's');
    }
    
    /**
     * Show visual feedback for gesture actions
     */
    function showGestureFeedback(text) {
        console.log('[mobile_ui] showGestureFeedback:', text);
        
        // Remove any existing feedback
        const existing = document.getElementById('gesture-feedback');
        if (existing) existing.remove();
        
        // Create feedback element
        const feedback = document.createElement('div');
        feedback.id = 'gesture-feedback';
        feedback.textContent = text;
        feedback.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 600;
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
                    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                    20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                    80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
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
            console.log('[mobile_ui] No player-controls found for gestures');
            return;
        }
        
        console.log('[mobile_ui] ✓ Enabling controls gestures (swipe up/down)');
        
        controls.addEventListener('touchstart', onControlsGestureStart, { passive: true });
        controls.addEventListener('touchend', onControlsGestureEnd, { passive: false });
        
        console.log('[mobile_ui] ✓ Controls gesture listeners attached');
    }
    
    /**
     * Disable controls gestures
     */
    function disableControlsGestures() {
        const controls = document.getElementById('player-controls');
        if (!controls) return;
        
        console.log('[mobile_ui] Disabling controls gestures');
        
        controls.removeEventListener('touchstart', onControlsGestureStart);
        controls.removeEventListener('touchend', onControlsGestureEnd);
    }
    
    /**
     * Handle touch start on controls
     */
    function onControlsGestureStart(e) {
        if (!e.touches || e.touches.length !== 1) return;
        
        const touch = e.touches[0];
        _controlsGestureStartY = touch.clientY;
        _controlsGestureStartTime = Date.now();
        _controlsGestureActive = true;
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
        
        // Detect vertical swipe (40px threshold, < 500ms, mostly vertical)
        const isSwipe = Math.abs(deltaY) > 40 && deltaTime < 500;
        
        if (!isSwipe) return;
        
        console.log('[mobile_ui] Controls swipe detected: deltaY =', deltaY);
        
        // Swipe up (positive deltaY) = expand, swipe down (negative deltaY) = collapse
        if (deltaY > 0 && !_toolsExpanded) {
            // Swipe up to expand
            console.log('[mobile_ui] ✓ Swipe UP - expanding controls');
            toggleAdvancedControls();
            showGestureFeedback('⬆ Show Tools');
        } else if (deltaY < 0 && _toolsExpanded) {
            // Swipe down to collapse
            console.log('[mobile_ui] ✓ Swipe DOWN - collapsing controls');
            toggleAdvancedControls();
            showGestureFeedback('⬇ Hide Tools');
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
        // Only activate on mobile devices
        if (!isMobile()) {
            console.log('[mobile_ui] Desktop detected - not activating');
            return;
        }
        
        console.log('[mobile_ui] Mobile detected - activating');
        
        // Listen for screen changes
        window.slopsmith.on('screen:changed', (e) => {
            const screenId = e.detail.id || e.detail.screen;
            console.log('[mobile_ui] 🔄 Screen changed to:', screenId);
            
            if (screenId === 'player') {
                console.log('[mobile_ui] Player screen detected - enhancing controls');
                // Give the player screen time to render
                setTimeout(enhancePlayerControls, 100);
                // Section map might already exist or appear soon
                setTimeout(enhanceSectionMap, 200);
                // Adjust HUD position
                setTimeout(adjustPlayerHud, 200);
                // Enable gesture controls
                console.log('[mobile_ui] Scheduling enableHighwayGestures in 300ms');
                setTimeout(enableHighwayGestures, 300);
                // Enable controls swipe gestures (after controls are enhanced)
                setTimeout(enableControlsGestures, 150);
                // Start observing 3D highway overlay (needs more time to load)
                setTimeout(startHighway3dObserver, 500);
            } else {
                // Clean up when leaving player
                console.log('[mobile_ui] 🚪 Leaving player screen (now on:', screenId, ')');
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
                await origPlaySong(filename, arrangement);
                console.log('[mobile_ui] playSong completed - re-enhancing');
                // Section map gets created after playSong, give it time
                setTimeout(enhanceSectionMap, 300);
                // Adjust HUD position
                setTimeout(adjustPlayerHud, 300);
                // Re-enable gestures (highway canvas recreates on song change)
                setTimeout(enableHighwayGestures, 400);
                // Re-enable controls gestures
                setTimeout(enableControlsGestures, 150);
                // Re-observe 3D highway overlay (it recreates on song change)
                setTimeout(startHighway3dObserver, 600);
            };
        }
        
        // If we're already on the player screen, enhance it now
        const currentScreen = window.slopsmith.getCurrentScreen?.();
        console.log('[mobile_ui] 🎬 Init check - current screen:', currentScreen);
        if (currentScreen === 'player') {
            console.log('[mobile_ui] Already on player screen - enhancing');
            setTimeout(enhancePlayerControls, 100);
            setTimeout(enhanceSectionMap, 200);
            setTimeout(adjustPlayerHud, 200);
            setTimeout(enableHighwayGestures, 300);
            setTimeout(enableControlsGestures, 150);
            setTimeout(startHighway3dObserver, 500);
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
