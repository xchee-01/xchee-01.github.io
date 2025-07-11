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

// Handle background messages
messaging.onBackgroundMessage((payload) => {
    debugLog('Received background message:', payload);
    
    // Customize notification here
    const notificationTitle = payload.notification?.title || 'Quiz Notification';
    const notificationOptions = {
        body: payload.notification?.body || 'You have a new quiz!',
        icon: payload.notification?.icon || '/MCQ/test/app/icon-192.png',
        badge: '/MCQ/test/app/icon-192.png',
        tag: payload.data?.tag || 'quiz-notification',
        data: {
            ...payload.data,
            url: payload.data?.url || '/MCQ/test/app/',
            FCM_MSG: payload
        },
        requireInteraction: true,
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
    
    // Ensure we show the notification
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    debugLog('Notification clicked:', {
        action: event.action,
        notification: event.notification.tag
    });
    
    event.notification.close();
    
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
        // You could implement snooze functionality here
    }
});

// Service Worker installation
self.addEventListener('install', (event) => {
    debugLog('Firebase Service Worker installing...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    debugLog('Firebase Service Worker activated');
    event.waitUntil(clients.claim());
});

// Error handling
self.addEventListener('error', (error) => {
    debugLog('Service Worker error:', error);
});

self.addEventListener('unhandledrejection', (event) => {
    debugLog('Service Worker unhandled rejection:', event.reason);
});
