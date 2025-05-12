// Replace with your deployed Google Apps Script Web App URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzSxyvmPYsdnimwhEj572QuTvow9nTpkc13rOd1rQY9neh0mp-a4Bx5p6tERWRzR9d1tA/exec';
const SIGN_IN_URL = 'https://xchee-01.github.io/PMTHA/SOM-PMTHA_signin.html'; // Redirection target
const COPY_TRACKING_URL = 'https://script.google.com/macros/s/AKfycbz88biGq3GAIfH77lEt_IeWcRbBrZ8r2K-4Z5C0foZDMHQGsuqaGIvhGOBKA5eqW65_AA/exec';
const EXTRA_INFO_INTERACTION_URL = 'https://script.google.com/macros/s/AKfycbxXHMDDEnZq0krPyE96d22zEp3DqdLmwO74OsSRW1Rq_JvHEYRXc5IgnaV-6J1l4o_GQ/exec';

// Configuration and constants
const TRACKING_INTERVAL = 30000; // 30 seconds for periodic tracking
const HEARTBEAT_INTERVAL = 2000; // 2 seconds for heartbeat
const INACTIVITY_THRESHOLD = 10000; // 10 seconds until user is considered inactive (for testing, can be increased)
const THROTTLE_DELAY = 1000; // Throttle delay for frequent events
const LOCAL_STORAGE_KEY = 'tracking_events_cache'; // Key for localStorage tracking cache

// Required packages for Pyodide
const requiredPackages = ['numpy', 'pandas'];

// Global variables
let pyodide;
let openSections = {};
let sectionEvents = [];
let trackingInterval = null;
let lastUserActivity = new Date();
let isPageVisible = true;
let isUserActive = true; // General flag, updated by activity monitoring
let heartbeatInterval = null;
let activityTimeout = null;
let sessionId = generateSessionId();
let inactivityTimeout = null;
let isTrackingPaused = false; // Specifically for inactivity popup state
let visibilitySession = Date.now();
let lastUpdateTime = new Date().toISOString(); // Track last update time
let currentUsername = null; // To store the validated username

// Event priority mapping (higher number = higher priority)
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
    // NEW events for clarity around inactivity if needed, though section_closed/opened might suffice
    // 'section_interaction_paused': 3,
    // 'section_interaction_resumed': 3
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
    modalClose: document.querySelector('.modal-close'), // General modal close for celebration
    inactivityCloseButton: document.querySelector('#inactivityModal .modal-close'), // Specific for inactivity
    usernameDisplay: document.getElementById('username'), // For user info box
    accessTimeDisplay: document.getElementById('access-time'),
    currentUrlDisplay: document.getElementById('current-url')
};

// Optimized initialization function
document.addEventListener('DOMContentLoaded', function() {
    currentUsername = getUsername(); // Attempt to get username

    if (!currentUsername) {
        // If no username, redirect to sign-in page with current URL as redirect parameter
        const redirectUrl = SIGN_IN_URL + '?redirect=' + encodeURIComponent(window.location.href);
        window.location.href = redirectUrl;
        return; // Stop further script execution on this page
    }

    // If username exists, proceed with page initialization
    if (domElements.usernameDisplay) domElements.usernameDisplay.textContent = currentUsername;
    if (domElements.accessTimeDisplay) domElements.accessTimeDisplay.textContent = new Date().toLocaleString();
    if (domElements.currentUrlDisplay) domElements.currentUrlDisplay.textContent = window.location.href;

    initializeTracking();
    setupUIInteractions();
    initializePython();
});

// Generate a unique session ID
function generateSessionId() {
    return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

// Optimized tracking initialization
function initializeTracking() {
    loadCachedEvents();
    startPeriodicTracking();
    startHeartbeat();
    setupVisibilityTracking();
    setupActivityMonitoring();
    resetInactivityTimeout();
    window.addEventListener('beforeunload', handlePageUnload);
    checkForPreviousSession();
}

// Load cached events from localStorage
function loadCachedEvents() {
    try {
        const cachedData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cachedData) {
            const parsedData = JSON.parse(cachedData);
            if (Array.isArray(parsedData)) {
                sectionEvents = [...parsedData, ...sectionEvents];
                console.log(`Loaded ${parsedData.length} cached events from localStorage`);
            }
        }
    } catch (error) {
        console.error('Error loading cached events:', error);
    }
}

// Save events to localStorage
function saveEventsToLocalStorage() {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sectionEvents));
    } catch (error) {
        console.error('Error saving events to localStorage:', error);
        if (error.name === 'QuotaExceededError') {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sectionEvents));
            } catch (innerError) {
                console.error('Still failed to save after clearing:', innerError);
            }
        }
    }
}

// Setup all UI interactions
function setupUIInteractions() {
    document.querySelector('#learning-materials').addEventListener('click', handleLearningMaterialsClick);
    if (domElements.inactivityCloseButton) {
        domElements.inactivityCloseButton.addEventListener('click', handleUserReturnFromInactivity);
    }
    setupCelebrationModal();
    setupDiseaseInfoToggle();
    initializeCopyButtons();
}

// Handle clicks within learning materials using event delegation
function handleLearningMaterialsClick(event) {
    if (event.target.closest('.section-header')) {
        toggleSection(event.target.closest('.section-header'));
    }
    if (event.target.closest('.toggle-answer')) {
        toggleAnswer(event.target.closest('.toggle-answer'));
    }
    if (event.target.closest('.celebrate-button')) {
        showCelebration(event.target.closest('.celebrate-button'));
    }
}

// Toggle section visibility
function toggleSection(header) {
    header.classList.toggle('active');
    const content = header.nextElementSibling;
    const sectionId = header.querySelector('h2').getAttribute('id');
    const isOpening = content.classList.toggle('active');
    trackSectionInteraction(sectionId, isOpening);
}

// Toggle answer visibility
function toggleAnswer(button) {
    const answer = button.nextElementSibling;
    if (answer.style.display === 'block') {
        answer.style.display = 'none';
        button.innerHTML = '<i class="fas fa-lightbulb"></i> Show Answer';
    } else {
        answer.style.display = 'block';
        button.innerHTML = '<i class="fas fa-times"></i> Hide Answer';
        const challengeContainer = button.closest('.challenge');
        const challengeTitle = challengeContainer ? challengeContainer.querySelector('h3').textContent : 'Unknown Challenge';
        trackEvent('answer_viewed', getCurrentSectionId(), challengeTitle);
    }
}

// Show celebration modal
function showCelebration(button) {
    const message = button.getAttribute('data-message');
    const animationType = button.getAttribute('data-animation');
    domElements.celebrationMessage.textContent = message;
    domElements.celebrationModal.style.display = 'block';
    const challengeContainer = button.closest('.challenge');
    const challengeTitle = challengeContainer ? challengeContainer.querySelector('h3').textContent : 'Unknown Challenge';
    trackEvent('challenge_completed', getCurrentSectionId(), challengeTitle);
    if (confettiAnimations[animationType]) {
        confettiAnimations[animationType]();
    } else {
        confettiAnimations.center();
    }
}

// Setup celebration modal
function setupCelebrationModal() {
    if (domElements.modalClose) { // Ensure general modal close exists (for celebration)
       domElements.modalClose.addEventListener('click', function() {
            if (domElements.celebrationModal) domElements.celebrationModal.style.display = 'none';
        });
    }
    window.addEventListener('click', function(event) {
        if (domElements.celebrationModal && event.target === domElements.celebrationModal) {
            domElements.celebrationModal.style.display = 'none';
        }
         if (domElements.inactivityModal && event.target === domElements.inactivityModal) {
            // Do not close inactivity modal by clicking outside, only by button
        }
    });
}

// Add an event to the tracking queue
function trackEvent(type, sectionId, additionalInfo = '') {
    const newEvent = {
        type: type,
        sectionId: sectionId,
        startTime: new Date(),
        endTime: null,
        duration: 0,
        additionalInfo: additionalInfo
    };
    const existingEventIndex = findExistingEvent(type, sectionId);
    if (existingEventIndex >= 0) {
        const existingEvent = sectionEvents[existingEventIndex];
        const existingPriority = EVENT_PRIORITY[existingEvent.type] || 0;
        const newPriority = EVENT_PRIORITY[type] || 0;
        if (newPriority >= existingPriority) {
            sectionEvents[existingEventIndex] = newEvent;
        }
    } else {
        sectionEvents.push(newEvent);
    }
    saveEventsToLocalStorage();
}

// Find an existing event with the same type and sectionId
function findExistingEvent(type, sectionId) {
    for (let i = 0; i < sectionEvents.length; i++) {
        if (sectionEvents[i].type === type && sectionEvents[i].sectionId === sectionId) {
            return i;
        }
    }
    return -1;
}

// Start periodic tracking
function startPeriodicTracking() {
    if (trackingInterval) clearInterval(trackingInterval);
    trackingInterval = setInterval(function() {
        if (sectionEvents.length > 0 && !isTrackingPaused) {
            sendTrackingData();
        }
    }, TRACKING_INTERVAL);
}

// Show inactivity popup
function showInactivityPopup() {
    if (!isTrackingPaused) { // Only show if not already paused (popup not already shown)
        isTrackingPaused = true; // Pause general tracking activities

        const currentSectionBeforeInactivity = getCurrentSectionId();
        if (openSections[currentSectionBeforeInactivity]) {
            // Effectively "close" the current section interaction before showing the popup
            // This logs a 'section_closed' event, marking the end of the current active period.
            trackSectionInteraction(currentSectionBeforeInactivity, false);
            console.log(`Section ${currentSectionBeforeInactivity} interaction paused due to inactivity.`);
        }

        if (domElements.inactivityModal) domElements.inactivityModal.style.display = 'block';

        sectionEvents.push({
            type: 'inactivity_popup_shown',
            sectionId: currentSectionBeforeInactivity, // Log which section user was on
            startTime: new Date(),
            endTime: null,
            duration: '' // Duration not applicable here
        });
        saveEventsToLocalStorage();
        sendTrackingData(); // Send data immediately, including the 'section_closed' and 'inactivity_popup_shown'
        console.log("Tracking paused due to inactivity popup.");
    }
}

// Handle user return from inactivity
function handleUserReturnFromInactivity() {
    if (domElements.inactivityModal) domElements.inactivityModal.style.display = 'none';
    isTrackingPaused = false; // Resume tracking activities
    lastUserActivity = new Date(); // Update last activity time
    isUserActive = true; // Mark user as active again

    const currentSectionOnReturn = getCurrentSectionId();
    // "Re-open" the interaction with the current section.
    // This will log a 'section_opened' or 're_activation' event, starting a new active period.
    trackSectionInteraction(currentSectionOnReturn, true);
    console.log(`User returned. Section ${currentSectionOnReturn} interaction resumed.`);

    resetInactivityTimeout(); // Restart the inactivity timer
    startHeartbeat(); // Ensure heartbeat is running
}


// Reset inactivity timeout
function resetInactivityTimeout() {
    if (inactivityTimeout) clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(function() {
        if (isPageVisible && isUserActive && !isTrackingPaused) { // Added !isTrackingPaused
            showInactivityPopup();
        }
    }, INACTIVITY_THRESHOLD);
}

// Set up visibility tracking
function setupVisibilityTracking() {
    let hidden, visibilityChange;
    if (typeof document.hidden !== "undefined") {
        hidden = "hidden";
        visibilityChange = "visibilitychange";
    } else if (typeof document.msHidden !== "undefined") {
        hidden = "msHidden";
        visibilityChange = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
        hidden = "webkitHidden";
        visibilityChange = "webkitvisibilitychange";
    }

    document.addEventListener(visibilityChange, function() {
        isPageVisible = !document[hidden];
        const timestamp = new Date();

        if (isPageVisible) {
            console.log("Page became visible.");
            sectionEvents.push({
                type: 'visibility_return',
                sectionId: getCurrentSectionId(),
                startTime: timestamp,
                endTime: null,
                duration: null
            });
            lastUserActivity = timestamp; // Update activity time
            isUserActive = true; // Assume active on return
            
            // If returning after inactivity popup was shown, user needs to click "Resume"
            // So, don't automatically hide popup here if it's already showing.
            if (!isTrackingPaused) {
                 resetInactivityTimeout(); // Reset timer only if not already paused by popup
                 startHeartbeat(); // Restart heartbeat
            }

        } else {
            console.log("Page became hidden.");
            sectionEvents.push({
                type: 'visibility_lost',
                sectionId: getCurrentSectionId(),
                startTime: timestamp,
                endTime: null,
                duration: 0
            });
            isUserActive = false; // Assume inactive when page is hidden
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
            if (inactivityTimeout) {
                clearTimeout(inactivityTimeout); // Clear screen-based inactivity timer
            }
            // When page is hidden, send pending data.
            // Don't show inactivity popup if page is hidden.
        }
        saveEventsToLocalStorage();
        sendTrackingData(); // Send visibility change event immediately
    });
}


// Efficiently throttle function calls
function throttle(func, delay) {
    let lastCall = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastCall < delay) return;
        lastCall = now;
        return func(...args);
    };
}

// Set up activity monitoring with optimized events
function setupActivityMonitoring() {
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    const handleActivity = throttle(function() {
        if (isTrackingPaused) return; // If inactivity popup is shown, user must click "resume"

        if (isPageVisible) {
            const now = new Date();
            if (!isUserActive) { // If user was previously inactive
                // This could be a place to log a "user became active again" event if needed
                // For now, just update the state.
                console.log("User became active (interaction detected).");
            }
            isUserActive = true;
            lastUserActivity = now;
            resetInactivityTimeout(); // This will clear old timeout and set a new one
        }
    }, THROTTLE_DELAY); // Throttle to once per second

    activityEvents.forEach(function(eventName) {
        document.addEventListener(eventName, handleActivity, { passive: true });
    });

    // Initial check for user activity state
    resetInactivityTimeout(); // Start the first inactivity timer
}


// Get the current visible section ID
function getCurrentSectionId() {
    let currentSectionId = 'unknown_section'; // Default if no sections or none are active
    let maxVisibleArea = 0;

    const activeSections = document.querySelectorAll('.section-content.active');
    if (activeSections.length === 0 && openSections) {
        // Fallback: if no section content is 'active' but we have 'openSections' tracked,
        // return the last one that was considered active, if available.
        const openSectionKeys = Object.keys(openSections);
        if (openSectionKeys.length > 0) {
            // This logic might need refinement depending on how 'openSections' is managed
            // For now, let's pick the last one added or one marked as 'isActive' if such a flag exists
            const lastOpened = openSectionKeys.reverse().find(key => openSections[key].isActive);
            if (lastOpened) return lastOpened;
            if (openSectionKeys.length > 0) return openSectionKeys[openSectionKeys.length -1]; // Fallback to last opened
        }
    }


    document.querySelectorAll('.section-header').forEach(header => {
        const content = header.nextElementSibling;
        const sectionH2 = header.querySelector('h2');
        if (!sectionH2 || !sectionH2.getAttribute('id')) return; // Skip if no ID

        const sectionId = sectionH2.getAttribute('id');

        if (content.classList.contains('active')) { // Only consider sections whose content is visible
            const rect = content.getBoundingClientRect();
            const windowHeight = window.innerHeight || document.documentElement.clientHeight;
            const windowWidth = window.innerWidth || document.documentElement.clientWidth;

            // Calculate visible portion of the element
            const visibleTop = Math.max(0, rect.top);
            const visibleBottom = Math.min(windowHeight, rect.bottom);
            const visibleLeft = Math.max(0, rect.left);
            const visibleRight = Math.min(windowWidth, rect.right);

            const visibleHeight = Math.max(0, visibleBottom - visibleTop);
            const visibleWidth = Math.max(0, visibleRight - visibleLeft);
            const visibleArea = visibleHeight * visibleWidth;

            if (visibleArea > maxVisibleArea) {
                maxVisibleArea = visibleArea;
                currentSectionId = sectionId;
            }
        }
    });
    return currentSectionId;
}

// Start heartbeat mechanism
function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    visibilitySession = Date.now();

    heartbeatInterval = setInterval(function() {
        if (!isTrackingPaused && isPageVisible && isUserActive) { // Check isUserActive as well
            const now = new Date();
            const currentSectionId = getCurrentSectionId();

            // Ensure the currentSectionId is valid and corresponds to an open section
            if (currentSectionId !== 'unknown_section' && openSections[currentSectionId] && openSections[currentSectionId].isActive) {
                const sectionData = openSections[currentSectionId];

                const startTimeForThisHeartbeat = new Date(now.getTime() - HEARTBEAT_INTERVAL);
                const endTimeForThisHeartbeat = now;
                const individualHeartbeatDuration = Math.round(HEARTBEAT_INTERVAL / 1000);

                const heartbeatEvent = {
                    type: 'heartbeat',
                    sectionId: currentSectionId, // Use the most visible section
                    startTime: startTimeForThisHeartbeat.toISOString(),
                    endTime: endTimeForThisHeartbeat.toISOString(),
                    duration: individualHeartbeatDuration,
                    visibilitySession: visibilitySession,
                    sessionId: sessionId,
                    username: getUsername() // Ensure username is consistently fetched
                };
                sectionEvents.push(heartbeatEvent);
                saveEventsToLocalStorage();
                sectionData.lastActiveTime = now; // Update last active time for this section
            }
        }
    }, HEARTBEAT_INTERVAL);
    console.log("Heartbeat started/restarted with interval:", HEARTBEAT_INTERVAL, "ms");
}

// Track section interactions efficiently
function trackSectionInteraction(sectionId, isOpening) {
    const timestamp = new Date();

    if (isOpening) {
        // Mark other active sections as inactive IF they were previously considered active.
        Object.keys(openSections).forEach(id => {
            if (openSections[id].isActive && id !== sectionId) {
                // Optionally, log that another section became 'backgrounded'
                // openSections[id].isActive = false; // This state is more for focus
                // For now, let's not automatically close others unless UX dictates it
            }
        });

        if (openSections[sectionId]) { // Section exists
            if (!openSections[sectionId].isActive) { // Was not active, now becoming active
                sectionEvents.push({
                    type: 're_activation',
                    sectionId: sectionId,
                    startTime: timestamp,
                    endTime: null,
                    duration: 0
                });
                openSections[sectionId].isActive = true;
                openSections[sectionId].lastActiveTime = timestamp;
                 console.log(`Section re-activated: ${sectionId}`);
            } else {
                // Already open and active, likely a redundant call or scroll focus change.
                // No new event, but update last active time.
                openSections[sectionId].lastActiveTime = timestamp;
            }
        } else { // New section being opened
            openSections[sectionId] = {
                startTime: timestamp,
                isActive: true, // Newly opened section is active
                lastActiveTime: timestamp
            };
            sectionEvents.push({
                type: 'section_opened',
                sectionId: sectionId,
                startTime: timestamp,
                endTime: null,
                duration: 0
            });
            console.log(`Section opened: ${sectionId}`);
        }
    } else { // Section being closed
        if (openSections[sectionId]) {
            // Calculate duration if it was active
            let duration = 0;
            if (openSections[sectionId].isActive && openSections[sectionId].lastActiveTime) {
                 duration = Math.round((timestamp - openSections[sectionId].startTime) / 1000);
            }

            sectionEvents.push({
                type: 'section_closed',
                sectionId: sectionId,
                startTime: openSections[sectionId].startTime, // Use original open time
                endTime: timestamp, // Current time is close time
                duration: duration // Total duration it was open
            });
            console.log(`Section closed: ${sectionId}, duration: ${duration}s`);
            delete openSections[sectionId]; // Remove from tracked open sections
        }
    }
    saveEventsToLocalStorage();
}


// Process and combine tracking events
function processTrackingEvents(events) {
    const combinedEvents = [];
    const eventMap = new Map();

    events.forEach(event => {
        const eventKey = `${event.sessionId || sessionId}_${event.username || getUsername()}_${window.location.href}_section_tracking_${event.sectionId}_${event.type}`;

        if (eventMap.has(eventKey)) {
            const existingEvent = eventMap.get(eventKey);
            if (event.type === 'heartbeat') {
                existingEvent.duration = (existingEvent.duration || 0) + (event.duration || 0);
                if (new Date(event.startTime) < new Date(existingEvent.startTime)) {
                    existingEvent.startTime = event.startTime;
                }
                if (event.endTime) {
                    if (!existingEvent.endTime || new Date(event.endTime) > new Date(existingEvent.endTime)) {
                        existingEvent.endTime = event.endTime;
                    }
                }
            } else if (EVENT_PRIORITY[event.type] >= EVENT_PRIORITY[existingEvent.type]) {
                eventMap.set(eventKey, { ...event });
            }
        } else {
            const newEventToAdd = { ...event };
            if (newEventToAdd.type === 'heartbeat' && !newEventToAdd.endTime && newEventToAdd.startTime && newEventToAdd.duration) {
                newEventToAdd.endTime = new Date(new Date(newEventToAdd.startTime).getTime() + (newEventToAdd.duration * 1000)).toISOString();
            } else if (newEventToAdd.type === 'heartbeat' && !newEventToAdd.endTime && newEventToAdd.startTime) {
                newEventToAdd.endTime = newEventToAdd.startTime;
            }
            eventMap.set(eventKey, newEventToAdd);
        }
    });

    eventMap.forEach(event => {
        event.lastUpdateTime = new Date().toISOString();
        combinedEvents.push(event);
    });
    return combinedEvents;
}

// Send tracking data to server with batching
function sendTrackingData(isSync = false) {
    if (sectionEvents.length === 0) return; // Don't send if no events (removed isTrackingPaused check here, as some events like popup_shown should send even if paused)

    lastUpdateTime = new Date().toISOString();
    const username = getUsername();
    if (!username) {
        console.warn("Attempted to send tracking data without a username. Aborting send.");
        // Potentially re-cache events if needed, or handle this state.
        // For now, just don't send. The initial redirect should prevent this.
        return;
    }

    const eventsCopy = [...sectionEvents];
    sectionEvents = [];

    const processedEvents = processTrackingEvents(eventsCopy);
    if (processedEvents.length === 0) return; // No events after processing

    const data = {
        username: username,
        url: window.location.href,
        events: processedEvents,
        timestamp: lastUpdateTime,
        sessionId: sessionId,
        lastUpdateTime: lastUpdateTime
    };

    if (isSync && navigator.sendBeacon) {
        try {
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            const beaconSent = navigator.sendBeacon(APPS_SCRIPT_URL, blob);
            if (beaconSent) {
                localStorage.removeItem(LOCAL_STORAGE_KEY);
                 console.log("Beacon data sent successfully.");
            } else {
                console.error('Beacon send failed. Re-caching events.');
                sectionEvents = [...eventsCopy, ...sectionEvents]; // Put events back
                saveEventsToLocalStorage();
            }
        } catch (error) {
            console.error('Beacon error:', error);
            sectionEvents = [...eventsCopy, ...sectionEvents];
            saveEventsToLocalStorage();
        }
        return;
    }

    fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        mode: 'no-cors' // 'no-cors' means we won't get a response back, but request will be made
    })
    .then(() => {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        console.log("Tracking data sent via fetch.");
    })
    .catch(error => {
        console.error('Tracking error (fetch):', error);
        sectionEvents = [...eventsCopy, ...sectionEvents];
        saveEventsToLocalStorage();
    });
}


// Get username (modified for mandatory login)
function getUsername() {
    // This function now just *retrieves*. The redirect logic is in DOMContentLoaded.
    if (currentUsername) return currentUsername; // Return already validated username

    try {
        const accountsData = localStorage.getItem('accounts');
        if (accountsData) {
            const accounts = JSON.parse(accountsData);
            if (accounts && accounts.length > 0 && accounts[0].username) {
                return accounts[0].username;
            }
        }
    } catch (error) {
        console.error("Error retrieving username from localStorage:", error);
    }
    return null; // Return null if no username found
}


// Handle page unload
function handlePageUnload() {
    const exitTime = new Date();
    Object.keys(openSections).forEach(sectionId => {
        const section = openSections[sectionId];
        let duration = (exitTime - new Date(section.startTime)) / 1000; // Recalculate total duration

        // Determine if active at the very end
        // isUserActive might be false if page hid then unload, but section was active before hiding
        let eventType = 'inactive_on_exit';
        if (section.isActive && isPageVisible) { // Consider active if section.isActive and page is still visible
            eventType = 'active_on_exit';
        }

        sectionEvents.push({
            type: eventType,
            sectionId: sectionId,
            startTime: section.startTime,
            endTime: exitTime.toISOString(),
            duration: Math.round(duration)
        });
    });
    saveSessionState();
    saveEventsToLocalStorage();
    if (sectionEvents.length > 0) {
        sendTrackingData(true); // Use sendBeacon if available
    }
}

// Save session state
function saveSessionState() {
    try {
        const openSectionIds = Object.keys(openSections);
        let lastActiveSection = getCurrentSectionId(); // Get most relevant section at time of unload

        localStorage.setItem('sectionState', JSON.stringify({
            timestamp: new Date().toISOString(),
            openSectionIds: openSectionIds,
            lastActiveSection: lastActiveSection,
            // Save openSections state if needed for more precise restoration
            // openSectionsSnapshot: JSON.parse(JSON.stringify(openSections)) // Deep copy
        }));
    } catch (error) {
        console.error('Session save error:', error);
    }
}

// Check for previous session
function checkForPreviousSession() {
    try {
        const savedData = localStorage.getItem('sectionState');
        if (savedData) {
            const sessionData = JSON.parse(savedData);
            const lastSessionTime = new Date(sessionData.timestamp);
            const hoursSinceLastSession = (new Date() - lastSessionTime) / (1000 * 60 * 60);

            if (hoursSinceLastSession < 2) { // Restore if less than 2 hours old
                restorePreviousSession(sessionData);
            } else {
                localStorage.removeItem('sectionState'); // Clear old session state
            }
        }
    } catch (error) {
        console.error('Session check error:', error);
    }
}

// Restore previous session
function restorePreviousSession(sessionData) {
    try {
        if (sessionData.openSectionIds && sessionData.openSectionIds.length > 0) {
            console.log("Restoring previous session sections:", sessionData.openSectionIds);
            sessionData.openSectionIds.forEach(sectionId => {
                const sectionH2 = document.getElementById(sectionId);
                if (sectionH2) {
                    const header = sectionH2.closest('.section-header');
                    if (header && header.nextElementSibling) {
                        header.classList.add('active');
                        header.nextElementSibling.classList.add('active');

                        // Re-establish in openSections tracker.
                        // Use original startTime if available from a snapshot, else use current time.
                        // For simplicity, let's treat it as a fresh open for tracking purposes in the new session.
                        trackSectionInteraction(sectionId, true); // This will log section_opened or re_activation

                        // Log a specific session restoration event
                        sectionEvents.push({
                            type: 'session_restored_section_opened',
                            sectionId: sectionId,
                            startTime: new Date(),
                            endTime: null,
                            duration: 0,
                            additionalInfo: "Restored from previous session"
                        });
                    }
                }
            });
            saveEventsToLocalStorage();

            if (sessionData.lastActiveSection) {
                const element = document.getElementById(sessionData.lastActiveSection);
                if (element) {
                    // Scroll smoothly after a short delay to allow content to render
                    setTimeout(() => {
                         element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 500);
                }
            }
        }
    } catch (error) {
        console.error('Session restore error:', error);
    }
}


// Initialize copy buttons
function initializeCopyButtons() {
    domElements.copyButtons.forEach(button => {
        button.addEventListener('click', function() {
            const container = this.closest('.code-block-container');
            const codeBlock = container.querySelector('.code-block');
            const feedback = container.querySelector('.copy-feedback');
            const blockName = container.getAttribute('data-block-name') || 'Unknown Code Block';

            navigator.clipboard.writeText(codeBlock.textContent)
                .then(() => {
                    feedback.classList.add('show');
                    trackCodeCopy(blockName);
                    setTimeout(() => feedback.classList.remove('show'), 2000);
                })
                .catch(err => console.error('Copy error:', err));
        });
    });
}

// Track code copy
async function trackCodeCopy(blockName) {
    try {
        const username = getUsername();
        if (!username) return; // Don't track if no user
        const data = {
            type: 'code_copy',
            username: username,
            timestamp: new Date().toISOString(),
            blockName: blockName,
            pageUrl: window.location.href
        };
        await fetch(COPY_TRACKING_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            mode: 'no-cors'
        });
    } catch (error) {
        console.error('Copy tracking error:', error);
    }
}

// Setup disease info toggle
function setupDiseaseInfoToggle() {
    function toggleDiseaseInfo() {
        if (!domElements.diseaseTitle || !domElements.diseaseContent || !domElements.diseasePreview) return;
        const isExpanded = domElements.diseaseTitle.classList.contains('expanded');
        if (isExpanded) {
            domElements.diseaseTitle.classList.remove('expanded');
            domElements.diseaseContent.style.display = 'none';
            domElements.diseasePreview.style.display = 'block';
        } else {
            domElements.diseaseTitle.classList.add('expanded');
            domElements.diseaseContent.style.display = 'block';
            domElements.diseasePreview.style.display = 'none';
            trackUserInteraction('disease_info_expanded', 'Lou-Greig Disease');
        }
    }
    if (domElements.diseaseTitle) domElements.diseaseTitle.addEventListener('click', toggleDiseaseInfo);
    if (domElements.diseasePreview) domElements.diseasePreview.addEventListener('click', toggleDiseaseInfo);
    setupReactionButtons();
}

// Setup reaction buttons
function setupReactionButtons() {
    const reactionContainer = document.querySelector('.reaction-container');
    if (reactionContainer) {
        reactionContainer.addEventListener('click', function(event) {
            const button = event.target.closest('.reaction-button');
            if (!button) return;
            const reactionType = button.getAttribute('data-reaction');
            document.querySelectorAll('.reaction-button').forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');
            const feedback = document.querySelector('.reaction-feedback');
            if (feedback) {
                feedback.classList.add('show');
                setTimeout(() => feedback.classList.remove('show'), 3000);
            }
            trackUserInteraction('disease_info_reaction', reactionType);
        });
    }
}

// Track user interactions with extra info
async function trackUserInteraction(interactionType, interactionValue) {
    try {
        const username = getUsername();
        if (!username) return; // Don't track if no user
        const data = {
            type: interactionType,
            username: username,
            timestamp: new Date().toISOString(),
            value: interactionValue,
            pageUrl: window.location.href
        };
        await fetch(EXTRA_INFO_INTERACTION_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            mode: 'no-cors'
        });
    } catch (error) {
        console.error('Interaction tracking error:', error);
    }
}

// Initialize Python interpreter
async function initializePython() {
    try {
        domElements.statusElement.textContent = 'Loading Python core...';
        pyodide = await loadPyodide();
        domElements.statusElement.textContent = 'Loading Python libraries... This may take a moment.';
        pyodide.setStdout({ batched: (msg) => appendToOutputArea(msg) });
        pyodide.setStderr({ batched: (msg) => appendToOutputArea(`Error: ${msg}`) });
        await pyodide.loadPackage(requiredPackages);
        domElements.statusElement.textContent = 'Python is ready!';
        domElements.runButton.disabled = false;
        setupPythonButtons(pyodide);
        return pyodide;
    } catch (error) {
        domElements.statusElement.textContent = `Error loading Python: ${error}`;
        console.error('Python loading error:', error);
        domElements.runButton.disabled = true;
        return null;
    }
}

// Set up Python buttons
function setupPythonButtons(pyodideInstance) { // Renamed parameter to avoid conflict with global pyodide
    domElements.runButton.addEventListener('click', async () => {
        if (!pyodideInstance) {
            appendToOutputArea("Error: Python is not loaded yet.");
            return;
        }
        const pythonCode = domElements.codeInput.value;
        domElements.outputArea.textContent = '';
        domElements.statusElement.textContent = 'Running code...';
        domElements.runButton.disabled = true;
        domElements.clearButton.disabled = true;
        try {
            await pyodideInstance.runPythonAsync(pythonCode);
            domElements.statusElement.textContent = 'Execution complete.';
        } catch (error) {
            appendToOutputArea(`\n--- Execution Error --- \n${error}\n--------------------`);
            domElements.statusElement.textContent = 'Error during execution.';
        } finally {
            domElements.runButton.disabled = false;
            domElements.clearButton.disabled = false;
        }
    });
    domElements.clearButton.addEventListener('click', () => {
        domElements.outputArea.textContent = '';
        domElements.statusElement.textContent = 'Output cleared. Python is ready.';
    });
}

// Append text to output area
function appendToOutputArea(message) {
    domElements.outputArea.textContent += message + (message.endsWith('\n') ? '' : '\n');
    domElements.outputArea.scrollTop = domElements.outputArea.scrollHeight;
}

// NUS color variables for confetti
const nusBlue = '#003D7C';
const nusOrange = '#EF7C00';
const nusLightBlue = '#4D7CAE';

// Optimized confetti animations (unchanged from your version)
const confettiAnimations = {
    center: function() { confetti({ particleCount: 150, spread: 160, origin: { x: 0.5, y: 0.6 }, colors: [nusBlue, nusOrange, nusLightBlue, '#ffffff'] }); },
    sides: function() {
        confetti({ particleCount: 80, angle: 60, spread: 55, origin: { x: 0, y: 0.65 }, colors: [nusBlue, nusLightBlue, '#ffffff'] });
        setTimeout(() => { confetti({ particleCount: 80, angle: 120, spread: 55, origin: { x: 1, y: 0.65 }, colors: [nusOrange, nusLightBlue, '#ffffff'] }); }, 150);
    },
    fireworks: function() {
        const duration = 1500; const animationEnd = Date.now() + duration; const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
        function randomInRange(min, max) { return Math.random() * (max - min) + min; }
        function fireworkFrame() {
            const timeLeft = animationEnd - Date.now(); if (timeLeft <= 0) return;
            const particleCount = 50 * (timeLeft / duration);
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }, colors: [nusBlue, nusLightBlue, '#ffffff'] }));
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }, colors: [nusOrange, nusLightBlue, '#ffffff'] }));
            requestAnimationFrame(fireworkFrame);
        }
        requestAnimationFrame(fireworkFrame);
    },
    school: function() {
        confetti({ particleCount: 100, startVelocity: 30, spread: 360, origin: { x: 0.5, y: 0.3 }, colors: [nusBlue], shapes: ['square'], scalar: 0.8 });
        setTimeout(() => { confetti({ particleCount: 100, startVelocity: 30, spread: 360, origin: { x: 0.5, y: 0.3 }, colors: [nusOrange], shapes: ['circle'], scalar: 0.8 }); }, 300);
    }
};
