// Replace with your deployed Google Apps Script Web App URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzSxyvmPYsdnimwhEj572QuTvow9nTpkc13rOd1rQY9neh0mp-a4Bx5p6tERWRzR9d1tA/exec';
const SIGN_IN_URL = 'https://xchee-01.github.io/PMTHA/SOM-PMTHA_signin.html';
const COPY_TRACKING_URL = 'https://script.google.com/macros/s/AKfycbz88biGq3GAIfH77lEt_IeWcRbBrZ8r2K-4Z5C0foZDMHQGsuqaGIvhGOBKA5eqW65_AA/exec';
const EXTRA_INFO_INTERACTION_URL = 'https://script.google.com/macros/s/AKfycbxXHMDDEnZq0krPyE96d22zEp3DqdLmwO74OsxSRW1Rq_JvHEYRXc5IgnaV-6J1l4o_GQ/exec';

// Configuration and constants
const TRACKING_INTERVAL = 5000; // 5 seconds for periodic tracking
const HEARTBEAT_INTERVAL = 5000; // 5 seconds for heartbeat
const INACTIVITY_THRESHOLD = 10000; // 10 seconds until user is considered inactive
const THROTTLE_DELAY = 1000; // Throttle delay for frequent events

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
let activityTimeout = null;
let sessionId = generateSessionId();
let inactivityTimeout = null;
let isTrackingPaused = false;
let visibilitySession = Date.now();


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
    'inactivity_popup_shown': 3
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
    modalClose: document.querySelector('.modal-close'),
    inactivityCloseButton: document.querySelector('#inactivityModal .modal-close')
};

// Optimized initialization function
document.addEventListener('DOMContentLoaded', function() {
    // Initialize enhanced tracking system
    initializeTracking();
    
    // Setup UI interactions
    setupUIInteractions();
    
    // Initialize Python
    initializePython();
});

// Generate a unique session ID
function generateSessionId() {
    return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

// Optimized tracking initialization
function initializeTracking() {
    // Start periodic tracking for active sections
    startPeriodicTracking();
    
    // Start heartbeat for continuous monitoring
    startHeartbeat();
    
    // Set up Page Visibility API
    setupVisibilityTracking();
    
    // Set up user activity monitoring
    setupActivityMonitoring();
    
    // Set initial inactivity timeout
    resetInactivityTimeout();
    
    // Save session state on unload
    window.addEventListener('beforeunload', handlePageUnload);
    
    // Check for previous session
    checkForPreviousSession();
}

// Setup all UI interactions
function setupUIInteractions() {
    // Set up section dropdowns with event delegation
    document.querySelector('#learning-materials').addEventListener('click', handleLearningMaterialsClick);
    
    // Setup inactivity modal button
    if (domElements.inactivityCloseButton) {
        domElements.inactivityCloseButton.addEventListener('click', handleUserReturn);
    }
    
    // Setup celebration modal
    setupCelebrationModal();
    
    // Set up disease info toggle
    setupDiseaseInfoToggle();
    
    // Initialize copy buttons
    initializeCopyButtons();
}

// Handle clicks within learning materials using event delegation
function handleLearningMaterialsClick(event) {
    // Handle section header clicks
    if (event.target.closest('.section-header')) {
        const header = event.target.closest('.section-header');
        toggleSection(header);
    }
    
    // Handle toggle answer buttons
    if (event.target.closest('.toggle-answer')) {
        const button = event.target.closest('.toggle-answer');
        toggleAnswer(button);
    }
    
    // Handle celebration buttons
    if (event.target.closest('.celebrate-button')) {
        const button = event.target.closest('.celebrate-button');
        showCelebration(button);
    }
}

// Toggle section visibility
function toggleSection(header) {
    header.classList.toggle('active');
    const content = header.nextElementSibling;
    const sectionId = header.querySelector('h2').getAttribute('id');
    
    content.classList.toggle('active');
    
    // Track section interaction
    trackSectionInteraction(sectionId, content.classList.contains('active'));
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
        
        // Track that the user viewed an answer
        const challengeContainer = button.closest('.challenge');
        const challengeTitle = challengeContainer ? challengeContainer.querySelector('h3').textContent : 'Unknown Challenge';
        
        trackEvent('answer_viewed', getCurrentSectionId(), challengeTitle);
    }
}

// Show celebration modal
function showCelebration(button) {
    const message = button.getAttribute('data-message');
    const animationType = button.getAttribute('data-animation');
    
    // Show message in modal
    domElements.celebrationMessage.textContent = message;
    domElements.celebrationModal.style.display = 'block';
    
    // Track this celebration event
    const challengeContainer = button.closest('.challenge');
    const challengeTitle = challengeContainer ? challengeContainer.querySelector('h3').textContent : 'Unknown Challenge';
    
    trackEvent('challenge_completed', getCurrentSectionId(), challengeTitle);
    
    // Trigger confetti animation
    if (confettiAnimations[animationType]) {
        confettiAnimations[animationType]();
    } else {
        confettiAnimations.center(); // Default animation
    }
}

// Setup celebration modal
function setupCelebrationModal() {
    // Close modal when close button is clicked
    document.querySelector('.modal-close').addEventListener('click', function() {
        domElements.celebrationModal.style.display = 'none';
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target === domElements.celebrationModal) {
            domElements.celebrationModal.style.display = 'none';
        }
    });
}

// Add an event to the tracking queue
function trackEvent(type, sectionId, additionalInfo = '') {
    // Create the event object
    const newEvent = {
        type: type,
        sectionId: sectionId,
        startTime: new Date(),
        endTime: null,
        duration: 0,
        additionalInfo: additionalInfo
    };
    
    // Check if we already have an identical event in the queue
    const existingEventIndex = findExistingEvent(type, sectionId);
    
    if (existingEventIndex >= 0) {
        // We found an identical event
        const existingEvent = sectionEvents[existingEventIndex];
        
        // Check event priority
        const existingPriority = EVENT_PRIORITY[existingEvent.type] || 0;
        const newPriority = EVENT_PRIORITY[type] || 0;
        
        // Only replace if new event has higher priority
        if (newPriority >= existingPriority) {
            // Update existing event
            sectionEvents[existingEventIndex] = newEvent;
        }
    } else {
        // No identical event found, add this one
        sectionEvents.push(newEvent);
    }
    
    // If we've accumulated enough events, send data now
    if (sectionEvents.length >= 5) {
        sendTrackingData();
    }
}

// Find an existing event with the same type and sectionId
function findExistingEvent(type, sectionId) {
    for (let i = 0; i < sectionEvents.length; i++) {
        if (sectionEvents[i].type === type && sectionEvents[i].sectionId === sectionId) {
            return i; // Return the index of the matching event
        }
    }
    return -1; // No match found
}

// Start periodic tracking
function startPeriodicTracking() {
    // Clear any existing interval
    if (trackingInterval) {
        clearInterval(trackingInterval);
    }
    
    // Set up new interval
    trackingInterval = setInterval(function() {
        if (sectionEvents.length > 0 && !isTrackingPaused) {
            sendTrackingData();
        }
    }, TRACKING_INTERVAL);
}

// Show inactivity popup
function showInactivityPopup() {
    // Only show popup if not already shown
    if (!isTrackingPaused) {
        // Pause tracking
        isTrackingPaused = true;
        
        // Show the popup
        const inactivityModal = document.getElementById('inactivityModal');
        inactivityModal.style.display = 'block';
        
        // Track this inactivity event
        sectionEvents.push({
            type: 'inactivity_popup_shown',
            sectionId: getCurrentSectionId(),
            startTime: new Date(),
            endTime: null,
            duration: ''
        });
        
        // Send tracking data immediately
        sendTrackingData();
        
        console.log("Tracking paused due to inactivity");
    }
}

// Handle user return from inactivity
function handleUserReturn() {
    domElements.inactivityModal.style.display = 'none';
    isTrackingPaused = false;
    lastUserActivity = new Date();
    resetInactivityTimeout();
}

// Reset inactivity timeout
function resetInactivityTimeout() {
    if (inactivityTimeout) {
        clearTimeout(inactivityTimeout);
    }
    
    inactivityTimeout = setTimeout(function() {
        if (isPageVisible) {
            showInactivityPopup();
        }
    }, INACTIVITY_THRESHOLD);
}

// Set up visibility tracking
function setupVisibilityTracking() {
    // Browser compatibility code remains the same
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
    
    // Add event listener to track visibility changes
    document.addEventListener(visibilityChange, function() {
        const wasVisible = isPageVisible; // Store previous state
        isPageVisible = !document[hidden];
        const timestamp = new Date();
        
        if (isPageVisible) {
            // Page became visible again
            // Track visibility return
            sectionEvents.push({
                type: 'visibility_return',
                sectionId: getCurrentSectionId(),
                startTime: timestamp,
                endTime: null,
                duration: null
            });
            
            // Update last activity time
            lastUserActivity = timestamp;
            
            // ADDED: Restart the heartbeat when visibility returns
            startHeartbeat();
            
            // If it's been inactive for too long, show popup
            if (timestamp - lastUserActivity > INACTIVITY_THRESHOLD && !isTrackingPaused) {
                showInactivityPopup();
            }
        } else {
            // Page was hidden
            // Track visibility lost
            sectionEvents.push({
                type: 'visibility_lost',
                sectionId: getCurrentSectionId(),
                startTime: timestamp,
                endTime: null,
                duration: 0
            });
            
            // ADDED: Clear heartbeat interval when page becomes hidden
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
            
            // Send any pending heartbeat events before page is hidden
            if (sectionEvents.length > 0) {
                sendTrackingData();
            }
            
            lastUserActivity = timestamp;
            
            // Clear any existing timeout
            if (inactivityTimeout) {
                clearTimeout(inactivityTimeout);
            }
            
            // Set timeout for when page is hidden
            inactivityTimeout = setTimeout(function() {
                if (!isPageVisible) {
                    showInactivityPopup();
                }
            }, INACTIVITY_THRESHOLD);
        }
        
        // Send tracking data immediately
        sendTrackingData();
    });
}

// Efficiently throttle function calls
function throttle(func, delay) {
    let lastCall = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastCall < delay) {
            return;
        }
        lastCall = now;
        return func(...args);
    };
}

// Set up activity monitoring with optimized events
function setupActivityMonitoring() {
    // List of events to consider as user activity
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    // Throttle function to prevent too many event firings
    function throttle(func, delay) {
        let lastCall = 0;
        return function(...args) {
            const now = new Date().getTime();
            if (now - lastCall < delay) {
                return;
            }
            lastCall = now;
            return func(...args);
        };
    }
    
    // Handle user activity
    const handleActivity = throttle(function() {
        // If tracking is paused (popup is visible), don't automatically resume
        if (isTrackingPaused) {
            return; // This is the key change - don't auto-resume when popup is visible
        }
        
        // Only process if page is visible
        if (isPageVisible) {
            const now = new Date();
            
            // Update last activity time
            lastUserActivity = now;
            
            // Clear any existing inactivity timeout
            if (inactivityTimeout) {
                clearTimeout(inactivityTimeout);
            }
            
            // Set new inactivity timeout
            inactivityTimeout = setTimeout(function() {
                if (isPageVisible) {
                    showInactivityPopup();
                }
            }, INACTIVITY_THRESHOLD);
        }
    }, 1000); // Throttle to once per second
    
    // Add event listeners for each activity event
    activityEvents.forEach(function(eventName) {
        document.addEventListener(eventName, handleActivity, { passive: true });
    });
}

// Get the current visible section ID
function getCurrentSectionId() {
    let currentSectionId = 'unknown';
    let maxVisibleArea = 0;
    
    domElements.sectionHeaders.forEach(header => {
        const content = header.nextElementSibling;
        const sectionId = header.querySelector('h2').getAttribute('id');
        
        if (content.classList.contains('active')) {
            const rect = content.getBoundingClientRect();
            const windowHeight = window.innerHeight;
            
            const visibleTop = Math.max(0, rect.top);
            const visibleBottom = Math.min(windowHeight, rect.bottom);
            const visibleHeight = Math.max(0, visibleBottom - visibleTop);
            const visibleArea = visibleHeight * rect.width;
            
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
    }

    // Update visibility session when starting a new heartbeat
    visibilitySession = Date.now();
    
    
    heartbeatInterval = setInterval(function() {
        if (!isTrackingPaused && isPageVisible) {
            const now = new Date();
            const currentSectionId = getCurrentSectionId();
            
            // Update active status for sections
            Object.keys(openSections).forEach(sectionId => {
                const section = openSections[sectionId];
                
                if (sectionId === currentSectionId && !section.isActive) {
                    section.isActive = true;
                    section.lastActiveTime = now;
                } else if (sectionId !== currentSectionId && section.isActive) {
                    section.isActive = false;
                }
                
                // Send heartbeat only for active section
                if (sectionId === currentSectionId && section.isActive && isUserActive) {
                    // Calculate heartbeat duration
                    const lastActiveTime = section.lastActiveTime || now;
                    const heartbeatDuration = Math.round((now - lastActiveTime) / 1000); // Convert to seconds
                    
                    // Create heartbeat event with duration
                    const heartbeatEvent = {
                        type: 'heartbeat',
                        sectionId: sectionId,
                        startTime: now,
                        endTime: null,
                        duration: heartbeatDuration,
                        visibilitySession: visibilitySession

                    };
                    
                    // Check if we already have a heartbeat event for this section
                    const existingHeartbeatIndex = findExistingEvent('heartbeat', sectionId);
                    
                    if (existingHeartbeatIndex >= 0) {
                        // Update the existing heartbeat
                        sectionEvents[existingHeartbeatIndex] = heartbeatEvent;
                    } else {
                        // No existing heartbeat, add this one
                        sectionEvents.push(heartbeatEvent);
                    }
                    
                    // Update section's last active time
                    section.lastActiveTime = now;
                }
            });
            
            // Send tracking data if we have events
            if (sectionEvents.length > 0) {
                sendTrackingData();
            }
        }
    }, HEARTBEAT_INTERVAL);
}

// Track section interactions efficiently
function trackSectionInteraction(sectionId, isOpening) {
    const timestamp = new Date();
    
    if (isOpening) {
        // Mark other active sections as inactive
        Object.keys(openSections).forEach(id => {
            if (openSections[id].isActive && id !== sectionId) {
                openSections[id].isActive = false;
            }
        });
        
        // Handle new or existing section
        if (openSections[sectionId]) {
            if (!openSections[sectionId].isActive) {
                sectionEvents.push({
                    type: 're_activation',
                    sectionId: sectionId,
                    startTime: timestamp,
                    endTime: null,
                    duration: 0
                });
                
                openSections[sectionId].isActive = true;
                openSections[sectionId].lastActiveTime = timestamp;
            }
        } else {
            // New section being opened
            openSections[sectionId] = {
                startTime: timestamp,
                isActive: true,
                lastActiveTime: timestamp
            };
            
            sectionEvents.push({
                type: 'section_opened',
                sectionId: sectionId,
                startTime: timestamp,
                endTime: null,
                duration: 0
            });
        }
    } else {
        // Section being closed
        if (openSections[sectionId]) {
            sectionEvents.push({
                type: 'section_closed',
                sectionId: sectionId,
                startTime: timestamp,
                endTime: null,
                duration: 0
            });
            
            delete openSections[sectionId];
        }
    }
    
    // Send data if enough events accumulated
    if (sectionEvents.length >= 5) {
        sendTrackingData();
    }
}

// Process and combine tracking events
function processTrackingEvents(events) {
    const combinedEvents = [];
    const eventMap = new Map();
    
    // First pass: group events by their key properties
    events.forEach(event => {
        // MODIFIED: Include a visibility session identifier in the key
        // This will prevent combining heartbeats across visibility changes
        const visibilitySession = event.visibilitySession || 'default';
        const eventKey = `${sessionId}_${getUsername()}_${window.location.href}_section_tracking_${event.sectionId}_${event.type}_${visibilitySession}`;
        
        if (eventMap.has(eventKey)) {
            const existingEvent = eventMap.get(eventKey);
            
            // For heartbeat events, SUM the durations only within the same visibility session
            if (event.type === 'heartbeat') {
                // Add the new duration to the existing one
                existingEvent.duration = (existingEvent.duration || 0) + (event.duration || 0);
                // Update the startTime if the new event has a later timestamp
                if (new Date(event.startTime) > new Date(existingEvent.startTime)) {
                    existingEvent.startTime = event.startTime;
                }
            }
            // For other events, check priority
            else if (EVENT_PRIORITY[event.type] > EVENT_PRIORITY[existingEvent.type]) {
                eventMap.set(eventKey, event);
            }
        } else {
            eventMap.set(eventKey, event);
        }
    });
    
    // Convert map back to array
    eventMap.forEach(event => {
        combinedEvents.push(event);
    });
    
    return combinedEvents;
}

// Send tracking data to server with batching
function sendTrackingData(isSync = false) {
    // Don't proceed if there's no data or tracking is paused
    if (sectionEvents.length === 0 || isTrackingPaused) {
        return;
    }
    
    // Prepare data
    const username = getUsername();
    const eventsCopy = [...sectionEvents];
    sectionEvents = [];
    
    // Process and combine events
    const processedEvents = processTrackingEvents(eventsCopy);
    
    const data = {
        username: username,
        url: window.location.href,
        events: processedEvents,
        timestamp: new Date().toISOString(),
        sessionId: sessionId
    };
    
    // Use beacon API for unload events
    if (isSync && navigator.sendBeacon) {
        try {
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            navigator.sendBeacon(APPS_SCRIPT_URL, blob);
        } catch (error) {
            console.error('Beacon error:', error);
            sectionEvents = [...eventsCopy, ...sectionEvents];
        }
        return;
    }
    
    // Use fetch for normal tracking
    fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        mode: 'no-cors'
    })
    .catch(error => {
        console.error('Tracking error:', error);
        sectionEvents = [...eventsCopy, ...sectionEvents];
    });
}

// Get username with caching
const usernameCache = {
    value: null,
    timestamp: 0
};

function getUsername() {
    // Return cached username if valid (cache for 5 minutes)
    if (usernameCache.value && Date.now() - usernameCache.timestamp < 300000) {
        return usernameCache.value;
    }
    
    try {
        const accountsData = localStorage.getItem('accounts');
        if (accountsData) {
            const accounts = JSON.parse(accountsData);
            const username = (accounts && accounts.length > 0 && accounts[0].username) 
                ? accounts[0].username 
                : 'Guest_' + Math.floor(Math.random() * 10000);
            
            // Update cache
            usernameCache.value = username;
            usernameCache.timestamp = Date.now();
            
            return username;
        }
        return 'Guest_' + Math.floor(Math.random() * 10000);
    } catch (error) {
        return 'Guest_' + Math.floor(Math.random() * 10000);
    }
}

// Handle page unload
function handlePageUnload() {
    // Capture final state for all sections
    const exitTime = new Date();
    
    Object.keys(openSections).forEach(sectionId => {
        const section = openSections[sectionId];
        
        sectionEvents.push({
            type: section.isActive ? 'active_on_exit' : 'inactive_on_exit',
            sectionId: sectionId,
            startTime: section.startTime,
            endTime: exitTime,
            duration: (exitTime - section.startTime) / 1000
        });
    });
    
    // Save session state
    saveSessionState();
    
    // Send tracking data
    if (sectionEvents.length > 0) {
        sendTrackingData(true);
    }
}

// Save session state
function saveSessionState() {
    try {
        const openSectionIds = Object.keys(openSections);
        let lastActiveSection = null;
        
        // Find most recently active section
        Object.keys(openSections).forEach(sectionId => {
            const section = openSections[sectionId];
            if (section.isActive) {
                lastActiveSection = sectionId;
            }
        });
        
        // Save to localStorage
        localStorage.setItem('sectionState', JSON.stringify({
            timestamp: new Date().toISOString(),
            openSectionIds: openSectionIds,
            lastActiveSection: lastActiveSection
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
            
            // If session was recent (< 2 hours), restore
            const lastSession = new Date(sessionData.timestamp);
            const hoursSinceLastSession = (new Date() - lastSession) / (1000 * 60 * 60);
            
            if (hoursSinceLastSession < 2) {
                restorePreviousSession(sessionData);
            } else {
                localStorage.removeItem('sectionState');
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
            sessionData.openSectionIds.forEach(sectionId => {
                const header = document.querySelector(`h2#${sectionId}`).closest('.section-header');
                if (header) {
                    header.classList.add('active');
                    header.nextElementSibling.classList.add('active');
                    
                    trackSectionInteraction(sectionId, true);
                    
                    sectionEvents.push({
                        type: 'session_restored',
                        sectionId: sectionId,
                        startTime: new Date(),
                        endTime: null,
                        duration: 0
                    });
                }
            });
            
            // Scroll to last active section
            if (sessionData.lastActiveSection) {
                const element = document.getElementById(sessionData.lastActiveSection);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
            const blockName = container.getAttribute('data-block-name');
            
            navigator.clipboard.writeText(codeBlock.textContent)
                .then(() => {
                    feedback.classList.add('show');
                    
                    trackCodeCopy(blockName);
                    
                    setTimeout(() => {
                        feedback.classList.remove('show');
                    }, 2000);
                })
                .catch(err => {
                    console.error('Copy error:', err);
                });
        });
    });
}

// Track code copy
async function trackCodeCopy(blockName) {
    try {
        const data = {
            type: 'code_copy',
            username: getUsername(),
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
    // Function to toggle disease info
    function toggleDiseaseInfo() {
        const isExpanded = domElements.diseaseTitle.classList.contains('expanded');
        
        if (isExpanded) {
            domElements.diseaseTitle.classList.remove('expanded');
            domElements.diseaseContent.style.display = 'none';
            domElements.diseasePreview.style.display = 'block';
        } else {
            domElements.diseaseTitle.classList.add('expanded');
            domElements.diseaseContent.style.display = 'block';
            domElements.diseasePreview.style.display = 'none';
            
            // Track that user expanded the disease info
            trackUserInteraction('disease_info_expanded', 'Lou-Greig Disease');
        }
    }
    
    // Add click event listeners
    if (domElements.diseaseTitle && domElements.diseasePreview) {
        domElements.diseaseTitle.addEventListener('click', toggleDiseaseInfo);
        domElements.diseasePreview.addEventListener('click', toggleDiseaseInfo);
    }
    
    // Setup reaction buttons
    setupReactionButtons();
}

// Setup reaction buttons
function setupReactionButtons() {
    // Use event delegation for reaction buttons
    const reactionContainer = document.querySelector('.reaction-container');
    if (reactionContainer) {
        reactionContainer.addEventListener('click', function(event) {
            const button = event.target.closest('.reaction-button');
            if (!button) return;
            
            // Get reaction type
            const reactionType = button.getAttribute('data-reaction');
            
            // Remove selected class from all buttons
            document.querySelectorAll('.reaction-button').forEach(btn => 
                btn.classList.remove('selected'));
            
            // Add selected class to clicked button
            button.classList.add('selected');
            
            // Show feedback message
            const feedback = document.querySelector('.reaction-feedback');
            if (feedback) {
                feedback.classList.add('show');
                
                // Hide feedback after 3 seconds
                setTimeout(() => {
                    feedback.classList.remove('show');
                }, 3000);
            }
            
            // Track the reaction
            trackUserInteraction('disease_info_reaction', reactionType);
        });
    }
}

// Track user interactions with extra info
async function trackUserInteraction(interactionType, interactionValue) {
    try {
        const data = {
            type: interactionType,
            username: getUsername(),
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
        // Update status
        domElements.statusElement.textContent = 'Loading Python core...';
        
        // Load Pyodide
        pyodide = await loadPyodide();
        
        domElements.statusElement.textContent = 'Loading Python libraries... This may take a moment.';
        
        // Set up stdout/stderr redirection
        pyodide.setStdout({ batched: (msg) => appendToOutputArea(msg) });
        pyodide.setStderr({ batched: (msg) => appendToOutputArea(`Error: ${msg}`) });
        
        // Load required packages
        await pyodide.loadPackage(requiredPackages);
        
        // Update UI
        domElements.statusElement.textContent = 'Python is ready!';
        domElements.runButton.disabled = false;
        
        // Set up run and clear buttons
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
function setupPythonButtons(pyodide) {
    // Run button
    domElements.runButton.addEventListener('click', async () => {
        if (!pyodide) {
            appendToOutputArea("Error: Python is not loaded yet.");
            return;
        }
        
        const pythonCode = domElements.codeInput.value;
        domElements.outputArea.textContent = ''; // Clear previous output
        
        domElements.statusElement.textContent = 'Running code...';
        domElements.runButton.disabled = true;
        domElements.clearButton.disabled = true;
        
        try {
            await pyodide.runPythonAsync(pythonCode);
            domElements.statusElement.textContent = 'Execution complete.';
        } catch (error) {
            appendToOutputArea(`\n--- Execution Error --- \n${error}\n--------------------`);
            domElements.statusElement.textContent = 'Error during execution.';
        } finally {
            domElements.runButton.disabled = false;
            domElements.clearButton.disabled = false;
        }
    });
    
    // Clear button
    domElements.clearButton.addEventListener('click', () => {
        domElements.outputArea.textContent = '';
        domElements.statusElement.textContent = 'Output cleared. Python is ready.';
    });
}

// Append text to output area
function appendToOutputArea(message) {
    domElements.outputArea.textContent += message + (message.endsWith('\n') ? '' : '\n');
    domElements.outputArea.scrollTop = domElements.outputArea.scrollHeight; // Scroll to bottom
}

// NUS color variables for confetti
const nusBlue = '#003D7C';
const nusOrange = '#EF7C00';
const nusLightBlue = '#4D7CAE';

// Optimized confetti animations
const confettiAnimations = {
    center: function() {
        confetti({
            particleCount: 150,
            spread: 160,
            origin: { x: 0.5, y: 0.6 },
            colors: [nusBlue, nusOrange, nusLightBlue, '#ffffff']
        });
    },
    sides: function() {
        // Left side
        confetti({
            particleCount: 80,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.65 },
            colors: [nusBlue, nusLightBlue, '#ffffff']
        });
        
        // Right side after a small delay
        setTimeout(() => {
            confetti({
                particleCount: 80,
                angle: 120,
                spread: 55,
                origin: { x: 1, y: 0.65 },
                colors: [nusOrange, nusLightBlue, '#ffffff']
            });
        }, 150);
    },
    fireworks: function() {
        const duration = 1500;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
        
        function randomInRange(min, max) {
            return Math.random() * (max - min) + min;
        }
        
        // Use requestAnimationFrame for better performance
        function fireworkFrame() {
            const timeLeft = animationEnd - Date.now();
            
            if (timeLeft <= 0) return;
            
            const particleCount = 50 * (timeLeft / duration);
            
            // Left firework
            confetti(Object.assign({}, defaults, { 
                particleCount, 
                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
                colors: [nusBlue, nusLightBlue, '#ffffff']
            }));
            
            // Right firework
            confetti(Object.assign({}, defaults, { 
                particleCount, 
                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
                colors: [nusOrange, nusLightBlue, '#ffffff']
            }));
            
            requestAnimationFrame(fireworkFrame);
        }
        
        requestAnimationFrame(fireworkFrame);
    },
    school: function() {
        // NUS blue rain
        confetti({
            particleCount: 100,
            startVelocity: 30,
            spread: 360,
            origin: { x: 0.5, y: 0.3 },
            colors: [nusBlue],
            shapes: ['square'],
            scalar: 0.8
        });
        
        // NUS orange rain
        setTimeout(() => {
            confetti({
                particleCount: 100,
                startVelocity: 30,
                spread: 360,
                origin: { x: 0.5, y: 0.3 },
                colors: [nusOrange],
                shapes: ['circle'],
                scalar: 0.8
            });
        }, 300);
    }
};
