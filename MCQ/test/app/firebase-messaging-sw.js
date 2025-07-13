// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase configuration - From your Firebase Console
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBqrBRmxmJSZmjHTSWhikZEzBegaogIzQI",
  authDomain: "pwaapp-fe16c.firebaseapp.com",
  projectId: "pwaapp-fe16c",
  storageBucket: "pwaapp-fe16c.firebasestorage.app",
  messagingSenderId: "138452600697",
  appId: "1:138452600697:web:a1f3d2c96b1dafd84911a8"
};

// Initialize Firebase in the service worker
firebase.initializeApp(FIREBASE_CONFIG);

// Retrieve Firebase Messaging instance
const messaging = firebase.messaging();

// Debug logging
function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[Firebase SW ${timestamp}] ${message}`, data || '');
}

// Force wake the service worker periodically
let wakeInterval;
function startWakeInterval() {
    if (!wakeInterval) {
        wakeInterval = setInterval(() => {
            debugLog('Service worker heartbeat');
        }, 30000); // Every 30 seconds
    }
}

// Handle background messages with HIGH PRIORITY
messaging.onBackgroundMessage((payload) => {
    debugLog('Received background message:', payload);
    
    // Extract notification data
    const notificationTitle = payload.notification?.title || 'Quiz Notification';
    const notificationBody = payload.notification?.body || 'You have a new quiz!';
    
    // Force high priority notification options
    const notificationOptions = {
        body: notificationBody,
        icon: payload.notification?.icon || '/MCQ/test/app/icon-192x192.png',
        badge: '/MCQ/test/app/icon-192x192.png',
        tag: payload.data?.tag || `quiz-notification-${Date.now()}`,
        data: {
            ...payload.data,
            url: payload.data?.url || '/MCQ/test/app/',
            FCM_MSG: payload,
            timestamp: new Date().toISOString()
        },
        
        // HIGH PRIORITY SETTINGS
        requireInteraction: true, // Don't auto-dismiss
        renotify: true, // Always notify even if tag exists
        silent: false, // Make sound
        vibrate: [200, 100, 200], // Vibration pattern
        
        // Additional priority hints
        priority: 'high',
        urgency: 'high',
        
        // Visual attention grabbers
        image: payload.notification?.image || '/MCQ/test/app/icon-512x512.png',
        
        // Action buttons
        actions: [
            {
                action: 'open',
                title: '📝 Take Quiz',
                type: 'button'
            },
            {
                action: 'later',
                title: '⏰ Later',
                type: 'button'
            }
        ]
    };
    
    // Try multiple notification methods to ensure display
    return Promise.all([
        // Method 1: Standard notification
        self.registration.showNotification(notificationTitle, notificationOptions),
        
        // Method 2: Broadcast to all clients to ensure foreground handling
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(windowClients => {
            windowClients.forEach(client => {
                client.postMessage({
                    type: 'NOTIFICATION_RECEIVED',
                    payload: payload,
                    timestamp: new Date().toISOString()
                });
            });
        }),
        
        // Method 3: Force focus if possible
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(windowClients => {
            if (windowClients.length > 0 && windowClients[0].focus) {
                // This might help bring attention on some systems
                debugLog('Attempting to focus client window');
                return windowClients[0].focus().catch(e => {
                    debugLog('Focus attempt failed (expected):', e.message);
                });
            }
        })
    ]).then(() => {
        debugLog('Notification displayed successfully');
        // Keep service worker alive briefly
        startWakeInterval();
    }).catch(error => {
        debugLog('Error showing notification:', error);
    });
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    debugLog('Notification clicked:', {
        action: event.action,
        notification: event.notification.tag
    });
    
    // Close the notification
    event.notification.close();
    
    // Clear wake interval
    if (wakeInterval) {
        clearInterval(wakeInterval);
        wakeInterval = null;
    }
    
    const urlToOpen = event.notification.data?.url || '/MCQ/test/app/';
    
    if (event.action === 'open' || !event.action) {
        // Open the app
        event.waitUntil(
            clients.matchAll({ 
                type: 'window',
                includeUncontrolled: true 
            }).then((windowClients) => {
                // Check if app is already open
                for (let client of windowClients) {
                    if (client.url.includes('/MCQ/test/app') && 'focus' in client) {
                        debugLog('Focusing existing window');
                        return client.focus();
                    }
                }
                // Open new window if not open
                if (clients.openWindow) {
                    debugLog('Opening new window:', urlToOpen);
                    return clients.openWindow(urlToOpen);
                }
            })
        );
    } else if (event.action === 'later') {
        debugLog('User chose to take quiz later');
        // Send message to clients about snooze
        event.waitUntil(
            clients.matchAll({
                type: 'window',
                includeUncontrolled: true
            }).then(windowClients => {
                windowClients.forEach(client => {
                    client.postMessage({
                        type: 'NOTIFICATION_SNOOZED',
                        timestamp: new Date().toISOString()
                    });
                });
            })
        );
    }
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
    debugLog('Notification closed:', event.notification.tag);
    // Clear wake interval
    if (wakeInterval) {
        clearInterval(wakeInterval);
        wakeInterval = null;
    }
});

// Service Worker installation
self.addEventListener('install', (event) => {
    debugLog('Firebase Service Worker installing...');
    self.skipWaiting();
});

// Service Worker activation
self.addEventListener('activate', (event) => {
    debugLog('Firebase Service Worker activated');
    event.waitUntil(clients.claim());
});

// Handle messages from clients
self.addEventListener('message', (event) => {
    debugLog('Message from client:', event.data);
    
    if (event.data?.type === 'KEEP_ALIVE') {
        // Respond to keep-alive pings
        event.ports[0].postMessage({ alive: true });
    }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-notifications') {
        debugLog('Periodic sync: checking notifications');
        event.waitUntil(
            // You could check for pending notifications here
            Promise.resolve()
        );
    }
});

// Handle fetch events for offline support
self.addEventListener('fetch', (event) => {
    // Only log non-asset requests to reduce noise
    if (!event.request.url.includes('.js') && 
        !event.request.url.includes('.css') && 
        !event.request.url.includes('.png')) {
        debugLog('Fetch event:', event.request.url);
    }
});

// Error handling
self.addEventListener('error', (error) => {
    debugLog('Service Worker error:', error);
});

self.addEventListener('unhandledrejection', (event) => {
    debugLog('Service Worker unhandled rejection:', event.reason);
});

// Push event handler (raw push events)
self.addEventListener('push', (event) => {
    debugLog('Raw push event received');
    
    if (!event.data) {
        debugLog('Push event with no data');
        return;
    }
    
    try {
        const data = event.data.json();
        debugLog('Push data:', data);
        
        // Fallback notification if onBackgroundMessage doesn't fire
        if (data.notification) {
            const title = data.notification.title || 'Quiz App Notification';
            const options = {
                body: data.notification.body || 'You have a new message',
                icon: '/MCQ/test/app/icon-192x192.png',
                badge: '/MCQ/test/app/icon-192x192.png',
                requireInteraction: true,
                tag: 'fallback-' + Date.now()
            };
            
            event.waitUntil(
                self.registration.showNotification(title, options)
            );
        }
    } catch (e) {
        debugLog('Error processing push data:', e);
    }
});

debugLog('Service Worker loaded and ready');
