//NOTE: Same as v21. Fixed login page rediction 

// Replace with your deployed Google Apps Script Web App URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzSxyvmPYsdnimwhEj572QuTvow9nTpkc13rOd1rQY9neh0mp-a4Bx5p6tERWRzR9d1tA/exec';
const SIGN_IN_URL = 'https://xchee-01.github.io/PMTHA/SOM-PMTHA_signin.html';
const COPY_TRACKING_URL = 'https://script.google.com/macros/s/AKfycbz88biGq3GAIfH77lEt_IeWcRbBrZ8r2K-4Z5C0foZDMHQGsuqaGIvhGOBKA5eqW65_AA/exec';
const EXTRA_INFO_INTERACTION_URL = 'https://script.google.com/macros/s/AKfycbxXHMDDEnZq0krPyE96d22zEp3DqdLmwO74OsxSRW1Rq_JvHEYRXc5IgnaV-6J1l4o_GQ/exec';

// Configuration and constants
const TRACKING_INTERVAL = 20000; // 20 seconds for periodic tracking 
const HEARTBEAT_INTERVAL = 10000; // 10 seconds for heartbeat 
const INACTIVITY_THRESHOLD = 30000; // 30000 seconds until user is considered inactive
const THROTTLE_DELAY = 1000; // Throttle delay for frequent events
const LOCAL_STORAGE_KEY = 'tracking_events_cache'; // Key for localStorage tracking cache
const EVENT_BATCH_THRESHOLD = 1; // Minimum number of events before sending to server

// Required packages for Pyodide
const requiredPackages = ['numpy', 'pandas', 'matplotlib'];

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
let lastUpdateTime = new Date().toISOString(); // Track last update time
let isPageClosing = false;


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

// Audio variables and functions
let audioContext = null;
let correctSoundBuffer = null;
let iDoneItSoundBuffer = null;
let audioInitialized = false;

// Load answer correct sound from URL
async function loadSound() {
    if (correctSoundBuffer) {
        console.log("Sound buffer already available.");
        return;
    }
    console.log("Loading sound...");
    try {
        const url = 'https://xchee-01.github.io/answer_correct_sound.mp3';
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load sound: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        if (!audioContext) {
            throw new Error("AudioContext not available for decoding sound.");
        }
        correctSoundBuffer = await audioContext.decodeAudioData(arrayBuffer);
        console.log("Sound decoded and buffer ready.");
    } catch (error) {
        console.error('Error loading sound:', error);
        correctSoundBuffer = null;
        throw error;
    }
}

// Load "I've done it" sound from URL
async function loadIDoneItSound() {
    if (iDoneItSoundBuffer) {
        console.log("I've done it sound buffer already available.");
        return;
    }
    console.log("Loading I've done it sound...");
    try {
        const url = 'https://xchee-01.github.io/i-done-it-sound-effect.mp3';
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load I've done it sound: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        if (!audioContext) {
            throw new Error("AudioContext not available for decoding sound.");
        }
        iDoneItSoundBuffer = await audioContext.decodeAudioData(arrayBuffer);
        console.log("I've done it sound decoded and buffer ready.");
    } catch (error) {
        console.error('Error loading I\'ve done it sound:', error);
        iDoneItSoundBuffer = null;
        throw error;
    }
}

// Initialize audio functionality
async function initAudio() {
    if (audioInitialized) {
        console.log("Audio already initialized.");
        return Promise.resolve();
    }
    
    console.log("Attempting to initialize audio...");
    try {
        // Create audio context if it doesn't exist or was closed
        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log("AudioContext created/recreated.");
        }

        // Ensure AudioContext is running (it might start in a suspended state)
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
            console.log("AudioContext resumed.");
        }
        
        await loadSound(); // Load the sound (this will set correctSoundBuffer)
        await loadIDoneItSound(); // Load the "I've done it" sound

        if (correctSoundBuffer && iDoneItSoundBuffer) {
            audioInitialized = true;
            console.log("Audio successfully initialized (Context & Buffers ready).");
            return Promise.resolve();
        } else {
            throw new Error("Sound buffer not loaded after loadSound attempt.");
        }
    } catch (error) {
        console.error('Audio initialization failed:', error);
        audioInitialized = false;
        correctSoundBuffer = null;
        return Promise.reject(error);
    }
}

// Actually play the sound
function actuallyPlayTheSound() {
    if (!audioContext || !correctSoundBuffer) {
        console.warn("actuallyPlayTheSound: Preconditions not met");
        return;
    }
    const source = audioContext.createBufferSource();
    source.buffer = correctSoundBuffer;
    
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.4; // Volume
    
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    source.start();
    console.log("Correct sound played.");
}

// Play correct sound
function playCorrectSound() {
    if (!audioInitialized || !audioContext || !correctSoundBuffer) {
        console.warn("playCorrectSound: Audio not ready or initialized.");
        // Try to initialize again
        initAudio().then(() => {
            if (audioInitialized && audioContext && correctSoundBuffer) {
               if (audioContext.state === 'suspended') {
                    audioContext.resume().then(actuallyPlayTheSound).catch(e => console.error("Error resuming context:", e));
                } else {
                    actuallyPlayTheSound();
                }
            } else {
                console.error("Still not ready to play sound after re-init attempt.");
            }
        }).catch(err => {
            console.error("Failed to init/play sound:", err);
        });
        return;
    }
    
    if (audioContext.state === 'suspended') {
        console.log("AudioContext is suspended, attempting to resume for playback.");
        audioContext.resume().then(actuallyPlayTheSound).catch(e => console.error("Error resuming AudioContext:", e));
    } else {
        actuallyPlayTheSound();
    }
}

// Actually play the "I've done it" sound
function actuallyPlayIDoneItSound() {
    if (!audioContext || !iDoneItSoundBuffer) {
        console.warn("actuallyPlayIDoneItSound: Preconditions not met");
        return;
    }
    const source = audioContext.createBufferSource();
    source.buffer = iDoneItSoundBuffer;
    
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.4; // Volume
    
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    source.start();
    console.log("I've done it sound played.");
}

// Play "I've done it" sound
function playIDoneItSound() {
    if (!audioInitialized || !audioContext || !iDoneItSoundBuffer) {
        console.warn("playIDoneItSound: Audio not ready or initialized.");
        // Try to initialize again
        initAudio().then(() => {
            if (audioInitialized && audioContext && iDoneItSoundBuffer) {
               if (audioContext.state === 'suspended') {
                    audioContext.resume().then(actuallyPlayIDoneItSound).catch(e => console.error("Error resuming context:", e));
                } else {
                    actuallyPlayIDoneItSound();
                }
            } else {
                console.error("Still not ready to play I've done it sound after re-init attempt.");
            }
        }).catch(err => {
            console.error("Failed to init/play I've done it sound:", err);
        });
        return;
    }
    
    if (audioContext.state === 'suspended') {
        console.log("AudioContext is suspended, attempting to resume for playback.");
        audioContext.resume().then(actuallyPlayIDoneItSound).catch(e => console.error("Error resuming AudioContext:", e));
    } else {
        actuallyPlayIDoneItSound();
    }
}

// Initialize audio on first user interaction
function attemptPreemptiveAudioInit() {
    if (!audioInitialized) {
        console.log("Pre-emptive audio initialization triggered by user interaction.");
        initAudio().catch(err => {
            console.warn("Pre-emptive audio initialization failed. Will try again on first correct answer.", err.message);
        });
    }
}

// Optimized initialization function
document.addEventListener('DOMContentLoaded', function() {
    // Initialize enhanced tracking system
    initializeTracking();

    // Add this line right after all the initializations
    window.addEventListener('unload', handlePageUnload);
    
    // Setup UI interactions
    setupUIInteractions();
    
    // Initialize Python
    initializePython();

    // Set up toggle answer functionality
    setupToggleAnswerButtons();  

    // Set up MCQ functionality for all MCQ containers
    const mcqContainers = document.querySelectorAll('.mcq-container');
    
    mcqContainers.forEach(container => {
        const options = container.querySelectorAll('.mcq-option');
        const resetButton = container.querySelector('.reset-button');
        
        if (options && options.length > 0) {
            options.forEach(option => {
                option.addEventListener('click', function() {
                    // Get the parent MCQ container of this option
                    const thisContainer = this.closest('.mcq-container');
                    
                    // Only process clicks if no option in THIS container is currently selected
                    if (!thisContainer.querySelector('.mcq-option.selected-correct') && 
                        !thisContainer.querySelector('.mcq-option.selected-incorrect')) {
                        
                        // Get and show appropriate feedback
                        const isCorrect = this.getAttribute('data-correct') === 'true';
                        const feedback = this.querySelector('.mcq-feedback');
                        
                        if (isCorrect) {
                            this.classList.add('selected-correct');
                            
                            // Play correct sound & show celebration
                            initAudio()
                                .then(() => {
                                    playCorrectSound();
                                    showCelebration();
                                })
                                .catch(err => {
                                    console.error("Could not play sound on correct answer:", err.message);
                                    // Still show celebration even if sound fails
                                    showCelebration();
                                });
                        } else {
                            this.classList.add('selected-incorrect');
                        }
                        
                        feedback.style.display = 'block';
                        thisContainer.querySelector('.reset-button').style.display = 'flex';
                    }
                });
            });
        }
        
        if (resetButton) {
            resetButton.addEventListener('click', function() {
                // Get the parent MCQ container of this reset button
                const thisContainer = this.closest('.mcq-container');
                
                const options = thisContainer.querySelectorAll('.mcq-option');
                if (options && options.length > 0) {
                    options.forEach(option => {
                        option.classList.remove('selected-correct');
                        option.classList.remove('selected-incorrect');
                        option.querySelector('.mcq-feedback').style.display = 'none';
                    });
                }
                this.style.display = 'none';
            });
        }
    });
    
    // Set up drag-and-drop functionality
    setupDragAndDrop();
    
    // Set up fill-in-the-blanks exercise
    setupFillInTheBlanks();
    
    // Set up celebrate button functionality
    const celebrateButtons = document.querySelectorAll('.celebrate-button');
    celebrateButtons.forEach(button => {
        button.addEventListener('click', function() {
            const message = this.getAttribute('data-message');
            const animation = this.getAttribute('data-animation') || 'center';
            
            // Show modal with message
            const modal = document.getElementById('celebrationModal');
            const modalMessage = document.getElementById('celebrationMessage');
            
            if (modal && modalMessage) {
                modalMessage.textContent = message;
                modal.style.display = 'block';
                
                // Play the "I've done it" sound
                initAudio()
                    .then(() => {
                        playIDoneItSound();
                    })
                    .catch(err => {
                        console.error("Could not play I've done it sound:", err.message);
                    });
                
                // Show appropriate confetti animation
                if (animation === 'center') {
                    confetti({
                        particleCount: 150,
                        spread: 160,
                        origin: { x: 0.5, y: 0.6 }
                    });
                } else if (animation === 'sides') {
                    confetti({
                        particleCount: 80,
                        angle: 60,
                        spread: 55,
                        origin: { x: 0, y: 0.65 }
                    });
                    setTimeout(() => {
                        confetti({
                            particleCount: 80,
                            angle: 120,
                            spread: 55,
                            origin: { x: 1, y: 0.65 }
                        });
                    }, 250);
                } else if (animation === 'fireworks') {
                    const duration = 5 * 1000;
                    const animationEnd = Date.now() + duration;
                    
                    const interval = setInterval(function() {
                        const timeLeft = animationEnd - Date.now();
                        
                        if (timeLeft <= 0) {
                            return clearInterval(interval);
                        }
                        
                        const particleCount = 50 * (timeLeft / duration);
                        
                        confetti({
                            startVelocity: 30,
                            spread: 360,
                            ticks: 60,
                            origin: {
                                x: Math.random(),
                                y: Math.random() - 0.2
                            },
                            particleCount
                        });
                    }, 250);
                } else if (animation === 'school') {
                    const end = Date.now() + (3 * 1000);
                    
                    const colors = ['#003D7C', '#EF7C00', '#4D7CAE'];
                    
                    (function frame() {
                        confetti({
                            particleCount: 2,
                            angle: 60,
                            spread: 55,
                            origin: { x: 0, y: 0.65 },
                            colors: colors
                        });
                        confetti({
                            particleCount: 2,
                            angle: 120,
                            spread: 55,
                            origin: { x: 1, y: 0.65 },
                            colors: colors
                        });
                        
                        if (Date.now() < end) {
                            requestAnimationFrame(frame);
                        }
                    }());
                }
            }
        });
    });
    
    // Add event listener for modal close button
    const modalCloseButton = document.querySelector('.modal-close');
    if (modalCloseButton) {
        modalCloseButton.addEventListener('click', function() {
            const modal = document.getElementById('celebrationModal');
            if (modal) {
                modal.style.display = 'none';
            }
        });
    }

    // Initialize audio on first interaction
    document.body.addEventListener('pointerdown', attemptPreemptiveAudioInit, { once: true });
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
    
    // Load any cached events from localStorage
    loadCachedEvents();
    
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
    
    // Add both event listeners for page unload with higher priority than the existing one
    window.addEventListener('beforeunload', function(event) {
        isPageClosing = true;
        handlePageUnload(event);
    }, { capture: true });
    
    window.addEventListener('unload', function(event) {
        isPageClosing = true;
        handlePageUnload(event);
    }, { capture: true });
    
    // Check for previous session
    checkForPreviousSession();
}

// Load cached events from localStorage
function loadCachedEvents() {
    try {
        // EDIT START: Try both regular and backup keys
        let cachedData = localStorage.getItem(LOCAL_STORAGE_KEY);
        
        // If primary storage is empty, try the backup
        if (!cachedData) {
            cachedData = localStorage.getItem(`${LOCAL_STORAGE_KEY}_backup`);
            console.log('Using backup localStorage data');
        }
        
        if (cachedData) {
            const parsedData = JSON.parse(cachedData);
            
            // Handle both the old format (array) and new format (object with events array)
            if (Array.isArray(parsedData)) {
                // Old format - direct array
                sectionEvents = [...parsedData, ...sectionEvents];
                console.log(`Loaded ${parsedData.length} cached events from localStorage (old format)`);
            } else if (parsedData.events && Array.isArray(parsedData.events)) {
                // New format - object with events array
                sectionEvents = [...parsedData.events, ...sectionEvents];
                console.log(`Loaded ${parsedData.events.length} cached events from localStorage (new format)`);
                
                // If it's from an old session, send it right away
                if (parsedData.sessionId && parsedData.sessionId !== sessionId) {
                    console.log('Found events from previous session, sending now');
                    sendTrackingData(false, true);
                }
            }
        }
        // EDIT END
    } catch (error) {
        console.error('Error loading cached events:', error);
    }
}

// Save events to localStorage
function saveEventsToLocalStorage() {
    try {
        // EDIT START: Save with more metadata and create backup
        const saveObject = {
            timestamp: new Date().toISOString(),
            events: sectionEvents,
            sessionId: sessionId,
            url: window.location.href
        };
        
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(saveObject));
        
        // Also create a backup with a different key
        localStorage.setItem(`${LOCAL_STORAGE_KEY}_backup`, JSON.stringify(saveObject));
        // EDIT END
    } catch (error) {
        console.error('Error saving events to localStorage:', error);
        // If localStorage is full, we'll clear it and try again
        if (error.name === 'QuotaExceededError') {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            try {
                // EDIT START: Use the saveObject here too
                const saveObject = {
                    timestamp: new Date().toISOString(),
                    events: sectionEvents,
                    sessionId: sessionId,
                    url: window.location.href
                };
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(saveObject));
                // EDIT END
            } catch (innerError) {
                console.error('Still failed to save after clearing:', innerError);
            }
        }
    }
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
    //if (event.target.closest('.toggle-answer')) {
      //  const button = event.target.closest('.toggle-answer');
      //  toggleAnswer(button);
   // }
    
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
//function toggleAnswer(button) {
    // Find the next sibling which is the answer div
    //const answerDiv = button.nextElementSibling;
    
    //if (!answerDiv || !answerDiv.classList.contains('answer')) {
        //console.error("Could not find answer div for button:", button);
        //return;
    //}
    
    // Toggle the display
    //if (answerDiv.style.display === 'block') {
        //answerDiv.style.display = 'none';
        //button.innerHTML = '<i class="fas fa-lightbulb"></i> Show Answer';
    //} else {
        //answerDiv.style.display = 'block';
        //button.innerHTML = '<i class="fas fa-times"></i> Hide Answer';
        
        // Track that the user viewed an answer
        //const challengeContainer = button.closest('.challenge');
        //const challengeTitle = challengeContainer ? challengeContainer.querySelector('h3').textContent : 'Unknown Challenge';
        
        //trackEvent('answer_viewed', getCurrentSectionId(), challengeTitle);
    //}
//}

// Set up toggle answer buttons functionality
function setupToggleAnswerButtons() {
    const toggleButtons = document.querySelectorAll('.toggle-answer');
    
    toggleButtons.forEach(button => {
        // Remove any existing event listeners to prevent conflicts
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        // Add new event listener
        newButton.addEventListener('click', function() {
            // Find the closest parent '.challenge' container
            const challengeContainer = this.closest('.challenge');
            
            if (!challengeContainer) {
                console.error("Debug: toggle-answer button is not inside a .challenge container:", this);
                return; // Button is not placed as expected
            }
            
            // Find the '.answer' element within this specific challenge container
            const answerElement = challengeContainer.querySelector('.answer');
            
            if (!answerElement) {
                console.error("Debug: No .answer element found in challenge for button:", this);
                return; // Answer div is missing or misnamed
            }
            
            // Force display property to change
            if (answerElement.style.display === 'block') {
                answerElement.style.display = 'none';
                this.innerHTML = '<i class="fas fa-lightbulb"></i> Show Answer';
            } else {
                answerElement.style.display = 'block';
                this.innerHTML = '<i class="fas fa-times"></i> Hide Answer';
                
                // Track that the user viewed an answer
                const challengeTitle = challengeContainer.querySelector('h3').textContent || 'Unknown Challenge';
                trackEvent('answer_viewed', getCurrentSectionId(), challengeTitle);
            }
        });
    });
    
    console.log("Toggle answer buttons initialized with enhanced functionality");
}
// Show celebration confetti
function showCelebration() {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#003D7C', '#EF7C00', '#4D7CAE']
    });
}

// Show celebration with button
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
    
    // Always save to localStorage when events are updated
    saveEventsToLocalStorage();
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
    
    // Set up new interval (now 30 seconds instead of 5)
    trackingInterval = setInterval(function() {
        if (!isTrackingPaused && sectionEvents.length > 0) {
            // This will internally check the threshold
            sendTrackingData(false, false);
        }
    }, TRACKING_INTERVAL);
    
    console.log(`Periodic tracking started: Will check every ${TRACKING_INTERVAL/1000} seconds and send when ≥ ${EVENT_BATCH_THRESHOLD} events`);
}

// Show inactivity popup
function showInactivityPopup() {
    // Only show popup if not already shown
    if (!isTrackingPaused) {
        // Pause tracking
        isTrackingPaused = true;
        
        // Mark all active sections as inactive before showing popup
        Object.keys(openSections).forEach(sectionId => {
            if (openSections[sectionId].isActive) {
                openSections[sectionId].isActive = false;
                
                // Add an inactive event to mark the end of the activity period
                sectionEvents.push({
                    type: 'inactive_due_to_popup',
                    sectionId: sectionId,
                    startTime: new Date(),
                    endTime: null,
                    duration: 0,
                    sessionId: sessionId,
                    username: getUsername()
                });
            }
        });
        
        // Show the popup
        const inactivityModal = document.getElementById('inactivityModal');
        inactivityModal.style.display = 'block';
        
        // Track this inactivity event
        sectionEvents.push({
            type: 'inactivity_popup_shown',
            sectionId: getCurrentSectionId(),
            startTime: new Date(),
            endTime: null,
            duration: 0,
            sessionId: sessionId,
            username: getUsername()
        });
        
        // Save to localStorage
        saveEventsToLocalStorage();
        
        // Send tracking data immediately
        sendTrackingData();
        
        console.log("Tracking paused due to inactivity");
    }
}

function handleUserReturn() {
    domElements.inactivityModal.style.display = 'none';
    isTrackingPaused = false;
    lastUserActivity = new Date();
    
    // Create re-activation events for currently open sections
    const currentTime = new Date();
    Object.keys(openSections).forEach(sectionId => {
        // Create a new re-activation event
        sectionEvents.push({
            type: 're_activation',
            sectionId: sectionId,
            startTime: currentTime,
            endTime: null,
            duration: 0,
            visibilitySession: visibilitySession, // Keep track of the same visibility session
            sessionId: sessionId,
            username: getUsername()
        });
        
        // Update the section's last active time
        openSections[sectionId].lastActiveTime = currentTime;
        
        // If this is the currently visible section, mark it as active
        if (sectionId === getCurrentSectionId()) {
            openSections[sectionId].isActive = true;
        }
    });
    
    // Save updated events to localStorage
    saveEventsToLocalStorage();
    
    // Send tracking data - but respect threshold unless we want to force it
    // For user return, we probably want to respect the threshold
    sendTrackingData(false, false);
    
    // Reset the inactivity timeout
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
            
            // Save to localStorage
            saveEventsToLocalStorage();
            
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
                type: 'tab_switched', // Changed from visibility_lost
                sectionId: getCurrentSectionId(),
                startTime: timestamp,
                endTime: null,
                duration: 0,
                sessionId: sessionId,
                username: getUsername()
            });
            
            // Save to localStorage
            saveEventsToLocalStorage();
            
            // ADDED: Clear heartbeat interval when page becomes hidden
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
            
            // Send any pending heartbeat events before page is hidden - BUT RESPECT THRESHOLD
            if (sectionEvents.length > 0) {
                // Check threshold before sending - we don't force send here
                sendTrackingData(false, false);
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
        
        // Save to localStorage regardless
        saveEventsToLocalStorage();
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
    // Clear any existing interval to prevent multiple heartbeats running
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }

    // Update visibility session when starting a new heartbeat sequence
    // This helps group heartbeats that occur during a continuous period of page visibility
    visibilitySession = Date.now();

    heartbeatInterval = setInterval(function() {
        // Only run heartbeat if tracking is not paused, page is visible, and not closing
        if (!isTrackingPaused && isPageVisible && !isPageClosing) {
            const now = new Date(); // Current timestamp for this heartbeat tick
            const currentSectionId = getCurrentSectionId(); // Determine the most prominent section

            // Iterate over all sections currently considered "open" by the user
            Object.keys(openSections).forEach(sectionId => {
                const sectionData = openSections[sectionId]; // Get data for this specific open section

                // Update the active status of the section within openSections
                if (sectionId === currentSectionId && !sectionData.isActive) {
                    sectionData.isActive = true;
                } else if (sectionId !== currentSectionId && sectionData.isActive) {
                    sectionData.isActive = false;
                }

                // Track that this section has had an open event
                if (!sectionData.hasTrackedOpen) {
                    sectionEvents.push({
                        type: 'section_opened',
                        sectionId: sectionId,
                        startTime: sectionData.startTime,
                        endTime: null,
                        duration: 0,
                        sessionId: sessionId,
                        username: getUsername()
                    });
                    sectionData.hasTrackedOpen = true;
                    saveEventsToLocalStorage();
                }

                // Generate a heartbeat event ONLY for the CURRENTLY VISIBLE and ACTIVE section
                // and only if the user is generally considered active on the page
                if (sectionId === currentSectionId && sectionData.isActive && isUserActive) {
                    // Define the start and end for this specific heartbeat interval
                    const startTimeForThisHeartbeat = new Date(now.getTime() - HEARTBEAT_INTERVAL);
                    const endTimeForThisHeartbeat = now;
                    const individualHeartbeatDuration = Math.round(HEARTBEAT_INTERVAL / 1000); // Should be 1 or 2

                    const heartbeatEvent = {
                        type: 'heartbeat',
                        sectionId: sectionId,
                        startTime: startTimeForThisHeartbeat.toISOString(),
                        endTime: endTimeForThisHeartbeat.toISOString(),
                        duration: individualHeartbeatDuration,
                        visibilitySession: visibilitySession,
                        sessionId: sessionId,
                        username: getUsername()
                    };

                    // Push the new, individual heartbeat event
                    sectionEvents.push(heartbeatEvent);

                    // Save all events to localStorage
                    saveEventsToLocalStorage();

                    // Update the section's tracking timestamps
                    sectionData.lastHeartbeatTime = now;
                    sectionData.lastActiveTime = now;
                }
            });
        }
    }, HEARTBEAT_INTERVAL);

    console.log("Heartbeat started with interval:", HEARTBEAT_INTERVAL, "ms");
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
                    duration: 0,
                    sessionId: sessionId,
                    username: getUsername()
                });
                
                openSections[sectionId].isActive = true;
                openSections[sectionId].lastActiveTime = timestamp;
            }
        } else {
            // New section being opened
            openSections[sectionId] = {
                startTime: timestamp,
                isActive: true,
                lastActiveTime: timestamp,
                lastHeartbeatTime: null,
                hasTrackedOpen: false // Add flag to track if we've pushed a section_opened event
            };
            
            sectionEvents.push({
                type: 'section_opened',
                sectionId: sectionId,
                startTime: timestamp,
                endTime: null,
                duration: 0,
                sessionId: sessionId,
                username: getUsername()
            });
            
            openSections[sectionId].hasTrackedOpen = true;
        }
    } else {
        // Section being closed
        if (openSections[sectionId]) {
            sectionEvents.push({
                type: 'section_closed',
                sectionId: sectionId,
                startTime: timestamp,
                endTime: null,
                duration: 0,
                sessionId: sessionId,
                username: getUsername()
            });
            
            delete openSections[sectionId];
        }
    }
    
    // Save to localStorage
    saveEventsToLocalStorage();
}

// Process and combine tracking events - improved for better heartbeat aggregation
function processTrackingEvents(events) {
    const combinedEvents = [];
    const eventMap = new Map();

    events.forEach(event => {
        // Create a key that includes all the properties we want to use for aggregation
        const eventKey = `${event.sessionId || sessionId}_${event.username || getUsername()}_${window.location.href}_section_tracking_${event.sectionId}_${event.type}`;

        if (eventMap.has(eventKey)) {
            const existingEvent = eventMap.get(eventKey);

            if (event.type === 'heartbeat') {
                // Add the new duration to the existing one
                existingEvent.duration = (existingEvent.duration || 0) + (event.duration || 0);

                // Update startTime to be the EARLIEST startTime of the aggregated block
                if (new Date(event.startTime) < new Date(existingEvent.startTime)) {
                    existingEvent.startTime = event.startTime;
                }
                // Update endTime to be the LATEST endTime of the aggregated block
                if (event.endTime) { // Make sure individual heartbeats provide endTime
                    if (!existingEvent.endTime || new Date(event.endTime) > new Date(existingEvent.endTime)) {
                        existingEvent.endTime = event.endTime;
                    }
                } else {
                    // Fallback: if individual heartbeats don't have endTime, calculate from their startTime & duration
                    // This shouldn't be needed if startHeartbeat is fixed to provide endTime
                    const currentEventEndTime = new Date(new Date(event.startTime).getTime() + (event.duration * 1000));
                    if (!existingEvent.endTime || currentEventEndTime > new Date(existingEvent.endTime)) {
                        existingEvent.endTime = currentEventEndTime.toISOString();
                    }
                }

            } else if (EVENT_PRIORITY[event.type] >= EVENT_PRIORITY[existingEvent.type]) { // Use >= to replace if same or higher priority
                // For non-heartbeat events, replace if new event has same or higher priority
                eventMap.set(eventKey, { ...event }); // Store a copy
            }
        } else {
            // New event for this key
            const newEventToAdd = { ...event }; // Store a copy
            // Ensure initial heartbeats have an endTime if not already set (should be set by startHeartbeat)
            if (newEventToAdd.type === 'heartbeat' && !newEventToAdd.endTime && newEventToAdd.startTime && newEventToAdd.duration) {
                newEventToAdd.endTime = new Date(new Date(newEventToAdd.startTime).getTime() + (newEventToAdd.duration * 1000)).toISOString();
            } else if (newEventToAdd.type === 'heartbeat' && !newEventToAdd.endTime && newEventToAdd.startTime) {
                newEventToAdd.endTime = newEventToAdd.startTime; // If duration is 0 or missing
            }
            eventMap.set(eventKey, newEventToAdd);
        }
    });

    // Convert map back to array
    eventMap.forEach(event => {
        event.lastUpdateTime = new Date().toISOString(); // Add last update time to all events being sent
        combinedEvents.push(event);
    });

    return combinedEvents;
}

// Check if we have enough events to send
function shouldSendEvents(forceSend = false) {
    // Always send if forceSend is true (for critical events like page unload)
    if (forceSend) return true;
    
    // Otherwise, only send if we have enough events
    return sectionEvents.length >= EVENT_BATCH_THRESHOLD;
}

// Send tracking data to server with batching
function sendTrackingData(isSync = false, forceSend = false) {
    // Don't proceed if there's no data
    if (sectionEvents.length === 0) {
        return;
    }
    
    // If we're in an unload scenario or page is closing, always force send
    if (isSync || isPageClosing) {
        forceSend = true;
    }
    
    // Check if we should send based on threshold (unless forced)
    if (!forceSend && !isSync && !shouldSendEvents()) {
        console.log(`Not sending ${sectionEvents.length} events - below threshold (${EVENT_BATCH_THRESHOLD})`);
        saveEventsToLocalStorage(); // Make sure data is saved
        return;
    }
    
    // Update last update time
    lastUpdateTime = new Date().toISOString();
    
    // Prepare data
    const username = getUsername();
    const eventsCopy = [...sectionEvents];
    sectionEvents = []; // Clear events since we're going to process them
    
    // Process and combine events
    const processedEvents = processTrackingEvents(eventsCopy);
    
    const data = {
        username: username,
        url: window.location.href,
        events: processedEvents,
        timestamp: lastUpdateTime,
        sessionId: sessionId,
        lastUpdateTime: lastUpdateTime,
        isPageClosing: isPageClosing // Add flag to indicate this is from a page close
    };
    
    console.log(`Sending batch of ${processedEvents.length} events. Force send: ${forceSend}, Sync: ${isSync}, Page closing: ${isPageClosing}`);
    
    // Enhanced beacon handling for page unload/close
    if (isSync || isPageClosing) {
        let beaconSucceeded = false;
        
        // Try sendBeacon first if available (preferred method for unload)
        if (navigator.sendBeacon) {
            try {
                // Create a smaller, more critical payload for beacon
                const criticalData = {
                    username: data.username,
                    url: data.url,
                    events: data.events.filter(e => e.type !== 'heartbeat' || e.duration > 1), // Filter out tiny heartbeats
                    timestamp: data.timestamp,
                    sessionId: data.sessionId,
                    isPageClosing: true
                };
                
                const blob = new Blob([JSON.stringify(criticalData)], { type: 'application/json' });
                beaconSucceeded = navigator.sendBeacon(APPS_SCRIPT_URL, blob);
                
                if (beaconSucceeded) {
                    console.log('Successfully sent data via beacon');
                    localStorage.removeItem(LOCAL_STORAGE_KEY);
                    return;
                } else {
                    console.warn('sendBeacon failed, falling back to sync XHR');
                }
            } catch (error) {
                console.error('Beacon error:', error);
                // Will fall through to XHR fallback
            }
        }
        
        // Fallback to synchronous XHR if sendBeacon fails or isn't available
        if (!beaconSucceeded) {
            try {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', APPS_SCRIPT_URL, false); // false = synchronous
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(JSON.stringify(data));
                
                if (xhr.status >= 200 && xhr.status < 300) {
                    console.log('Successfully sent data via sync XHR');
                    localStorage.removeItem(LOCAL_STORAGE_KEY);
                } else {
                    console.error('XHR error:', xhr.statusText);
                    // Put events back in the queue
                    sectionEvents = [...eventsCopy, ...sectionEvents];
                    saveEventsToLocalStorage();
                }
            } catch (xhrError) {
                console.error('XHR failed:', xhrError);
                // Put events back in the queue
                sectionEvents = [...eventsCopy, ...sectionEvents];
                saveEventsToLocalStorage();
            }
        }
        
        return;
    }
    
    // Use fetch for normal tracking (non-unload scenarios)
    fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        mode: 'no-cors'
    })
    .then(() => {
        // Clear localStorage after successful send
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        console.log(`Successfully sent batch of ${processedEvents.length} events`);
    })
    .catch(error => {
        console.error('Tracking error:', error);
        // Put events back in the queue
        sectionEvents = [...eventsCopy, ...sectionEvents];
        // Update localStorage
        saveEventsToLocalStorage();
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
            if (accounts && accounts.length > 0 && accounts[0].username) {
                // Update cache
                usernameCache.value = accounts[0].username;
                usernameCache.timestamp = Date.now();
                
                return accounts[0].username;
            } else {
                // No valid username found - redirect to sign-in page
                // ADD THIS LINE BEFORE REDIRECT:
                localStorage.setItem('lastVisitedUrl', window.location.href);
                window.location.href = SIGN_IN_URL;
                return null;
            }
        } else {
            // No accounts data found - redirect to sign-in page
            // ADD THIS LINE BEFORE REDIRECT:
            localStorage.setItem('lastVisitedUrl', window.location.href);
            window.location.href = SIGN_IN_URL;
            return null;
        }
    } catch (error) {
        console.error('Error retrieving username:', error);
        // Error occurred - redirect to sign-in page
        // ADD THIS LINE BEFORE REDIRECT:
        localStorage.setItem('lastVisitedUrl', window.location.href);
        window.location.href = SIGN_IN_URL;
        return null;
    }
}

// Handle page unload
function handlePageUnload(event) {
    console.log("Page unload handler triggered! Event type:", event ? event.type : "unknown");
    
    // Reset tracking status
    isTrackingPaused = false;
    
    // Capture final state for all sections
    const exitTime = new Date();
    
    // First add a specific page closed event
    sectionEvents.push({
        type: 'page_closed',
        sectionId: getCurrentSectionId(),
        startTime: exitTime,
        endTime: exitTime,
        duration: 0,
        sessionId: sessionId,
        username: getUsername(),
        url: window.location.href
    });
    
    // Ensure all open sections get proper tracking events
    Object.keys(openSections).forEach(sectionId => {
        const section = openSections[sectionId];
        
        // Add missing heartbeats for active sections
        if (section.isActive) {
            const lastHeartbeatTime = section.lastHeartbeatTime || section.lastActiveTime;
            if (lastHeartbeatTime && (exitTime - lastHeartbeatTime) > 1000) {
                const duration = Math.round((exitTime - lastHeartbeatTime) / 1000);
                sectionEvents.push({
                    type: 'heartbeat',
                    sectionId: sectionId,
                    startTime: new Date(lastHeartbeatTime).toISOString(),
                    endTime: exitTime.toISOString(),
                    duration: duration,
                    visibilitySession: visibilitySession,
                    sessionId: sessionId,
                    username: getUsername()
                });
            }
        }
        
        // Add exit event
        sectionEvents.push({
            type: section.isActive ? 'active_on_exit' : 'inactive_on_exit',
            sectionId: sectionId,
            startTime: section.startTime,
            endTime: exitTime,
            duration: Math.round((exitTime - section.startTime) / 1000),
            sessionId: sessionId,
            username: getUsername()
        });
    });
    
    // Save session state
    saveSessionState();
    
    // CRITICAL: Save to localStorage before attempting to send
    saveEventsToLocalStorage();
    
    console.log(`Sending final batch of ${sectionEvents.length} events on page unload/close`);
    
    // Send the data with high priority
    sendTrackingData(true, true);
    
    // Increase delay to give more time for sendBeacon
    if (event && (event.type === 'beforeunload' || event.type === 'unload')) {
        const start = Date.now();
        while (Date.now() - start < 200) {
            // Blocking delay to give time for sendBeacon
        }
    }
    
    return null; // Don't return a value to avoid "Leave site?" dialog
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
            
            // Save to localStorage
            saveEventsToLocalStorage();
            
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

// Drag and Drop Functionality
function setupDragAndDrop() {
    const answers = document.querySelectorAll('#datatype-answers .answer');
    const dropAreas = document.querySelectorAll('#datatype-questions .drop-area');
    const resetButton = document.getElementById('datatype-reset-button');
    const answersContainer = document.getElementById('datatype-answers');
    const celebration = document.getElementById('datatype-celebration');
    
    let draggedItem = null;
    let dropCount = 0;
    let correctCount = 0;
    
    // Add event listeners to draggable items
    answers.forEach(answer => {
        answer.addEventListener('dragstart', handleDragStart);
        answer.addEventListener('dragend', handleDragEnd);
        answer.setAttribute('data-original-position', Array.from(answersContainer.children).indexOf(answer));
    });
    
    // Add event listeners to drop areas
    dropAreas.forEach(dropArea => {
        dropArea.addEventListener('dragover', handleDragOver);
        dropArea.addEventListener('dragenter', handleDragEnter);
        dropArea.addEventListener('dragleave', handleDragLeave);
        dropArea.addEventListener('drop', handleDrop);
    });
    
    // Reset button event listener
    if (resetButton) {
        resetButton.addEventListener('click', resetExercise);
        resetButton.style.display = 'flex'; // Make sure it's visible
    }
    
    // Drag and drop handler functions
    function handleDragStart(e) {
        // Try to initialize audio on drag start
        attemptPreemptiveAudioInit();
        
        draggedItem = this;
        setTimeout(() => {
            this.style.opacity = '0.5';
        }, 0);
        
        e.dataTransfer.setData('text/plain', this.dataset.type);
        
        // Add auto-scroll during drag
        document.addEventListener('dragover', handleDragScroll);
    }
    
    function handleDragEnd() {
        this.style.opacity = '1';
        draggedItem = null;
        
        dropAreas.forEach(area => {
            area.classList.remove('hover');
        });
        
        // Remove auto-scroll when drag ends
        document.removeEventListener('dragover', handleDragScroll);
    }
    
    function handleDragOver(e) {
        e.preventDefault();
    }
    
    function handleDragEnter(e) {
        e.preventDefault();
        if (!this.hasChildNodes()) {
            this.classList.add('hover');
        }
    }
    
    function handleDragLeave() {
        this.classList.remove('hover');
    }
    
    function handleDrop(e) {
        e.preventDefault();
        this.classList.remove('hover');
        
        if (this.children.length === 0) { // Only allow drop if the area is empty
            const droppedType = e.dataTransfer.getData('text/plain');
            const correctType = this.dataset.correct;
            
            const clonedItem = draggedItem.cloneNode(true);
            clonedItem.style.opacity = '1';
            clonedItem.style.cursor = 'default';
            clonedItem.style.margin = '0';
            clonedItem.style.width = '100%';
            clonedItem.style.textAlign = 'center';
            clonedItem.draggable = false;
            
            this.appendChild(clonedItem);
            draggedItem.remove();
            dropCount++;
            
            if (droppedType === correctType) {
                this.classList.add('correct');
                correctCount++;
                
                const feedback = this.nextElementSibling;
                feedback.classList.add('correct');
                feedback.style.display = 'block';
                
                // Play correct sound using the global function
                initAudio()
                    .then(() => {
                        playCorrectSound();
                    })
                    .catch(err => {
                        console.error("Could not play sound on correct drop:", err.message);
                    });
                
                if (correctCount === dropAreas.length) {
                    showDragDropCelebration();
                }
            } else {
                this.classList.add('incorrect');
                const feedback = this.nextElementSibling;
                feedback.innerHTML = `<span class="feedback-icon"><i class="fas fa-times-circle"></i></span> Incorrect. This value should be a ${correctType} in Python.`;
                feedback.classList.add('incorrect');
                feedback.style.display = 'block';
                
                setTimeout(() => {
                    const newAnswer = document.createElement('div');
                    newAnswer.className = 'answer';
                    newAnswer.setAttribute('draggable', 'true');
                    newAnswer.setAttribute('data-type', droppedType);
                    
                    const textSpan = document.createElement('span');
                    if (droppedType === 'Integer') textSpan.textContent = 'int';
                    else if (droppedType === 'Float') textSpan.textContent = 'float';
                    else if (droppedType === 'String') textSpan.textContent = 'str';
                    newAnswer.appendChild(textSpan);
                    
                    newAnswer.addEventListener('dragstart', handleDragStart);
                    newAnswer.addEventListener('dragend', handleDragEnd);
                    answersContainer.appendChild(newAnswer);
                    
                    this.innerHTML = '';
                    this.classList.remove('incorrect');
                    feedback.style.display = 'none';
                    feedback.classList.remove('incorrect');
                    dropCount--;
                }, 1500);
            }
        }
    }
    
    function handleDragScroll(e) {
        const scrollThreshold = 60; // pixels from viewport edge
        const scrollSpeed = 10; // pixels to scroll per event
        const viewportHeight = window.innerHeight;
        
        if (e.clientY < scrollThreshold) {
            // Scroll up when near top
            window.scrollBy(0, -scrollSpeed);
        } else if (e.clientY > viewportHeight - scrollThreshold) {
            // Scroll down when near bottom
            window.scrollBy(0, scrollSpeed);
        }
    }
    
    function resetExercise() {
        dropAreas.forEach(area => {
            area.innerHTML = '';
            area.classList.remove('correct', 'incorrect');
        });
        
        document.querySelectorAll('#datatype-questions .feedback').forEach(feedback => {
            feedback.style.display = 'none';
            feedback.classList.remove('correct', 'incorrect');
        });
        
        dropCount = 0;
        correctCount = 0;
        answersContainer.innerHTML = '';
        
        const answerTypes = ['Integer', 'Float', 'String', 'Integer', 'Float', 'String'];
        answerTypes.forEach(type => {
            const newAnswer = document.createElement('div');
            newAnswer.className = 'answer';
            newAnswer.setAttribute('draggable', 'true');
            newAnswer.setAttribute('data-type', type);
            const textSpan = document.createElement('span');
            if (type === 'Integer') textSpan.textContent = 'int';
            else if (type === 'Float') textSpan.textContent = 'float';
            else if (type === 'String') textSpan.textContent = 'str';
            newAnswer.appendChild(textSpan);
            newAnswer.addEventListener('dragstart', handleDragStart);
            newAnswer.addEventListener('dragend', handleDragEnd);
            answersContainer.appendChild(newAnswer);
        });
    }
    
    function showDragDropCelebration() {
        if (celebration) {
            celebration.style.display = 'none';
            setTimeout(() => {
                celebration.style.display = 'block';
                confetti({ particleCount: 150, spread: 160, origin: { x: 0.5, y: 0.6 }, colors: ['#003D7C', '#EF7C00', '#4D7CAE', '#ffffff'] });
                setTimeout(() => {
                    confetti({ particleCount: 100, angle: 60, spread: 55, origin: { x: 0, y: 0.65 }, colors: ['#003D7C', '#4D7CAE', '#ffffff'] });
                    setTimeout(() => {
                        confetti({ particleCount: 100, angle: 120, spread: 55, origin: { x: 1, y: 0.65 }, colors: ['#EF7C00', '#4D7CAE', '#ffffff'] });
                    }, 150);
                }, 500);
            }, 100);
        }
    }
}

// Fill in the Blanks Exercise Functionality
function setupFillInTheBlanks() {
    // Correct answers
    const correctAnswers = {
        'print-line1': 'Medication Dosage Calculator',
        'print-line2': '---------------------------',
        'print-line3': 'Standard dose: 500 mg',
        'print-line4': 'Child dose (age 8): 250.0 mg',
        'print-line5': 'Infant dose: 50.0 mg'
    };
    
    // Elements
    const checkButton = document.getElementById('print-check-button');
    const resetButton = document.getElementById('print-reset-button');
    const successFeedback = document.getElementById('print-success-feedback');
    const infoFeedback = document.getElementById('print-info-feedback');
    const validationMessage = document.getElementById('print-validation-message');
    
    if (!checkButton) return; // Exit if elements not found
    
    // Check button click handler
    checkButton.addEventListener('click', function() {
        // First check if all fields are filled
        let allFilled = true;
        let emptyFields = [];
        
        // Disable all input fields after checking
        for (let i = 1; i <= 5; i++) {
            const inputField = document.getElementById(`print-line${i}`);
            inputField.disabled = true;
        }
        
        
        // If not all fields are filled, show error and return
        if (!allFilled) {
            validationMessage.innerHTML = `
                <i class="fas fa-exclamation-circle"></i>
                Please fill in all blank fields before checking answers. Missing: Line ${emptyFields.join(', Line ')}
            `;
            validationMessage.style.display = 'block';
            return;
        }
        
        // Hide validation message if all fields are filled
        validationMessage.style.display = 'none';
        
        // If all fields are filled, proceed with checking
        let allCorrect = true;
        
        // Check each input
        for (let i = 1; i <= 5; i++) {
            const inputField = document.getElementById(`print-line${i}`);
            const inputItem = document.getElementById(`print-item-${i}`);
            const feedbackElement = document.getElementById(`print-feedback-${i}`);
            
            const userAnswer = inputField.value.trim();
            const isCorrect = userAnswer === correctAnswers[`print-line${i}`];
            
            // Update UI based on correctness
            if (isCorrect) {
                inputItem.classList.add('correct');
                inputItem.classList.remove('incorrect');
                feedbackElement.classList.add('correct');
                feedbackElement.classList.remove('incorrect');
                feedbackElement.innerHTML = `
                    <span class="feedback-icon"><i class="fas fa-check-circle"></i></span> Correct!
                `;
            } else {
                inputItem.classList.add('incorrect');
                inputItem.classList.remove('correct');
                feedbackElement.classList.add('incorrect');
                feedbackElement.classList.remove('correct');
                feedbackElement.innerHTML = `
                    <span class="feedback-icon"><i class="fas fa-times-circle"></i></span> The correct output is: "${correctAnswers[`print-line${i}`]}"
                `;
                allCorrect = false;
            }
            
            // Show feedback
            feedbackElement.style.display = 'block';
        }
        
        // Show appropriate summary feedback
        if (allCorrect) {
            successFeedback.style.display = 'block';
            infoFeedback.style.display = 'none';
            
            // Trigger celebration with confetti and sound if all answers are correct
            initAudio()
                .then(() => {
                    playCorrectSound();
                    showExerciseCelebration();
                })
                .catch(err => {
                    console.error("Could not play sound on correct answers:", err.message);
                    // Still show celebration even if sound fails
                    showExerciseCelebration();
                });
        } else {
            successFeedback.style.display = 'none';
            infoFeedback.style.display = 'block';
        }
        
        // Toggle buttons
        checkButton.classList.add('hidden');
        resetButton.classList.remove('hidden');
    });
    
    // Reset button click handler
    resetButton.addEventListener('click', function() {
        // Clear inputs
        for (let i = 1; i <= 5; i++) {
            const inputField = document.getElementById(`print-line${i}`);
            inputField.value = '';
            inputField.disabled = false;
            
            const inputItem = document.getElementById(`print-item-${i}`);
            inputItem.classList.remove('correct', 'incorrect');
            
            const feedbackElement = document.getElementById(`print-feedback-${i}`);
            feedbackElement.style.display = 'none';
        }
        
        // Hide validation message
        validationMessage.style.display = 'none';
        successFeedback.style.display = 'none';
        infoFeedback.style.display = 'none';
        
        // Toggle buttons
        resetButton.classList.add('hidden');
        checkButton.classList.remove('hidden');
    });
}

// Show exercise celebration
function showExerciseCelebration() {
    // Center burst
    confetti({
        particleCount: 150,
        spread: 160,
        origin: { x: 0.5, y: 0.6 },
        colors: ['#003D7C', '#EF7C00', '#4D7CAE', '#ffffff']
    });
    
    // Left side burst after delay
    setTimeout(() => {
        confetti({
            particleCount: 80,
            angle: 60,
            spread: 55,
            origin: { x: 0, y: 0.65 },
            colors: ['#003D7C', '#4D7CAE', '#ffffff']
        });
        
        // Right side burst after delay
        setTimeout(() => {
            confetti({
                particleCount: 80,
                angle: 120,
                spread: 55,
                origin: { x: 1, y: 0.65 },
                colors: ['#EF7C00', '#4D7CAE', '#ffffff']
            });
        }, 150);
    }, 300);
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
