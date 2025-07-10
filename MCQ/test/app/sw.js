// Debug logging
function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[SW ${timestamp}] ${message}`, data || '');
}

// Service Worker installation
self.addEventListener('install', (event) => {
    debugLog('Service Worker installing...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    debugLog('Service Worker activated');
    event.waitUntil(clients.claim());
});

// Handle push notifications
self.addEventListener('push', function(event) {
    debugLog('Push event received', event);
    
    let notificationData = {
        title: 'Quiz Reminder',
        body: 'You have a new quiz waiting!',
        tag: 'quiz-notification'
    };
    
    // Try to parse push data
    if (event.data) {
        try {
            const data = event.data.json();
            debugLog('Push data parsed:', data);
            notificationData = Object.assign(notificationData, data);
        } catch (e) {
            debugLog('Failed to parse push data, using text:', e);
            notificationData.body = event.data.text();
        }
    }
    
    const options = {
        body: notificationData.body,
        icon: 'https://xchee-01.github.io/MCQ/test/app/icon-192.png',
        badge: 'https://xchee-01.github.io/MCQ/test/app/icon-192.png',
        vibrate: [200, 100, 200],
        tag: notificationData.tag,
        requireInteraction: true,
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1,
            url: notificationData.url || 'https://xchee-01.github.io/MCQ/test/app/'
        },
        actions: [
            {
                action: 'open',
                title: '📝 Take Quiz',
                icon: 'https://xchee-01.github.io/MCQ/test/app/icon-192.png'
            },
            {
                action: 'later',
                title: '⏰ Later'
            }
        ]
    };
    
    debugLog('Showing notification with options:', options);
    
    event.waitUntil(
        self.registration.showNotification(notificationData.title, options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
    debugLog('Notification clicked:', {
        action: event.action,
        notification: event.notification.tag
    });
    
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        // Open the app
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then(windowClients => {
                // Check if app is already open
                for (let client of windowClients) {
                    if (client.url === event.notification.data.url && 'focus' in client) {
                        debugLog('Focusing existing window');
                        return client.focus();
                    }
                }
                // Open new window if not open
                if (clients.openWindow) {
                    debugLog('Opening new window');
                    return clients.openWindow(event.notification.data.url);
                }
            })
        );
    } else if (event.action === 'later') {
        debugLog('User chose to take quiz later');
    }
});

// Error handling
self.addEventListener('error', (error) => {
    debugLog('Service Worker error:', error);
});

self.addEventListener('unhandledrejection', (event) => {
    debugLog('Service Worker unhandled rejection:', event.reason);
});
