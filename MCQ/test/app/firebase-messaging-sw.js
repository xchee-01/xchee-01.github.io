// firebase-messaging-sw.js
// Import Firebase libraries
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyBqrBRmxmJSZmjHTSWhikZEzBegaogIzQI",
  authDomain: "pwaapp-fe16c.firebaseapp.com",
  projectId: "pwaapp-fe16c",
  storageBucket: "pwaapp-fe16c.firebasestorage.app",
  messagingSenderId: "138452600697",
  appId: "1:138452600697:web:a1f3d2c96b1dafd84911a8"
});

// Retrieve Firebase Messaging instance
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  // Extract notification data
  const notificationTitle = payload.notification?.title || 'Quiz App Notification';
  const notificationBody = payload.notification?.body || 'You have a new quiz available!';
  
  const notificationOptions = {
    body: notificationBody,
    icon: '/MCQ/test/app/icon-192.png',
    badge: '/MCQ/test/app/icon-192.png',
    tag: payload.data?.tag || 'quiz-notification',
    data: {
      url: payload.data?.url || '/MCQ/test/app/',
      ...payload.data
    },
    requireInteraction: true,
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'open',
        title: '📝 Take Quiz',
        icon: '/MCQ/test/app/icon-192.png'
      },
      {
        action: 'later',
        title: '⏰ Later',
        icon: '/MCQ/test/app/icon-192.png'
      }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click received:', event);
  
  // Close the notification
  event.notification.close();
  
  // Default URL
  let urlToOpen = '/MCQ/test/app/';
  
  // Check if URL is provided in notification data
  if (event.notification.data && event.notification.data.url) {
    urlToOpen = event.notification.data.url;
  }
  
  // Handle different actions
  if (event.action === 'open') {
    // User clicked "Take Quiz"
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        // Check if app is already open
        for (let client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // If not open, open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  } else if (event.action === 'later') {
    // User clicked "Later" - just close the notification
    console.log('[firebase-messaging-sw.js] User chose to take quiz later');
  } else {
    // Default click on notification body
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        // Check if app is already open
        for (let client of windowClients) {
          if (client.url.includes('/MCQ/test/app/') && 'focus' in client) {
            return client.focus();
          }
        }
        // If not open, open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});

// Optional: Handle push events directly (for custom handling)
self.addEventListener('push', (event) => {
  console.log('[firebase-messaging-sw.js] Push event received:', event);
  
  if (event.data) {
    try {
      const data = event.data.json();
      console.log('[firebase-messaging-sw.js] Push data:', data);
    } catch (e) {
      console.error('[firebase-messaging-sw.js] Error parsing push data:', e);
    }
  }
});

// Service worker installation
self.addEventListener('install', (event) => {
  console.log('[firebase-messaging-sw.js] Service Worker installing...');
  self.skipWaiting();
});

// Service worker activation
self.addEventListener('activate', (event) => {
  console.log('[firebase-messaging-sw.js] Service Worker activated');
  event.waitUntil(clients.claim());
});

// Log service worker registration
console.log('[firebase-messaging-sw.js] Firebase messaging service worker is loaded and running');
