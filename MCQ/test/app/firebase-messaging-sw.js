// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase configuration
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

// Platform detection helper
function detectPlatform() {
    const ua = (self.navigator?.userAgent || '').toLowerCase();
    
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod') || 
        (ua.includes('mac') && ua.includes('safari') && !ua.includes('chrome'))) {
        return 'ios';
    } else if (ua.includes('android')) {
        return 'android';
    } else if (ua.includes('windows')) {
        return 'windows';
    } else if (ua.includes('mac')) {
        return 'mac';
    } else if (ua.includes('linux')) {
        return 'linux';
    }
    
    return 'unknown';
}

// Debug logging
function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    const platform = detectPlatform();
    console.log(`[Firebase SW ${timestamp}] [${platform}] ${message}`, data || '');
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

// Get platform-specific notification options
function getPlatformNotificationOptions(payload, platform) {
    const baseOptions = {
        body: payload.notification?.body || 'You have a new quiz!',
        icon: payload.notification?.icon || '/MCQ/test/app/icon-192x192.png',
        badge: '/MCQ/test/app/icon-192x192.png',
        tag: payload.data?.tag || `quiz-notification-${Date.now()}`,
        data: {
            ...payload.data,
            url: payload.data?.url || '/MCQ/test/app/',
            FCM_MSG: payload,
            timestamp: new Date().toISOString(),
            platform: platform
        }
    };
    
    // Platform-specific options
    switch(platform) {
        case 'ios':
            // iOS supports basic notifications only
            return {
                ...baseOptions,
                // iOS doesn't support these features
                // No requireInteraction
                // No vibrate
                // No actions
                // No renotify
                silent: false
            };
            
        case 'android':
            // Android supports all features
            return {
                ...baseOptions,
                requireInteraction: true,
                renotify: true,
                silent: false,
                vibrate: [200, 100, 200, 100, 200],
                priority: 'high',
                urgency: 'high',
                android: {
                    priority: 'high',
                    vibrateTimingsMillis: [200, 100, 200, 100, 200],
                    visibility: 'public',
                    channelId: 'quiz-urgent'
                },
                actions: [
                    {
                        action: 'open',
                        title: '📝 Take Quiz Now',
                        type: 'button'
                    },
                    {
                        action: 'later',
                        title: '⏰ Remind Later',
                        type: 'button'
                    }
                ]
            };
            
        case 'windows':
        case 'mac':
        case 'linux':
        default:
            // Desktop browsers support most features
            return {
                ...baseOptions,
                requireInteraction: true,
                renotify: true,
                silent: false,
                vibrate: [200, 100, 200],
                image: payload.notification?.image || '/MCQ/test/app/icon-512x512.png',
                actions: [
                    {
                        action: 'open',
                        title: '📝 Take Quiz Now',
                        type: 'button'
                    },
                    {
                        action: 'later',
                        title: '⏰ Remind Later',
                        type: 'button'
                    }
                ]
            };
    }
}

// Handle background messages with platform detection
messaging.onBackgroundMessage((payload) => {
    debugLog('Received background message:', payload);
    
    const platform = detectPlatform();
    debugLog('Detected platform:', platform);
    
    // Extract notification data
    const notificationTitle = payload.notification?.title || 'Quiz Notification';
    const notificationOptions = getPlatformNotificationOptions(payload, platform);
    
    debugLog('Notification options:', notificationOptions);
    
    // Try multiple notification methods to ensure display
    return Promise.all([
        // Method 1: Standard notification
        self.registration.showNotification(notificationTitle, notificationOptions)
            .then(() => debugLog('Notification displayed successfully'))
            .catch(error => {
                debugLog('Error showing notification:', error);
                // Fallback: Try with minimal options
                return self.registration.showNotification(notificationTitle, {
                    body: notificationOptions.body,
                    icon: notificationOptions.icon,
                    tag: notificationOptions.tag,
                    data: notificationOptions.data
                });
            }),
        
        // Method 2: Broadcast to all clients
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(windowClients => {
            windowClients.forEach(client => {
                client.postMessage({
                    type: 'NOTIFICATION_RECEIVED',
                    payload: payload,
                    platform: platform,
                    timestamp: new Date().toISOString()
                });
            });
        }),
        
        // Method 3: Force focus if possible (not on iOS)
        platform !== 'ios' ? clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(windowClients => {
            if (windowClients.length > 0 && windowClients[0].focus) {
                debugLog('Attempting to focus client window');
                return windowClients[0].focus().catch(e => {
                    debugLog('Focus attempt failed (expected):', e.message);
                });
            }
        }) : Promise.resolve()
    ]).then(() => {
        debugLog('All notification methods completed');
        // Keep service worker alive briefly
        startWakeInterval();
    }).catch(error => {
        debugLog('Critical error in notification handling:', error);
    });
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    const platform = detectPlatform();
    debugLog('Notification clicked:', {
        action: event.action,
        notification: event.notification.tag,
        platform: platform
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
                        platform: platform,
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
        event.ports[0].postMessage({ 
            alive: true,
            platform: detectPlatform()
        });
    } else if (event.data?.type === 'GET_PLATFORM') {
        // Return platform info
        event.ports[0].postMessage({ 
            platform: detectPlatform()
        });
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
        !event.request.url.includes('.png') &&
        !event.request.url.includes('.jpg')) {
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
        const platform = detectPlatform();
        debugLog('Push data:', { ...data, platform });
        
        // Fallback notification if onBackgroundMessage doesn't fire
        if (data.notification) {
            const title = data.notification.title || 'Quiz App Notification';
            const options = getPlatformNotificationOptions(data, platform);
            options.body = data.notification.body || 'You have a new message';
            
            event.waitUntil(
                self.registration.showNotification(title, options)
                    .then(() => debugLog('Fallback notification shown'))
                    .catch(error => {
                        debugLog('Fallback notification error:', error);
                        // Try minimal notification
                        return self.registration.showNotification(title, {
                            body: options.body,
                            icon: options.icon,
                            tag: 'fallback-' + Date.now()
                        });
                    })
            );
        }
    } catch (e) {
        debugLog('Error processing push data:', e);
    }
});

// Platform-specific test function
self.addEventListener('message', (event) => {
    if (event.data?.type === 'TEST_NOTIFICATION') {
        const platform = detectPlatform();
        debugLog('Test notification requested for platform:', platform);
        
        const testOptions = getPlatformNotificationOptions({
            notification: {
                title: '🧪 Platform Test',
                body: `Testing on ${platform} platform`
            },
            data: {
                test: true,
                platform: platform
            }
        }, platform);
        
        self.registration.showNotification('🧪 Platform Test', testOptions)
            .then(() => {
                event.ports[0].postMessage({ 
                    success: true,
                    platform: platform
                });
            })
            .catch(error => {
                event.ports[0].postMessage({ 
                    success: false,
                    error: error.message,
                    platform: platform
                });
            });
    }
});

debugLog('Service Worker loaded and ready', {
    platform: detectPlatform(),
    scope: self.registration.scope
});
