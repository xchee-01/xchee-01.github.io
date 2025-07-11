// app-firebase.js - Firebase Push Notification Implementation
console.log('[app-firebase.js] Script loaded');

// Debug mode - set to true to see all debug messages
const DEBUG_MODE = true;

// Firebase Configuration - From your Firebase Console
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBqrBRmxmJSZmjHTSWhikZEzBegaogIzQI",
  authDomain: "pwaapp-fe16c.firebaseapp.com",
  projectId: "pwaapp-fe16c",
  storageBucket: "pwaapp-fe16c.firebasestorage.app",
  messagingSenderId: "138452600697",
  appId: "1:138452600697:web:a1f3d2c96b1dafd84911a8"
};

// Your server configuration
const CONFIG = {
    GAS_ENDPOINT: 'https://script.google.com/macros/s/AKfycbwRUpi2Pai4DTuW-eZOK5RCWkA70c5wTunfqfpRgXDcz-PvEmF8nBDdXmhhWKxmSqptfQ/exec',
    VAPID_PUBLIC_KEY: 'BEXBjinVivC6jAfhKZov_HMujSaEBZf3PLfYt_01O3pGDzZRh2xzZAnBeiNFQO4vuryTQKUfx6gbPj2fTE4bcGE'
};

// Debug logging system
const debugLog = {
    logs: [],
    add: function(message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}`;
        this.logs.push(logEntry);
        if (DEBUG_MODE) {
            console.log(logEntry);
        }
        this.updateDisplay();
    },
    updateDisplay: function() {
        const debugElement = document.getElementById('debug');
        if (debugElement && debugElement.style.display !== 'none') {
            debugElement.textContent = this.logs.join('\n\n');
            debugElement.scrollTop = debugElement.scrollHeight;
        }
    },
    clear: function() {
        this.logs = [];
        this.updateDisplay();
    }
};

// Initialize Firebase
let messaging = null;

// Check if Firebase is loaded
if (typeof firebase === 'undefined') {
    debugLog.add('ERROR: Firebase SDK not loaded!');
    updateStatus('Firebase SDK failed to load. Please check your internet connection.', true);
} else {
    debugLog.add('Firebase SDK is loaded');
}

// Initialize on page load
window.addEventListener('load', async () => {
    debugLog.add('Page loaded, initializing Firebase...');
    
    // Check if Firebase is available
    if (typeof firebase === 'undefined') {
        updateStatus('Firebase SDK not loaded!', true);
        debugLog.add('ERROR: Firebase is undefined');
        return;
    }
    
    // Warn if appId needs to be updated
    if (FIREBASE_CONFIG.appId.includes('YOUR_APP_ID')) {
        updateStatus('⚠️ Please update the Firebase appId in the configuration!', true);
        debugLog.add('WARNING: Firebase appId not configured properly');
        debugLog.add('To fix this:');
        debugLog.add('1. Go to https://console.firebase.google.com/');
        debugLog.add('2. Select your project (pwaapp-fe16c)');
        debugLog.add('3. Go to Project Settings → General');
        debugLog.add('4. Find your web app and copy the appId');
        debugLog.add('5. Update it in app-firebase.js');
        // Continue anyway for testing
    }
    
    try {
        // Initialize Firebase
        firebase.initializeApp(FIREBASE_CONFIG);
        debugLog.add('Firebase initialized successfully');
        debugLog.add('Firebase project ID: ' + FIREBASE_CONFIG.projectId);
        
        // Get messaging instance
        messaging = firebase.messaging();
        debugLog.add('Firebase Messaging instance created');
        
        // Check browser support
        if (!('serviceWorker' in navigator)) {
            updateStatus('Service Workers not supported in this browser!', true);
            debugLog.add('ERROR: Service Worker not supported');
            return;
        }
        
        if (!('PushManager' in window)) {
            updateStatus('Push notifications not supported in this browser!', true);
            debugLog.add('ERROR: Push Manager not supported');
            return;
        }
        
        debugLog.add('Browser supports required features');
        
        // Register service worker with Firebase
        try {
            const registration = await navigator.serviceWorker.register('/MCQ/test/app/firebase-messaging-sw.js');
            debugLog.add('Service Worker registered', {
                scope: registration.scope,
                active: registration.active ? 'Yes' : 'No',
                state: registration.active ? registration.active.state : 'Not active'
            });
            
            // Wait for service worker to be ready
            await navigator.serviceWorker.ready;
            debugLog.add('Service Worker is ready');
            
            // Use the service worker with Firebase Messaging
            messaging.useServiceWorker(registration);
            debugLog.add('Firebase Messaging using service worker');
            
            // Check if already has permission and token
            try {
                const currentToken = await messaging.getToken({ vapidKey: CONFIG.VAPID_PUBLIC_KEY });
                if (currentToken) {
                    debugLog.add('Already has FCM token:', currentToken);
                    document.getElementById('enableBtn').disabled = true;
                    document.getElementById('testBtn').disabled = false;
                    updateStatus('Push notifications already enabled!');
                    
                    // Save the token to server (in case it's new)
                    await saveTokenToServer(currentToken);
                } else {
                    debugLog.add('No existing FCM token found');
                }
            } catch (tokenError) {
                debugLog.add('Could not check for existing token:', tokenError.message);
            }
            
        } catch (swError) {
            debugLog.add('Service Worker registration failed', {
                message: swError.message,
                stack: swError.stack
            });
            updateStatus('Service Worker registration failed: ' + swError.message, true);
            
            // Provide helpful error messages
            if (swError.message.includes('Failed to register')) {
                debugLog.add('Possible causes:');
                debugLog.add('1. The firebase-messaging-sw.js file is not uploaded');
                debugLog.add('2. The file path is incorrect');
                debugLog.add('3. There is a syntax error in the service worker file');
            }
        }
        
        // Handle incoming messages when app is in foreground
        messaging.onMessage((payload) => {
            debugLog.add('Message received in foreground:', payload);
            
            // Show notification manually when app is in foreground
            const notificationTitle = payload.notification.title;
            const notificationOptions = {
                body: payload.notification.body,
                icon: payload.notification.icon || '/MCQ/test/app/icon-192.png',
                badge: '/MCQ/test/app/icon-192.png',
                data: payload.data,
                actions: [
                    {
                        action: 'open',
                        title: '📝 Take Quiz'
                    },
                    {
                        action: 'later',
                        title: '⏰ Later'
                    }
                ]
            };
            
            if (Notification.permission === 'granted') {
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification(notificationTitle, notificationOptions);
                });
            }
        });
        
    } catch (error) {
        debugLog.add('Firebase initialization error', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        updateStatus('Firebase initialization failed: ' + error.message, true);
        
        if (error.message.includes('projectId')) {
            debugLog.add('ERROR: Invalid Firebase configuration. Check your FIREBASE_CONFIG object.');
        }
    }
});

// Update status message
function updateStatus(message, isError = false) {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = message;
        status.className = 'status ' + (isError ? 'error' : 'success');
    }
    debugLog.add(`Status update: ${message} (Error: ${isError})`);
}

// Subscribe to push notifications - Make it global
window.subscribeToPush = async function() {
    debugLog.add('Subscribe button clicked');
    
    if (!messaging) {
        updateStatus('Firebase not initialized!', true);
        return;
    }
    
    try {
        // Step 1: Request notification permission
        debugLog.add('Requesting notification permission...');
        const permission = await Notification.requestPermission();
        debugLog.add('Permission result:', permission);
        
        if (permission !== 'granted') {
            updateStatus('❌ Notification permission denied. Please enable in browser settings.', true);
            return;
        }
        
        // Step 2: Get FCM token
        debugLog.add('Getting FCM token...');
        debugLog.add('Using VAPID key: ' + CONFIG.VAPID_PUBLIC_KEY.substring(0, 20) + '...');
        
        const token = await messaging.getToken({ vapidKey: CONFIG.VAPID_PUBLIC_KEY });
        
        if (token) {
            debugLog.add('FCM token received:', token);
            debugLog.add('Token length: ' + token.length);
            
            // Step 3: Save token to server
            await saveTokenToServer(token);
            
            updateStatus('✅ Push notifications enabled successfully!');
            document.getElementById('testBtn').disabled = false;
            document.getElementById('enableBtn').disabled = true;
            
            // Listen for token refresh
            messaging.onTokenRefresh(async () => {
                debugLog.add('Token refreshed');
                const refreshedToken = await messaging.getToken({ vapidKey: CONFIG.VAPID_PUBLIC_KEY });
                await saveTokenToServer(refreshedToken);
            });
            
        } else {
            updateStatus('❌ No FCM token available. Check your Firebase configuration.', true);
            debugLog.add('Failed to get FCM token - no token returned');
        }
        
    } catch (error) {
        debugLog.add('Subscription error', {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        updateStatus('❌ Failed to subscribe: ' + error.message, true);
        
        // Provide helpful error messages
        if (error.code === 'messaging/permission-blocked') {
            debugLog.add('Notifications are blocked in browser settings');
        } else if (error.code === 'messaging/failed-service-worker-registration') {
            debugLog.add('Service worker registration failed - check if firebase-messaging-sw.js exists');
        }
    }
}

// Save FCM token to server
async function saveTokenToServer(token) {
    debugLog.add('Saving FCM token to server...');
    debugLog.add('Token to save: ' + token.substring(0, 50) + '...');
    
    try {
        // Create a subscription object that includes the FCM token
        const subscriptionData = {
            endpoint: `https://fcm.googleapis.com/fcm/send/${token}`,
            keys: {
                p256dh: 'not-used-for-fcm',
                auth: 'not-used-for-fcm'
            }
        };
        
        const requestBody = {
            action: 'subscribe',
            subscription: subscriptionData,
            fcmToken: token, // Send the actual token
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        };
        
        debugLog.add('Sending to server:', requestBody);
        
        await fetch(CONFIG.GAS_ENDPOINT, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify(requestBody)
        });
        
        debugLog.add('FCM token sent to server (no-cors mode - cannot read response)');
        
    } catch (error) {
        debugLog.add('Failed to save token', error);
        throw error;
    }
}

// Send test notification - Make it global
window.sendTestNotification = async function() {
    debugLog.add('Test notification button clicked');
    
    try {
        debugLog.add('Sending test notification request to server...');
        await fetch(CONFIG.GAS_ENDPOINT, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({
                action: 'test',
                timestamp: new Date().toISOString()
            })
        });
        
        debugLog.add('Test notification request sent (no-cors mode)');
        updateStatus('✅ Test notification request sent! Check your device for the notification.');
        
    } catch (error) {
        debugLog.add('Test notification error', error);
        updateStatus('❌ Error: ' + error.message, true);
    }
}

// Show debug information - Make it global
window.showDebugInfo = function() {
    const debugElement = document.getElementById('debug');
    if (debugElement) {
        if (debugElement.style.display === 'none') {
            debugElement.style.display = 'block';
            debugLog.updateDisplay();
        } else {
            debugElement.style.display = 'none';
        }
    }
}

// Clear debug log - Make it global
window.clearDebugLog = function() {
    debugLog.clear();
    updateStatus('Debug log cleared', false);
}

// Add error handlers
window.addEventListener('error', (error) => {
    debugLog.add('Global error', {
        message: error.message,
        filename: error.filename,
        line: error.lineno,
        column: error.colno
    });
});

window.addEventListener('unhandledrejection', (event) => {
    debugLog.add('Unhandled promise rejection', {
        reason: event.reason
    });
});

debugLog.add('app-firebase.js loaded successfully');
