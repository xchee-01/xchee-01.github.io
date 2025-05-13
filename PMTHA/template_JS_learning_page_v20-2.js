// --- START OF FILE template_JS_learning_page_v20-2.js ---
// v20-2 incorporating unload/pagehide reliability fixes

//NOTE: Store everything in local storage and only sends data when user refreshes the page or closes it.
// Tracking Approach:
// 1. All events are stored in memory (sectionEvents array)
// 2. Events are periodically saved to localStorage as backup
// 3. Data is only sent to the server when the page is closed or refreshed (using sendBeacon)
// 4. Failed sends on close are saved to localStorage and attempted again on the next page load.
// 5. This optimizes for fewer network requests during active use.

// Replace with your deployed Google Apps Script Web App URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzSxyvmPYsdnimwhEj572QuTvow9nTpkc13rOd1rQY9neh0mp-a4Bx5p6tERWRzR9d1tA/exec';
const SIGN_IN_URL = 'https://xchee-01.github.io/PMTHA/SOM-PMTHA_signin.html';
const COPY_TRACKING_URL = 'https://script.google.com/macros/s/AKfycbz88biGq3GAIfH77lEt_IeWcRbBrZ8r2K-4Z5C0foZDMHQGsuqaGIvhGOBKA5eqW65_AA/exec';
const EXTRA_INFO_INTERACTION_URL = 'https://script.google.com/macros/s/AKfycbxXHMDDEnZq0krPyE96d22zEp3DqdLmwO74OsxSRW1Rq_JvHEYRXc5IgnaV-6J1l4o_GQ/exec';

// Configuration and constants
const TRACKING_INTERVAL = 30000; // 30 seconds for periodic localStorage saves (changed from 15)
const HEARTBEAT_INTERVAL = 2000; // 2 seconds for heartbeat (changed from 1000) - slightly longer to reduce event volume
const INACTIVITY_THRESHOLD = 10000; // 10 seconds until user is considered inactive
const THROTTLE_DELAY = 1000; // Throttle delay for frequent events
const LOCAL_STORAGE_KEY = 'tracking_events_cache'; // Key for localStorage tracking cache
// const EVENT_BATCH_THRESHOLD = 10; // Minimum number of events before sending to server (REMOVED - Now primarily sends on unload)

// Required packages for Pyodide
const requiredPackages = ['numpy', 'pandas'];

// Global variables
let pyodide;
let openSections = {};
let sectionEvents = [];
let trackingInterval = null;
let lastUserActivity = new Date();
let isPageVisible = true;
let isUserActive = true;
let heartbeatInterval = null;
// let activityTimeout = null; // Replaced by direct resetInactivityTimeout calls
let sessionId = generateSessionId();
let inactivityTimeout = null;
let isTrackingPaused = false;
let visibilitySession = Date.now();
let lastUpdateTime = new Date().toISOString(); // Track last update time
let hasSentUnloadData = false; // Flag to prevent double sends on unload

// Event priority mapping (higher number = higher priority) - Used for aggregation
const EVENT_PRIORITY = {
    'heartbeat': 1,
    'section_opened': 2,
    'section_closed': 2,
    're_activation': 2,
    'active_on_exit': 2,
    'inactive_on_exit': 2,
    'visibility_return': 2,
    'visibility_lost': 2,
    'answer_viewed': 3,
    'challenge_completed': 4,
    'inactivity_popup_shown': 3,
    'session_restored': 2 // Added priority for session restore event
};

// Cache DOM elements
const domElements = {
    runButton: document.getElementById('run-button'),
    clearButton: document.getElementById('clear-button'),
    statusElement: document.getElementById('status'),
    outputArea: document.getElementById('output-area'),
    codeInput: document.getElementById('python-code'),
    inactivityModal: document.getElementById('inactivityModal'),
    celebrationModal: document.getElementById('celebrationModal'),
    celebrationMessage: document.getElementById('celebrationMessage'),
    sectionHeaders: document.querySelectorAll('.section-header'),
    toggleButtons: document.querySelectorAll('.toggle-answer'),
    copyButtons: document.querySelectorAll('.copy-button'),
    celebrateButtons: document.querySelectorAll('.celebrate-button'),
    diseaseTitle: document.querySelector('.disease-title'),
    diseasePreview: document.querySelector('.disease-preview'),
    diseaseContent: document.querySelector('.disease-content'),
    reactionButtons: document.querySelectorAll('.reaction-button'),
    reactionFeedback: document.querySelector('.reaction-feedback'),
    modalClose: document.querySelector('.modal-close'), // For celebration modal
    inactivityCloseButton: document.querySelector('#inactivityModal .modal-close'), // Specific close button for inactivity
    // User info box elements
    usernameDisplay: document.getElementById('username'),
    accessTimeDisplay: document.getElementById('access-time'),
    currentUrlDisplay: document.getElementById('current-url'),
    statusMessageDisplay: document.getElementById('status-message')
};

// Optimized initialization function
document.addEventListener('DOMContentLoaded', function() {
    // Initialize enhanced tracking system
    initializeTracking();

    // Setup UI interactions
    setupUIInteractions();

    // Initialize Python
    initializePython();

    // Display initial user info
    displayUserInfo();
});

// Generate a unique session ID
function generateSessionId() {
    return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

// Optimized tracking initialization
function initializeTracking() {
    // First check if user is logged in before doing anything else
    const username = getUsername();
    if (!username) {
        // getUsername will redirect if needed
        return;
    }
    console.log("Tracking initialized for user:", username);

    // Load any cached events from localStorage (and attempt to send if found)
    loadCachedEvents();

    // Start periodic tracking for saving to localStorage
    startPeriodicTracking();

    // Start heartbeat for continuous monitoring
    startHeartbeat();

    // Set up Page Visibility API
    setupVisibilityTracking();

    // Set up user activity monitoring
    setupActivityMonitoring();

    // Set initial inactivity timeout
    resetInactivityTimeout();

    // Save session state and send data on unload/pagehide
    window.addEventListener('pagehide', handlePageUnload); // Preferred for sendBeacon
    window.addEventListener('beforeunload', handlePageUnload); // Fallback

    // Check for previous session to restore UI state
    checkForPreviousSession();
}

// Load cached events from localStorage and attempt to send them immediately
function loadCachedEvents() {
    try {
        const cachedData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cachedData) {
            const parsedData = JSON.parse(cachedData);
            if (Array.isArray(parsedData) && parsedData.length > 0) {
                 // Prioritize cached data from previous failed unload attempt
                 const previousSessionEvents = parsedData;
                 console.log(`Loaded ${previousSessionEvents.length} cached events from previous session.`);

                 // Attempt to send immediately on load using fetch
                 console.log("Attempting to send cached data immediately on load...");
                 sendCachedDataOnLoad(previousSessionEvents); // Use the new function

                 // Keep current session events separate for now
                 // sectionEvents remains empty until new events occur in *this* session
            } else {
                 // Clear storage if it contained invalid/empty data
                 console.log("Cached data was empty or invalid, clearing cache.");
                 localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
        } else {
            console.log("No cached events found in localStorage.");
        }
    } catch (error) {
        console.error('Error loading cached events:', error);
        // Optional: Clear storage if parsing fails badly
        // localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
}

// New function to send cached data on load using fetch
async function sendCachedDataOnLoad(cachedEvents) {
    if (!cachedEvents || cachedEvents.length === 0) return;

    const username = getUsername();
     if (!username) {
        console.error("Cannot send cached data: Username not found.");
        return; // Don't clear cache if we can't identify user
    }

    console.log(`Processing ${cachedEvents.length} cached events for sending...`);
    const processedEvents = processTrackingEvents(cachedEvents); // Process before sending

    if (processedEvents.length === 0) {
        console.log("No cached events remaining after processing. Clearing cache.");
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        // No need to filter sectionEvents here as we loaded cache separately
        return;
    }

    const data = {
        username: username,
        url: window.location.href, // URL of the *current* page load
        events: processedEvents,
        timestamp: new Date().toISOString(),
        sessionId: sessionId, // Session ID of the *current* load
        lastUpdateTime: new Date().toISOString(),
        reason: "cached_data_send_on_load" // Add context
    };

    try {
        // Use 'cors' mode if your Apps Script is configured for it and returns useful responses.
        // Use 'no-cors' if your Apps Script doesn't set CORS headers or you don't need the response.
        const fetchOptions = {
            method: 'POST',
            mode: 'cors', // Change to 'no-cors' if needed
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
            keepalive: false // Not needed for fetch on load
        };

        console.log("Sending cached data via fetch:", data);
        const response = await fetch(APPS_SCRIPT_URL, fetchOptions);

        // Check response status based on mode
        if (fetchOptions.mode === 'cors' && response.ok) {
            console.log(`Successfully sent ${processedEvents.length} cached events via CORS fetch.`);
            localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear cache on success
        } else if (fetchOptions.mode === 'no-cors') { // Opaque response, assume success
             console.log(`Sent ${processedEvents.length} cached events via no-cors fetch. Assuming success. Clearing cache.`);
             localStorage.removeItem(LOCAL_STORAGE_KEY); // Assume success with no-cors
        } else if (fetchOptions.mode === 'cors' && !response.ok) {
            console.error(`Failed to send cached events via CORS fetch. Status: ${response.status}. Data remains cached.`);
            // Don't clear cache on failure
        } else {
             console.error(`Failed to send cached events. Response type: ${response.type}. Data remains cached.`);
             // Don't clear cache on failure
        }
    } catch (error) {
        console.error('Network error sending cached events via fetch:', error);
        // Don't clear cache on network failure
    }
}


// Save events to localStorage
function saveEventsToLocalStorage() {
    try {
        if (sectionEvents.length > 0) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sectionEvents));
             // console.log(`Saved ${sectionEvents.length} events to localStorage.`); // Less verbose logging
        } else {
            // If sectionEvents is empty, ensure the cache is also cleared
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            // console.log("sectionEvents is empty, cleared localStorage cache.");
        }
    } catch (error) {
        console.error('Error saving events to localStorage:', error);
        if (error.name === 'QuotaExceededError') {
            console.warn('LocalStorage quota exceeded. Clearing cache and trying again.');
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            try {
                // Attempt to save again only if there are events to save
                if (sectionEvents.length > 0) {
                   localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sectionEvents));
                }
            } catch (innerError) {
                console.error('Still failed to save to localStorage after clearing:', innerError);
                // At this point, data might be lost if the page closes before next send attempt
            }
        }
    }
}

// Setup all UI interactions
function setupUIInteractions() {
    // Set up section dropdowns with event delegation
    const learningMaterials = document.querySelector('#learning-materials');
    if (learningMaterials) {
      learningMaterials.addEventListener('click', handleLearningMaterialsClick);
    } else {
        console.error("Element #learning-materials not found.");
    }

    // Setup inactivity modal button
    if (domElements.inactivityCloseButton) {
        domElements.inactivityCloseButton.addEventListener('click', handleUserReturn);
    } else {
        console.error("Inactivity modal close button not found.");
    }

    // Setup celebration modal
    setupCelebrationModal();

    // Set up disease info toggle
    setupDiseaseInfoToggle();

    // Initialize copy buttons
    initializeCopyButtons();

    // Initialize user info box display update interval
    setInterval(displayUserInfo, 30000); // Update time periodically
}

// Handle clicks within learning materials using event delegation
function handleLearningMaterialsClick(event) {
    // Handle section header clicks
    const header = event.target.closest('.section-header');
    if (header) {
        toggleSection(header);
        return; // Prevent other handlers if it was a header click
    }

    // Handle toggle answer buttons
    const toggleBtn = event.target.closest('.toggle-answer');
    if (toggleBtn) {
        toggleAnswer(toggleBtn);
        return;
    }

    // Handle celebration buttons
    const celebrateBtn = event.target.closest('.celebrate-button');
    if (celebrateBtn) {
        showCelebration(celebrateBtn);
        return;
    }
}

// Toggle section visibility
function toggleSection(header) {
    const isActive = header.classList.toggle('active');
    const content = header.nextElementSibling;
    const sectionId = header.querySelector('h2')?.getAttribute('id') || 'unknown-section'; // Safer access
    const icon = header.querySelector('.toggle-icon i');

    if (content) {
       content.classList.toggle('active');
       if (isActive) {
         content.style.maxHeight = content.scrollHeight + "px";
         if(icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
       } else {
         content.style.maxHeight = null;
          if(icon) icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
       }
    } else {
        console.warn("Section content not found for header:", header);
    }


    // Track section interaction
    trackSectionInteraction(sectionId, isActive);
}

// Toggle answer visibility
function toggleAnswer(button) {
    const answer = button.nextElementSibling;
    if (!answer || !answer.classList.contains('answer')) {
        console.warn("Answer element not found for button:", button);
        return;
    }

    const isVisible = answer.style.display === 'block';
    if (isVisible) {
        answer.style.display = 'none';
        button.innerHTML = '<i class="fas fa-lightbulb"></i> Show Answer';
    } else {
        answer.style.display = 'block';
        button.innerHTML = '<i class="fas fa-times"></i> Hide Answer';

        // Track that the user viewed an answer
        const challengeContainer = button.closest('.challenge');
        const challengeTitle = challengeContainer?.querySelector('h3')?.textContent || 'Unknown Challenge'; // Safer access

        trackEvent('answer_viewed', getCurrentSectionId(), challengeTitle);
    }
}

// Show celebration modal
function showCelebration(button) {
    const message = button.getAttribute('data-message');
    const animationType = button.getAttribute('data-animation');

    if (!domElements.celebrationMessage || !domElements.celebrationModal) {
        console.error("Celebration modal elements not found.");
        return;
    }

    // Show message in modal
    domElements.celebrationMessage.textContent = message || "Well done!"; // Default message
    domElements.celebrationModal.style.display = 'block';

    // Track this celebration event
    const challengeContainer = button.closest('.challenge');
    const challengeTitle = challengeContainer?.querySelector('h3')?.textContent || 'Unknown Challenge'; // Safer access

    trackEvent('challenge_completed', getCurrentSectionId(), challengeTitle);

    // Trigger confetti animation
    if (typeof confetti !== 'undefined' && confettiAnimations[animationType]) {
        confettiAnimations[animationType]();
    } else if (typeof confetti !== 'undefined') {
        console.warn(`Confetti animation type "${animationType}" not found, using default.`);
        confettiAnimations.center(); // Default animation
    } else {
         console.warn("Confetti library not loaded.");
    }
}

// Setup celebration modal
function setupCelebrationModal() {
    const closeButton = domElements.celebrationModal?.querySelector('.modal-close'); // Use cached modal element
     if (closeButton) {
        closeButton.addEventListener('click', function() {
            domElements.celebrationModal.style.display = 'none';
        });
    } else {
         console.error("Celebration modal close button not found.");
    }


    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (domElements.celebrationModal && event.target === domElements.celebrationModal) {
            domElements.celebrationModal.style.display = 'none';
        }
    });
}

// Add an event to the tracking queue
function trackEvent(type, sectionId, additionalInfo = '') {
    const username = getUsername();
    if (!username) return; // Don't track if user is not identified

    // Create the event object
    const newEvent = {
        type: type,
        sectionId: sectionId || getCurrentSectionId(), // Ensure sectionId is present
        startTime: new Date().toISOString(), // Use ISO string for consistency
        endTime: null,
        duration: 0,
        additionalInfo: additionalInfo,
        sessionId: sessionId,
        username: username,
        visibilitySession: visibilitySession // Include visibility session context
    };

    // Note: Removed the priority-based replacement logic.
    // The aggregation in processTrackingEvents handles combining heartbeats.
    // For other events, it's generally better to keep the sequence unless specifically needed.
    // If replacement is desired later, it can be added back here or in processing.

    sectionEvents.push(newEvent);
    // console.log("Tracked event:", newEvent); // Can be noisy, uncomment for debugging

    // Always save to localStorage when events are updated
    saveEventsToLocalStorage();
}

// Find an existing event (currently unused due to removal of replacement logic in trackEvent)
// function findExistingEvent(type, sectionId) { ... }

// Start periodic tracking (for saving to localStorage)
function startPeriodicTracking() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
    }

    trackingInterval = setInterval(function() {
        // Only save to localStorage, don't send data automatically
        if (!isTrackingPaused) { // Avoid saving during inactivity pause? Maybe still save? Let's save.
             saveEventsToLocalStorage();
        }
    }, TRACKING_INTERVAL);
    console.log("Periodic localStorage save started.");
}

// Show inactivity popup
function showInactivityPopup() {
    if (isTrackingPaused || !domElements.inactivityModal) {
        // Don't show if already paused or modal doesn't exist
        return;
    }

    console.log("Showing inactivity popup.");
    isTrackingPaused = true; // Pause tracking FIRST

    // Mark all active sections as inactive *before* showing popup
    const inactiveTime = new Date().toISOString();
    Object.keys(openSections).forEach(sectionId => {
        if (openSections[sectionId].isActive) {
            openSections[sectionId].isActive = false; // Update internal state

            // Add an inactive event to mark the end of the activity period
            trackEvent('inactive_due_to_popup', sectionId); // Use trackEvent for consistency
        }
    });

    // Show the popup
    domElements.inactivityModal.style.display = 'block';

    // Track this inactivity event itself
    trackEvent('inactivity_popup_shown', getCurrentSectionId());

    // Stop the heartbeat while inactive popup is shown
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        console.log("Heartbeat stopped due to inactivity popup.");
    }

    // Save current state to localStorage immediately
    saveEventsToLocalStorage();

    console.log("Tracking paused due to inactivity.");
}


function handleUserReturn() {
    if (!domElements.inactivityModal) return;

    console.log("User returned from inactivity.");
    domElements.inactivityModal.style.display = 'none';
    isTrackingPaused = false;
    lastUserActivity = new Date(); // Reset activity time

    // Create re-activation events for currently open sections
    const reactivateTime = new Date();
    const currentSectionId = getCurrentSectionId(); // Get section visible *now*

    Object.keys(openSections).forEach(sectionId => {
        // Track re-activation for *all* sections that were open when popup appeared
        trackEvent('re_activation', sectionId);

        // Update the section's last active time and state
        openSections[sectionId].lastActiveTime = reactivateTime;
        openSections[sectionId].isActive = (sectionId === currentSectionId); // Only the *current* one becomes active immediately
    });

    // Save updated events to localStorage
    saveEventsToLocalStorage();

    // Restart heartbeat
    startHeartbeat();

    // Reset the inactivity timeout
    resetInactivityTimeout();
}


// Reset inactivity timeout
function resetInactivityTimeout() {
    if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
    }
    // console.log("Resetting inactivity timeout for", INACTIVITY_THRESHOLD, "ms"); // Debug
    inactivityTimeout = setTimeout(function() {
        // Check visibility *and* if tracking is already paused
        if (isPageVisible && !isTrackingPaused) {
             console.log("Inactivity threshold reached.");
             showInactivityPopup();
        } else if (!isPageVisible) {
            console.log("Inactivity threshold reached, but page not visible.");
        } else if (isTrackingPaused) {
            console.log("Inactivity threshold reached, but tracking already paused.");
        }
    }, INACTIVITY_THRESHOLD);
}


// Set up visibility tracking
function setupVisibilityTracking() {
    let hidden, visibilityChange;
    if (typeof document.hidden !== "undefined") {
        hidden = "hidden"; visibilityChange = "visibilitychange";
    } else if (typeof document.msHidden !== "undefined") {
        hidden = "msHidden"; visibilityChange = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
        hidden = "webkitHidden"; visibilityChange = "webkitvisibilitychange";
    }

    if (typeof document.addEventListener === "undefined" || hidden === undefined) {
        console.warn("Page Visibility API not supported or vendor prefix needed.");
        return;
    }

    document.addEventListener(visibilityChange, function() {
        const wasVisible = isPageVisible;
        isPageVisible = !document[hidden];
        const timestamp = new Date();
        const currentSection = getCurrentSectionId();

        if (isPageVisible) {
            console.log("Page became visible.");
            // If returning from inactivity popup state while hidden, handle return
            if(isTrackingPaused) {
                console.log("Page became visible while inactivity popup was 'active' (logically). Handling user return.");
                // We don't call handleUserReturn directly as the popup wasn't visually interacted with.
                // Instead, reset state and restart timers.
                isTrackingPaused = false; // Unpause tracking
                lastUserActivity = timestamp;
                Object.keys(openSections).forEach(id => {
                    trackEvent('re_activation', id); // Mark reactivation
                    openSections[id].lastActiveTime = timestamp;
                    openSections[id].isActive = (id === currentSection);
                });
                startHeartbeat();
                resetInactivityTimeout();
            } else {
                // Normal visibility return
                visibilitySession = Date.now(); // Start new visibility session
                trackEvent('visibility_return', currentSection);
                lastUserActivity = timestamp;
                startHeartbeat(); // Restart heartbeat
                resetInactivityTimeout(); // Reset inactivity timer
            }
        } else {
            console.log("Page became hidden.");
            // Track visibility lost
            trackEvent('visibility_lost', currentSection);

            // Clear heartbeat interval when page becomes hidden
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
                console.log("Heartbeat stopped due to page hidden.");
            }

            // Clear inactivity timeout - it restarts on visibility return or if threshold hit while hidden (handled in reset logic)
             if (inactivityTimeout) {
                clearTimeout(inactivityTimeout);
            }
            // No need to call showInactivityPopup directly here, timeout handles it if needed.

            // Ensure current state is saved
            saveEventsToLocalStorage();
        }
    }, false);
}


// Efficiently throttle function calls
function throttle(func, delay) {
    let lastCall = 0;
    let timeoutId = null; // Store timeout ID

    return function(...args) {
        const now = Date.now();

        // Clear any existing timeout to prevent delayed execution if called again quickly
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }

        // If enough time has passed since the last direct call, execute immediately
        if (now - lastCall >= delay) {
            lastCall = now;
            func.apply(this, args);
        } else {
            // Otherwise, schedule execution after the remaining delay
            // This ensures the function runs eventually after the last trigger in a burst
            timeoutId = setTimeout(() => {
                lastCall = Date.now(); // Update lastCall time when the throttled call executes
                func.apply(this, args);
                timeoutId = null; // Clear timeout ID after execution
            }, delay - (now - lastCall));
        }
    };
}

// Set up activity monitoring with optimized events
function setupActivityMonitoring() {
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']; // Added click

    // Handle user activity - throttled
    const handleActivity = throttle(function(event) {
        // If tracking is paused (inactivity modal is visible), do nothing until user clicks "Resume"
        if (isTrackingPaused) {
            // console.log("Activity detected, but tracking is paused."); // Debug
            return;
        }

        // Only process if page is visible
        if (isPageVisible) {
            // console.log("User activity detected:", event.type); // Debug
            const now = new Date();
            lastUserActivity = now; // Update last activity time
            isUserActive = true; // Mark user as active

            // Reset the inactivity timeout
            resetInactivityTimeout();
        }
    }, THROTTLE_DELAY); // Throttle activity checks

    // Add event listeners for each activity event
    activityEvents.forEach(function(eventName) {
        document.addEventListener(eventName, handleActivity, { passive: true });
    });

     // Also reset activity on specific UI interactions not covered by basic events
    const learningMaterials = document.querySelector('#learning-materials');
    if (learningMaterials) {
      learningMaterials.addEventListener('click', handleActivity, { passive: true }); // Handle clicks on buttons etc.
    }
}

// Get the current visible section ID (improved visibility check)
function getCurrentSectionId() {
    let currentSectionId = 'unknown';
    let maxVisibility = 0; // Tracks percentage of element visible
    const viewportHeight = window.innerHeight;

    domElements.sectionHeaders?.forEach(header => { // Use optional chaining
        const content = header.nextElementSibling;
        if (!content || !content.classList.contains('active')) {
            return; // Skip inactive or non-existent content elements
        }

        const sectionId = header.querySelector('h2')?.getAttribute('id'); // Safer access
        if (!sectionId) return; // Skip headers without an identifiable h2 id

        const rect = content.getBoundingClientRect();

        // Basic check: If top is above viewport bottom and bottom is below viewport top
        if (rect.top < viewportHeight && rect.bottom > 0) {
            const visibleTop = Math.max(0, rect.top);
            const visibleBottom = Math.min(viewportHeight, rect.bottom);
            const visibleHeight = Math.max(0, visibleBottom - visibleTop);
            const elementHeight = rect.height;

            if (elementHeight > 0) {
                const visibilityPercentage = visibleHeight / elementHeight;
                // Prioritize the section with the largest *percentage* of itself visible
                // Only consider sections that are at least partially visible
                if (visibilityPercentage > 0 && visibilityPercentage > maxVisibility) {
                    maxVisibility = visibilityPercentage;
                    currentSectionId = sectionId;
                }
                // Alternative: Prioritize section taking up most *absolute* screen space
                // if (visibleHeight > maxVisibleHeight) {
                //    maxVisibleHeight = visibleHeight;
                //    currentSectionId = sectionId;
                // }
            }
        }
    });

    // If no active section is significantly visible, check if the header itself is visible
    if (currentSectionId === 'unknown') {
         domElements.sectionHeaders?.forEach(header => {
             if (!header.classList.contains('active')) return; // Only check active headers
             const sectionId = header.querySelector('h2')?.getAttribute('id');
             if (!sectionId) return;
             const rect = header.getBoundingClientRect();
             if (rect.top < viewportHeight && rect.bottom > 0) {
                 // If an active header is visible and no content dominated, assign it
                 currentSectionId = sectionId;
                 // Maybe add logic here to pick the *most* visible header if multiple qualify
                 return; // Exit loop once one is found (simple approach)
             }
         });
    }

    return currentSectionId;
}


// Start heartbeat mechanism (Improved Version)
function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    if (isTrackingPaused || !isPageVisible) {
        console.log("Heartbeat not started: Tracking paused or page hidden.");
        return; // Don't start if paused or hidden
    }

    // Use the existing visibilitySession ID
    console.log("Starting heartbeat with interval:", HEARTBEAT_INTERVAL, "ms for visibility session:", visibilitySession);

    heartbeatInterval = setInterval(function() {
        // Double-check conditions within interval
        if (isTrackingPaused || !isPageVisible) {
            // console.log("Heartbeat tick skipped: Tracking paused or page hidden."); // Debug
            clearInterval(heartbeatInterval); // Stop if conditions change
            heartbeatInterval = null;
            return;
        }

        const now = new Date();
        const currentSectionId = getCurrentSectionId();

        // Update internal state of open sections (isActive)
        Object.keys(openSections).forEach(sectionId => {
            openSections[sectionId].isActive = (sectionId === currentSectionId);
            if(openSections[sectionId].isActive) {
                 openSections[sectionId].lastActiveTime = now; // Update timestamp only for the active one
            }
        });

        // Generate heartbeat ONLY for the currently active section
        if (currentSectionId !== 'unknown' && openSections[currentSectionId]?.isActive) {
            const startTimeForBeat = new Date(now.getTime() - HEARTBEAT_INTERVAL); // Start of this interval
            const endTimeForBeat = now; // End of this interval
            const durationSeconds = Math.round(HEARTBEAT_INTERVAL / 1000);

            // Use trackEvent to add the heartbeat
            trackEvent('heartbeat', currentSectionId, `Duration: ${durationSeconds}s`); // Additional info is optional

            // Update the specific heartbeat event with precise timing and duration
            // Find the event just added (it will be the last one)
            const lastEvent = sectionEvents[sectionEvents.length - 1];
            if (lastEvent && lastEvent.type === 'heartbeat' && lastEvent.sectionId === currentSectionId) {
                lastEvent.startTime = startTimeForBeat.toISOString();
                lastEvent.endTime = endTimeForBeat.toISOString();
                lastEvent.duration = durationSeconds;
                 // Note: trackEvent already adds sessionId, username, visibilitySession
            }
        } else {
             // console.log("Heartbeat tick: No single active section determined or user inactive."); // Debug
        }

    }, HEARTBEAT_INTERVAL);
}


// Track section interactions efficiently
function trackSectionInteraction(sectionId, isOpening) {
    const timestamp = new Date();

    if (isOpening) {
        console.log(`Section opened: ${sectionId}`);
        // Mark other active sections as inactive first
        Object.keys(openSections).forEach(id => {
            if (openSections[id]?.isActive && id !== sectionId) {
                 console.log(`Marking previously active section ${id} as inactive.`);
                 openSections[id].isActive = false;
                // Optionally track 'became_inactive' event if needed, but heartbeat/visibility covers this mostly
            }
        });

        if (openSections[sectionId]) {
            // Section already exists in our tracker (e.g., user closed then quickly reopened)
            if (!openSections[sectionId].isActive) {
                // If it wasn't considered active, track reactivation
                 console.log(`Reactivating section: ${sectionId}`);
                 trackEvent('re_activation', sectionId);
                 openSections[sectionId].isActive = true;
                 openSections[sectionId].lastActiveTime = timestamp; // Reset active time
                 openSections[sectionId].startTime = timestamp; // Treat as a new "opening" start time for duration calculations? Or keep original? Let's reset.
            } else {
                // Already active, likely a double-click, do nothing? Or update timestamp?
                openSections[sectionId].lastActiveTime = timestamp; // Update last active time
            }
        } else {
            // New section being opened
             console.log(`Tracking new section opening: ${sectionId}`);
             openSections[sectionId] = {
                startTime: timestamp,
                isActive: true, // It becomes the active one
                lastActiveTime: timestamp
            };
             trackEvent('section_opened', sectionId);
        }
         // Ensure heartbeat and inactivity check reflect the change
        resetInactivityTimeout(); // User interaction occurred
        // Heartbeat will pick up the new active section on its next tick

    } else { // Section is closing
        console.log(`Section closed: ${sectionId}`);
        if (openSections[sectionId]) {
            trackEvent('section_closed', sectionId);
            // Update end time and duration for the 'section_opened' or 're_activation' event?
            // This is complex. Let's rely on 'active_on_exit'/'inactive_on_exit' for final duration.
            // Simply remove it from the 'open' list.
            delete openSections[sectionId];
        } else {
            console.warn(`Attempted to close section ${sectionId} which was not tracked as open.`);
        }
         resetInactivityTimeout(); // User interaction occurred
    }

    // Save state after any interaction
    saveEventsToLocalStorage();
}


// Process and combine tracking events - improved for better heartbeat aggregation
function processTrackingEvents(eventsToProcess) {
    if (!eventsToProcess || eventsToProcess.length === 0) {
        return [];
    }
    console.log(`Processing ${eventsToProcess.length} events for aggregation...`);

    const combinedEvents = [];
    const heartbeatBuffer = new Map(); // Buffer specifically for heartbeats: key -> [event, event, ...]

    // Non-heartbeat events pass through directly for now (could add other aggregation later)
    eventsToProcess.forEach(event => {
        if (event.type === 'heartbeat' && event.sectionId && event.visibilitySession) {
            // Group heartbeats by section AND visibility session
            const key = `${event.sectionId}_${event.visibilitySession}`;
            if (!heartbeatBuffer.has(key)) {
                heartbeatBuffer.set(key, []);
            }
            // Add essential info for aggregation
            heartbeatBuffer.get(key).push({
                startTime: event.startTime,
                endTime: event.endTime,
                duration: event.duration || Math.round(HEARTBEAT_INTERVAL / 1000), // Ensure duration
                username: event.username,
                sessionId: event.sessionId,
                // No need for additionalInfo here, it varies per beat
            });
        } else {
            // Pass non-heartbeat events directly
            combinedEvents.push(event);
        }
    });

    // Process the heartbeat buffer
    heartbeatBuffer.forEach((beats, key) => {
        if (beats.length === 0) return;

        // Sort beats by startTime to ensure correct aggregation order
        beats.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

        let currentAggregatedBeat = null;

        beats.forEach(beat => {
            if (!currentAggregatedBeat) {
                // Start a new aggregated beat
                currentAggregatedBeat = {
                    type: 'heartbeat_aggregated',
                    sectionId: key.split('_')[0], // Extract from key
                    visibilitySession: parseInt(key.split('_')[1], 10), // Extract from key
                    startTime: beat.startTime,
                    endTime: beat.endTime,
                    duration: beat.duration,
                    beatCount: 1,
                    username: beat.username, // Assume consistent within session
                    sessionId: beat.sessionId, // Assume consistent within session
                    lastUpdateTime: new Date().toISOString() // Add timestamp
                };
            } else {
                // Check if this beat is contiguous with the current aggregated one
                // Allow a small gap (e.g., slightly more than interval) for timing variations
                const timeDiff = new Date(beat.startTime) - new Date(currentAggregatedBeat.endTime);
                const maxGap = HEARTBEAT_INTERVAL * 1.5; // Allow 1.5x interval gap

                if (timeDiff >= 0 && timeDiff <= maxGap) {
                    // Merge contiguous beat
                    currentAggregatedBeat.endTime = beat.endTime; // Extend end time
                    currentAggregatedBeat.duration += beat.duration; // Add duration
                    currentAggregatedBeat.beatCount += 1;
                    currentAggregatedBeat.lastUpdateTime = new Date().toISOString(); // Update timestamp
                } else {
                    // Gap detected, push the completed aggregated beat and start a new one
                    combinedEvents.push(currentAggregatedBeat);
                    currentAggregatedBeat = {
                        type: 'heartbeat_aggregated',
                        sectionId: key.split('_')[0],
                        visibilitySession: parseInt(key.split('_')[1], 10),
                        startTime: beat.startTime,
                        endTime: beat.endTime,
                        duration: beat.duration,
                        beatCount: 1,
                        username: beat.username,
                        sessionId: beat.sessionId,
                        lastUpdateTime: new Date().toISOString()
                    };
                }
            }
        });

        // Push the last aggregated beat if it exists
        if (currentAggregatedBeat) {
            combinedEvents.push(currentAggregatedBeat);
        }
    });

    // Add lastUpdateTime to non-aggregated events too before returning
     combinedEvents.forEach(event => {
         if (!event.lastUpdateTime && event.type !== 'heartbeat_aggregated') {
            event.lastUpdateTime = new Date().toISOString();
         }
         // Ensure essential fields are present
         event.username = event.username || getUsername();
         event.sessionId = event.sessionId || sessionId;
         // Remove potentially large/redundant additionalInfo from aggregated heartbeats
         if (event.type === 'heartbeat_aggregated') {
             delete event.additionalInfo;
         }
     });


    console.log(`Processed into ${combinedEvents.length} events after aggregation.`);
    return combinedEvents;
}


// Send tracking data (Revised for unload reliability)
function sendTrackingData(isSync = false) {
    // 1. Determine events to send
    let eventsToSend = [];
    let source = ""; // For logging

    if (isSync) { // Unload scenario
        source = "localStorage (unload)";
        try {
            const cachedData = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (cachedData) {
                eventsToSend = JSON.parse(cachedData);
                 console.log(`Loaded ${eventsToSend.length} events from ${source} for final send.`);
            } else {
                // Fallback to in-memory IF storage is empty (shouldn't happen if save worked)
                source = "in-memory (unload fallback)";
                eventsToSend = [...sectionEvents];
                 console.log(`localStorage empty on unload, using ${eventsToSend.length} events from ${source}.`);
            }
        } catch (error) {
            console.error('Error reading localStorage on unload:', error);
            source = "in-memory (unload error fallback)";
            eventsToSend = [...sectionEvents]; // Fallback to in-memory on error
            console.log(`localStorage error on unload, using ${eventsToSend.length} events from ${source}.`);
        }
    } else { // Non-unload scenario (e.g., sending cached data on load)
        source = "in-memory (non-unload)";
        // This path is currently only used by sendCachedDataOnLoad, which passes events directly.
        // If implementing periodic *sends* later, this logic would be used.
        console.warn("sendTrackingData called with isSync=false. This path is usually handled by sendCachedDataOnLoad.");
        eventsToSend = [...sectionEvents]; // Use current in-memory events
    }

    // 2. Check if there's anything to send
    if (eventsToSend.length === 0) {
        console.log(`sendTrackingData (${source}): No events to send.`);
        // If triggered on unload from empty storage, clear just in case it had invalid data
        if (isSync && source.includes("localStorage")) localStorage.removeItem(LOCAL_STORAGE_KEY);
        return;
    }

    // 3. Handle non-unload case: Just save to localStorage (original logic, though maybe redundant now)
    if (!isSync) {
        console.log(`sendTrackingData (${source}): Non-sync call, saving ${eventsToSend.length} events to localStorage only.`);
        saveEventsToLocalStorage(); // Ensure latest state is saved
        return;
    }

    // 4. Process for UNLOAD event (isSync = true)
    console.log(`sendTrackingData (${source}): Processing ${eventsToSend.length} events for synchronous (unload) send.`);
    const username = getUsername();
    if (!username) {
        console.error("Cannot send data on unload: Username not found. Data remains in localStorage.");
        // DO NOT CLEAR localStorage if we can't send
        return;
    }

    lastUpdateTime = new Date().toISOString(); // Update time just before sending

    // Process events (aggregation, etc.) - Crucially, use the events loaded/retrieved above
    const processedEvents = processTrackingEvents(eventsToSend);

    if (processedEvents.length === 0) {
        console.log(`sendTrackingData (${source}): No events remaining after processing. Clearing localStorage if loaded from it.`);
        if (source.includes("localStorage")) localStorage.removeItem(LOCAL_STORAGE_KEY);
        sectionEvents = []; // Clear in-memory too
        return;
    }

     const data = {
        username: username,
        url: window.location.href,
        events: processedEvents,
        timestamp: new Date().toISOString(), // Use current time for the batch timestamp
        sessionId: sessionId,
        lastUpdateTime: lastUpdateTime, // Keep this for consistency if your sheet uses it
        reason: "unload_send" // Add context
    };

    // 5. Use ONLY sendBeacon for unload
    if (navigator.sendBeacon) {
        try {
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });

            // Check blob size (optional but good practice)
            if (blob.size > 60000) { // Approx 60KB limit check
                console.warn(`Data size (${blob.size} bytes) is large for sendBeacon, might fail.`);
            }

            console.log("Attempting sendBeacon with payload:", data); // Log payload before sending
            const sent = navigator.sendBeacon(APPS_SCRIPT_URL, blob);

            if (sent) {
                console.log(`sendBeacon successfully initiated for ${processedEvents.length} processed events. Clearing localStorage.`);
                // ***** Clear localStorage ONLY if beacon call was successfully initiated *****
                localStorage.removeItem(LOCAL_STORAGE_KEY);
                // Clear in-memory array too, as page is closing
                sectionEvents = [];
                // Mark as sent to prevent potential duplicate calls if both pagehide/beforeunload fire weirdly
                hasSentUnloadData = true;
            } else {
                console.error('sendBeacon failed to initiate. Data remains in localStorage.');
                // Data is *not* lost, it's still in localStorage.
                // It will be picked up by loadCachedEvents on the *next* page load.
                // Do NOT clear localStorage here.
            }
        } catch (error) {
            console.error('Error during sendBeacon preparation/call:', error);
            console.error('Data remains in localStorage.');
            // Data remains in localStorage. Do NOT clear.
        }
    } else {
        console.warn('navigator.sendBeacon is not supported. Data cannot be sent reliably on unload. Data remains in localStorage.');
        // Data remains in localStorage. No reliable fallback. Do NOT clear.
    }
}


// Get username with caching
const usernameCache = {
    value: null,
    timestamp: 0,
    checked: false // Flag to avoid multiple redirects if lookup fails
};

function getUsername() {
    // Return cached username if valid (cache for 5 minutes)
    if (usernameCache.value && Date.now() - usernameCache.timestamp < 300000) {
        return usernameCache.value;
    }
     // If we already tried and failed (and redirected), don't try again immediately
    if (usernameCache.checked && !usernameCache.value) {
        return null;
    }


    try {
        const accountsData = localStorage.getItem('accounts');
        usernameCache.checked = true; // Mark that we've tried to check

        if (accountsData) {
            const accounts = JSON.parse(accountsData);
            // Check if accounts is an array and has at least one entry with a username
            if (Array.isArray(accounts) && accounts.length > 0 && accounts[0] && typeof accounts[0].username === 'string' && accounts[0].username.trim() !== '') {
                // Update cache
                usernameCache.value = accounts[0].username.trim();
                usernameCache.timestamp = Date.now();
                 // console.log("Retrieved username:", usernameCache.value); // Debug
                return usernameCache.value;
            } else {
                console.error('Username not found in localStorage accounts data. Redirecting to sign-in.');
                 // Avoid infinite redirects if already on sign-in page
                 if (!window.location.href.includes('SOM-PMTHA_signin.html')) {
                   window.location.href = SIGN_IN_URL;
                 }
                 return null; // No valid username found
            }
        } else {
            console.error('No accounts data found in localStorage. Redirecting to sign-in.');
            if (!window.location.href.includes('SOM-PMTHA_signin.html')) {
               window.location.href = SIGN_IN_URL;
            }
            return null; // No accounts data
        }
    } catch (error) {
        console.error('Error retrieving username from localStorage:', error);
         usernameCache.checked = true; // Mark as checked even on error
         if (!window.location.href.includes('SOM-PMTHA_signin.html')) {
            window.location.href = SIGN_IN_URL; // Redirect on error
         }
         return null;
    }
}

// Handle page unload (called by beforeunload and pagehide) - Revised
function handlePageUnload(event) {
    // Prevent sending multiple times if both events fire close together
    if (hasSentUnloadData) {
         // console.log("handlePageUnload: Already attempted send, skipping."); // Debug
        return;
    }

    console.log(`handlePageUnload triggered by: ${event.type}`);

    // 1. Capture final state for all currently open sections
    const exitTime = new Date();
    const username = getUsername(); // Get username once

    Object.keys(openSections).forEach(sectionId => {
        const section = openSections[sectionId];
        if (!section) return; // Should not happen, but safety check

        // Avoid adding duplicate exit events if somehow called twice rapidly
        const alreadyHasExitEvent = sectionEvents.some(e =>
            e.sectionId === sectionId &&
            e.sessionId === sessionId && // Check session ID too
            (e.type === 'active_on_exit' || e.type === 'inactive_on_exit')
        );

        if (!alreadyHasExitEvent) {
             const durationSeconds = section.startTime ? (exitTime - new Date(section.startTime)) / 1000 : 0;
             const eventType = section.isActive ? 'active_on_exit' : 'inactive_on_exit';

             console.log(`Adding final event: ${eventType} for ${sectionId}, duration: ${durationSeconds.toFixed(2)}s`);

             // Use trackEvent structure, but add directly as it's the final step
             sectionEvents.push({
                type: eventType,
                sectionId: sectionId,
                startTime: section.startTime ? new Date(section.startTime).toISOString() : exitTime.toISOString(), // Start of the section's current open period
                endTime: exitTime.toISOString(), // Mark exit time
                duration: Math.max(0, durationSeconds), // Ensure non-negative duration
                sessionId: sessionId,
                username: username,
                visibilitySession: visibilitySession // Include last visibility session context
             });
        }
    });

    // 2. Save session state (for potential restore on next visit)
    saveSessionState();

    // 3. Ensure *all* events, including final ones, are saved to localStorage *before* attempting send
    console.log(`Saving final state (${sectionEvents.length} events) to localStorage before unload send attempt.`);
    saveEventsToLocalStorage(); // CRITICAL STEP

    // 4. Attempt to send the final batch using sendBeacon logic
    // Check both memory and storage as sendTrackingData prioritizes storage on unload
    if (sectionEvents.length > 0 || localStorage.getItem(LOCAL_STORAGE_KEY)) {
       console.log(`Calling sendTrackingData(true) for final unload send.`);
       sendTrackingData(true); // isSync = true triggers beacon logic
       // hasSentUnloadData flag is set *inside* sendTrackingData if beacon initiates successfully
    } else {
       console.log("No events in memory or localStorage to send on unload.");
       hasSentUnloadData = true; // Mark as "processed" even if nothing to send
    }
}


// Save session state (UI state, not event data)
function saveSessionState() {
    try {
        const openSectionIds = Object.keys(openSections);
        let lastActiveSection = getCurrentSectionId(); // Get the *truly* current one on save

        const state = {
            timestamp: new Date().toISOString(),
            openSectionIds: openSectionIds,
            lastActiveSection: lastActiveSection,
            // Add scroll position? Potentially complex
            // scrollY: window.scrollY
        };

        localStorage.setItem('sessionState', JSON.stringify(state));
        // console.log("Saved session UI state:", state); // Debug
    } catch (error) {
        console.error('Error saving session UI state:', error);
    }
}

// Check for previous session (UI state)
function checkForPreviousSession() {
    try {
        const savedData = localStorage.getItem('sessionState');
        if (savedData) {
            const sessionData = JSON.parse(savedData);
            const lastSessionTime = new Date(sessionData.timestamp);
            const hoursSinceLastSession = (new Date() - lastSessionTime) / (1000 * 60 * 60);

            // Restore if session was recent (e.g., less than 2 hours ago)
            if (hoursSinceLastSession < 2) {
                console.log("Recent session state found, restoring UI...");
                restorePreviousSession(sessionData);
            } else {
                console.log("Previous session state is too old, discarding.");
                localStorage.removeItem('sessionState');
            }
        } else {
             console.log("No previous session UI state found.");
        }
    } catch (error) {
        console.error('Error checking for previous session state:', error);
        localStorage.removeItem('sessionState'); // Remove potentially corrupted state
    }
}

// Restore previous session (UI state)
function restorePreviousSession(sessionData) {
    try {
        if (sessionData.openSectionIds && Array.isArray(sessionData.openSectionIds)) {
            let restoredActiveSection = false;
             console.log("Restoring open sections:", sessionData.openSectionIds);

            sessionData.openSectionIds.forEach(sectionId => {
                const header = document.querySelector(`.section-header h2#${sectionId}`)?.closest('.section-header'); // More robust selector
                if (header) {
                    const content = header.nextElementSibling;
                    if (content) {
                        // Open the section visually
                        header.classList.add('active');
                        content.classList.add('active');
                         content.style.maxHeight = content.scrollHeight + "px"; // Set height
                         const icon = header.querySelector('.toggle-icon i');
                         if(icon) icon.classList.replace('fa-chevron-down', 'fa-chevron-up');


                        // Re-populate the openSections tracker without firing new 'section_opened' events
                        const now = new Date();
                        openSections[sectionId] = {
                            startTime: now, // Treat restore time as new start for this session's tracking
                            isActive: (sectionId === sessionData.lastActiveSection), // Set active based on saved state
                            lastActiveTime: now
                        };

                         if (openSections[sectionId].isActive) {
                            restoredActiveSection = true;
                         }

                        // Track the restoration itself
                        trackEvent('session_restored', sectionId, `Restored open section`);
                    } else {
                         console.warn(`Content not found for restored section header: ${sectionId}`);
                    }
                } else {
                     console.warn(`Header not found for restored section ID: ${sectionId}`);
                }
            });

             // If the explicitly saved active section wasn't found/restored, try getCurrentSectionId
            if (!restoredActiveSection && Object.keys(openSections).length > 0) {
                const currentActualSection = getCurrentSectionId();
                if(openSections[currentActualSection]) {
                    openSections[currentActualSection].isActive = true;
                    console.log(`Restored active section defaulted to current visible: ${currentActualSection}`);
                }
            }


            // Scroll to last active section if it was restored
            if (sessionData.lastActiveSection && openSections[sessionData.lastActiveSection]) {
                 console.log(`Scrolling to last active section: ${sessionData.lastActiveSection}`);
                 const element = document.getElementById(sessionData.lastActiveSection);
                 if (element) {
                    // Use setTimeout to ensure layout is stable after restoring sections
                    setTimeout(() => {
                       element.scrollIntoView({ behavior: 'smooth', block: 'center' }); // 'center' might be better
                    }, 100); // Small delay
                 }
            }
        }
         // Clear the saved state after restoring to prevent re-restoring on refresh
         localStorage.removeItem('sessionState');
         saveEventsToLocalStorage(); // Save the 'session_restored' events

    } catch (error) {
        console.error('Error restoring previous session state:', error);
    }
}


// Initialize copy buttons
function initializeCopyButtons() {
    domElements.copyButtons?.forEach(button => { // Use optional chaining
        button.addEventListener('click', function() {
            const container = this.closest('.code-block-container');
            if (!container) return;

            const codeBlock = container.querySelector('.code-block');
            const feedback = container.querySelector('.copy-feedback');
            const blockName = container.getAttribute('data-block-name') || 'unknown-code-block';

            if (!codeBlock || !navigator.clipboard) {
                console.error("Code block or clipboard API not available.");
                if(feedback) feedback.textContent = 'Error copying';
                return;
            }

            navigator.clipboard.writeText(codeBlock.textContent)
                .then(() => {
                    if (feedback) {
                       feedback.textContent = 'Copied!';
                       feedback.classList.add('show');
                       setTimeout(() => {
                           feedback.classList.remove('show');
                           feedback.textContent = 'Copied!'; // Reset text
                       }, 2000);
                    }
                    trackCodeCopy(blockName); // Track the copy action
                })
                .catch(err => {
                    console.error('Failed to copy code:', err);
                     if (feedback) {
                       feedback.textContent = 'Copy failed';
                       feedback.classList.add('show');
                        setTimeout(() => {
                           feedback.classList.remove('show');
                           feedback.textContent = 'Copied!'; // Reset text
                       }, 2000);
                    }
                });
        });
    });
}


// Track code copy (Uses separate endpoint)
async function trackCodeCopy(blockName) {
    const username = getUsername();
    if (!username) return;

    try {
        const data = {
            type: 'code_copy',
            username: username,
            timestamp: new Date().toISOString(),
            blockName: blockName,
            pageUrl: window.location.href,
            sessionId: sessionId // Include session ID
        };

        // Using fetch with no-cors as we don't need a response from this endpoint
        await fetch(COPY_TRACKING_URL, {
            method: 'POST',
            headers: {
                // 'Content-Type': 'application/json' // Often omitted/ignored with no-cors + text/plain default
                 'Content-Type': 'text/plain', // Apps Script doPost often prefers text/plain for simple POSTs
            },
            body: JSON.stringify(data), // Send data as JSON string in body
            mode: 'no-cors', // Don't expect a CORS-compliant response
            keepalive: false // Not critical for this immediate action
        });
         // console.log("Tracked code copy:", blockName); // Debug
    } catch (error) {
        console.error('Error tracking code copy:', error);
    }
}

// Setup disease info toggle
function setupDiseaseInfoToggle() {
    function toggleDiseaseInfo(event) {
        // Prevent click on title from propagating if preview is also clicked
        event.stopPropagation();

        if (!domElements.diseaseTitle || !domElements.diseaseContent || !domElements.diseasePreview) {
            console.error("Disease info elements not found.");
            return;
        }

        const isExpanded = domElements.diseaseTitle.classList.contains('expanded');

        if (isExpanded) {
            domElements.diseaseTitle.classList.remove('expanded');
            domElements.diseaseContent.style.display = 'none';
            domElements.diseasePreview.style.display = 'block';
            // Track collapse? Optional.
        } else {
            domElements.diseaseTitle.classList.add('expanded');
            domElements.diseaseContent.style.display = 'block';
            domElements.diseasePreview.style.display = 'none';
            // Track expansion
            trackUserInteraction('disease_info_expanded', 'Lou-Greig Disease');
        }
    }

    if (domElements.diseaseTitle) {
        domElements.diseaseTitle.addEventListener('click', toggleDiseaseInfo);
        domElements.diseaseTitle.style.cursor = 'pointer'; // Indicate clickable
    }
    if (domElements.diseasePreview) {
        domElements.diseasePreview.addEventListener('click', toggleDiseaseInfo);
        domElements.diseasePreview.style.cursor = 'pointer'; // Indicate clickable
    }

    // Setup reaction buttons within this section
    setupReactionButtons();
}

// Setup reaction buttons
function setupReactionButtons() {
    const reactionContainer = document.querySelector('.reaction-container');
    if (!reactionContainer) return;

    reactionContainer.addEventListener('click', function(event) {
        const button = event.target.closest('.reaction-button');
        if (!button) return; // Click wasn't on a reaction button

        const reactionType = button.getAttribute('data-reaction');
        if (!reactionType) return;

        // Visual feedback: Toggle 'selected' class
        const wasSelected = button.classList.contains('selected');
        // Remove 'selected' from all buttons first
        reactionContainer.querySelectorAll('.reaction-button').forEach(btn => btn.classList.remove('selected'));
        // Add 'selected' only if it wasn't already selected (allows deselecting)
        if (!wasSelected) {
            button.classList.add('selected');
        }

        // Show text feedback
        const feedbackElement = reactionContainer.querySelector('.reaction-feedback');
        if (feedbackElement) {
            feedbackElement.classList.add('show');
            setTimeout(() => feedbackElement.classList.remove('show'), 3000);
        }

        // Track the interaction (track even if deselecting, maybe add value 'deselected'?)
        const valueToSend = wasSelected ? `${reactionType}_deselected` : reactionType;
        trackUserInteraction('disease_info_reaction', valueToSend);
    });
}

// Track user interactions with extra info (Uses separate endpoint)
async function trackUserInteraction(interactionType, interactionValue) {
     const username = getUsername();
    if (!username) return;

    try {
        const data = {
            type: interactionType,
            username: username,
            timestamp: new Date().toISOString(),
            value: interactionValue,
            pageUrl: window.location.href,
            sessionId: sessionId // Include session ID
        };

        // Using fetch with no-cors
        await fetch(EXTRA_INFO_INTERACTION_URL, {
            method: 'POST',
             headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify(data),
            mode: 'no-cors',
            keepalive: false
        });
        // console.log("Tracked user interaction:", interactionType, interactionValue); // Debug
    } catch (error) {
        console.error('Error tracking user interaction:', error);
    }
}


// Initialize Python interpreter (Pyodide)
async function initializePython() {
    if (!domElements.statusElement || !domElements.runButton) {
        console.error("Status element or run button not found, cannot initialize Python.");
        return null;
    }
    try {
        domElements.statusElement.textContent = 'Loading Python core...';
        console.log("Loading Pyodide...");
        // Ensure Pyodide is loaded from the correct URL if needed
        // const pyodideUrl = "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"; // Example CDN URL
        // pyodide = await loadPyodide({ indexURL: pyodideUrl });
        pyodide = await loadPyodide(); // Assumes default CDN path works
        console.log("Pyodide core loaded.");

        domElements.statusElement.textContent = `Loading ${requiredPackages.join(', ')}... This may take a moment.`;
        console.log(`Loading Python packages: ${requiredPackages.join(', ')}`);

        // Set up stdout/stderr redirection
        pyodide.setStdout({ batched: (msg) => appendToOutputArea(msg) });
        pyodide.setStderr({ batched: (msg) => appendToOutputArea(`Error: ${msg}`) });

        // Load required packages
        await pyodide.loadPackage(requiredPackages);
        console.log("Required Python packages loaded.");

        // Update UI
        domElements.statusElement.textContent = 'Python is ready!';
        domElements.runButton.disabled = false;
        if (domElements.clearButton) domElements.clearButton.disabled = false;

        // Set up run and clear buttons
        setupPythonButtons(pyodide);

        return pyodide;

    } catch (error) {
        domElements.statusElement.textContent = `Error loading Python: ${error.message}`;
        console.error('Python loading error:', error);
        domElements.runButton.disabled = true;
         if (domElements.clearButton) domElements.clearButton.disabled = true;
        return null;
    }
}

// Set up Python buttons
function setupPythonButtons(pyodideInstance) {
     if (!domElements.runButton || !domElements.clearButton || !domElements.codeInput || !domElements.outputArea || !domElements.statusElement) {
        console.error("Cannot setup Python buttons: One or more required DOM elements are missing.");
        return;
    }
    // Run button
    domElements.runButton.addEventListener('click', async () => {
        if (!pyodideInstance) {
            appendToOutputArea("Error: Python (Pyodide) is not loaded yet.");
            return;
        }

        const pythonCode = domElements.codeInput.value;
        if (!pythonCode.trim()) {
            appendToOutputArea("Warning: No Python code entered.");
            return;
        }

        domElements.outputArea.textContent = ''; // Clear previous output
        domElements.statusElement.textContent = 'Running code...';
        domElements.runButton.disabled = true;
        domElements.clearButton.disabled = true;

        console.log("Executing Python code...");
        try {
            // Capture stdout/stderr during execution
            let stdout = '';
            let stderr = '';
            pyodideInstance.setStdout({ batched: (msg) => { stdout += msg + '\n'; } });
            pyodideInstance.setStderr({ batched: (msg) => { stderr += msg + '\n'; } });

            let result = await pyodideInstance.runPythonAsync(pythonCode);

             // Restore default stdout/stderr handlers
            pyodideInstance.setStdout({ batched: (msg) => appendToOutputArea(msg) });
            pyodideInstance.setStderr({ batched: (msg) => appendToOutputArea(`Error: ${msg}`) });

            // Display captured output first, then result if any
            if (stdout) appendToOutputArea(stdout.trimEnd());
            if (stderr) appendToOutputArea(`Error: ${stderr.trimEnd()}`);
             if (result !== undefined && result !== null) {
                 appendToOutputArea(`Result: ${result.toString()}`); // Display return value if applicable
            }


            domElements.statusElement.textContent = 'Execution complete.';
             console.log("Python execution finished.");

        } catch (error) {
            console.error("Python execution error:", error);
             // Restore default handlers even on error
            pyodideInstance.setStdout({ batched: (msg) => appendToOutputArea(msg) });
            pyodideInstance.setStderr({ batched: (msg) => appendToOutputArea(`Error: ${msg}`) });
            // Display error in output area
            appendToOutputArea(`\n--- Python Execution Error --- \n${error.message}\n--------------------------`);
            domElements.statusElement.textContent = 'Error during execution.';
        } finally {
            domElements.runButton.disabled = false;
            domElements.clearButton.disabled = false;
        }
    });

    // Clear button
    domElements.clearButton.addEventListener('click', () => {
         if (domElements.outputArea) domElements.outputArea.textContent = '';
         if (domElements.statusElement) domElements.statusElement.textContent = 'Output cleared. Python is ready.';
          console.log("Python output cleared.");
    });
}

// Append text to output area
function appendToOutputArea(message) {
     if (domElements.outputArea) {
        // Sanitize message slightly? Optional.
        domElements.outputArea.textContent += message + (message.endsWith('\n') ? '' : '\n');
        domElements.outputArea.scrollTop = domElements.outputArea.scrollHeight; // Scroll to bottom
    } else {
        console.warn("Output area DOM element not found, cannot append message:", message);
    }
}


// --- User Info Box Display ---
function displayUserInfo() {
    const username = getUsername(); // Use the cached getter

    if (domElements.usernameDisplay) {
        domElements.usernameDisplay.textContent = username || 'Not logged in';
    }
    if (domElements.accessTimeDisplay) {
        domElements.accessTimeDisplay.textContent = new Date().toLocaleTimeString();
    }
    if (domElements.currentUrlDisplay) {
        domElements.currentUrlDisplay.textContent = window.location.pathname.split('/').pop(); // Show page name
    }
    // Could add status messages here later, e.g., "Saving data..."
    // if (domElements.statusMessageDisplay) { ... }
}


// --- Confetti Animations ---
// NUS color variables for confetti
const nusBlue = '#003D7C';
const nusOrange = '#EF7C00';
const nusLightBlue = '#4D7CAE';

// Optimized confetti animations
const confettiAnimations = {
    center: function() {
        if (typeof confetti !== 'undefined') {
            confetti({
                particleCount: 150, spread: 160, origin: { x: 0.5, y: 0.6 },
                colors: [nusBlue, nusOrange, nusLightBlue, '#ffffff']
            });
        } else console.warn("Confetti function not found for 'center' animation.");
    },
    sides: function() {
         if (typeof confetti !== 'undefined') {
            confetti({ // Left
                particleCount: 80, angle: 60, spread: 55, origin: { x: 0, y: 0.65 },
                colors: [nusBlue, nusLightBlue, '#ffffff']
            });
            setTimeout(() => confetti({ // Right
                particleCount: 80, angle: 120, spread: 55, origin: { x: 1, y: 0.65 },
                colors: [nusOrange, nusLightBlue, '#ffffff']
            }), 150);
         } else console.warn("Confetti function not found for 'sides' animation.");
    },
    fireworks: function() {
        if (typeof confetti !== 'undefined') {
            const duration = 1500;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
            function randomInRange(min, max) { return Math.random() * (max - min) + min; }

            function fireworkFrame() {
                const timeLeft = animationEnd - Date.now();
                if (timeLeft <= 0 || typeof confetti === 'undefined') return; // Stop if confetti disappears or time runs out
                const particleCount = 50 * (timeLeft / duration);
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }, colors: [nusBlue, nusLightBlue, '#ffffff'] }));
                confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }, colors: [nusOrange, nusLightBlue, '#ffffff'] }));
                requestAnimationFrame(fireworkFrame);
            }
            requestAnimationFrame(fireworkFrame);
         } else console.warn("Confetti function not found for 'fireworks' animation.");
    },
    school: function() {
         if (typeof confetti !== 'undefined') {
            confetti({ // Blue
                particleCount: 100, startVelocity: 30, spread: 360, origin: { x: 0.5, y: 0.3 },
                colors: [nusBlue], shapes: ['square'], scalar: 0.8
            });
            setTimeout(() => confetti({ // Orange
                particleCount: 100, startVelocity: 30, spread: 360, origin: { x: 0.5, y: 0.3 },
                colors: [nusOrange], shapes: ['circle'], scalar: 0.8
            }), 300);
         } else console.warn("Confetti function not found for 'school' animation.");
    }
};

// --- END OF FILE template_JS_learning_page_v20-2.js ---
