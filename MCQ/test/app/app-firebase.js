// Debug mode - set to true to see all debug messages
const DEBUG_MODE = true;

// Firebase Configuration - Get these from Firebase Console
const firebaseConfig = {
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
    VAPID_PUBLIC_KEY: 'BJ2e3MqkVGtVSij2HHyTCsYlWTP2QyXSLoP7kRCzt843LO1f6iq6dS4DpVMVuHIXSR6RK71Laroq0hSqIJcZ6p0'
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

// Initialize on page load
window.addEventListener('load', async () => {
    debugLog.add('Page loaded, initializing Firebase...');
    
    try {
        // Initialize Firebase
        firebase.initializeApp(FIREBASE_CONFIG);
        debugLog.add('Firebase initialized successfully');
        
        // Get messaging instance
        messaging = firebase.messaging();
        debugLog.add('Firebase Messaging instance created');
        
        // Register service worker with Firebase
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        debugLog.add('Service Worker registered', {
            scope: registration.scope,
            active: registration.active ? 'Yes' : 'No'
        });
        
        // Use the service worker with Firebase Messaging
        messaging.useServiceWorker(registration);
        
        // Check if already has permission
        const currentToken = await messaging.getToken({ vapidKey: CONFIG.VAPID_PUBLIC_KEY });
        if (currentToken) {
            debugLog.add('Already has FCM token:', currentToken);
            document.getElementById('enableBtn').disabled = true;
            document.getElementById('testBtn').disabled = false;
            updateStatus('Push notifications already enabled!');
            
            // Save the token to server (in case it's new)
            await saveTokenToServer(currentToken);
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
                registration.showNotification(notificationTitle, notificationOptions);
            }
        });
        
    } catch (error) {
        debugLog.add('Firebase initialization error', error);
        updateStatus('Firebase initialization failed: ' + error.message, true);
    }
});

// Update status message
function updateStatus(message, isError = false) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + (isError ? 'error' : 'success');
    debugLog.add(`Status update: ${message} (Error: ${isError})`);
}

// Subscribe to push notifications
async function subscribeToPush() {
    debugLog.add('Subscribe button clicked');
    
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
        const token = await messaging.getToken({ vapidKey: CONFIG.VAPID_PUBLIC_KEY });
        
        if (token) {
            debugLog.add('FCM token received:', token);
            
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
        }
        
    } catch (error) {
        debugLog.add('Subscription error', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        updateStatus('❌ Failed to subscribe: ' + error.message, true);
    }
}

// Save FCM token to server
async function saveTokenToServer(token) {
    debugLog.add('Saving FCM token to server...');
    
    try {
        // Create a fake subscription object that matches your current GAS format
        // but with the actual FCM token
        const subscriptionData = {
            endpoint: `https://fcm.googleapis.com/fcm/send/${token}`, // This helps identify it's FCM
            keys: {
                p256dh: 'not-used-for-fcm',
                auth: 'not-used-for-fcm'
            }
        };
        
        await fetch(CONFIG.GAS_ENDPOINT, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({
                action: 'subscribe',
                subscription: subscriptionData,
                fcmToken: token, // Send the actual token too
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            })
        });
        
        debugLog.add('FCM token sent to server (no-cors mode - cannot read response)');
        
    } catch (error) {
        debugLog.add('Failed to save token', error);
        throw error;
    }
}

// Send test notification
async function sendTestNotification() {
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

// Show debug information
function showDebugInfo() {
    const debugElement = document.getElementById('debug');
    if (debugElement.style.display === 'none') {
        debugElement.style.display = 'block';
        debugLog.updateDisplay();
    } else {
        debugElement.style.display = 'none';
    }
}

// Clear debug log
function clearDebugLog() {
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
