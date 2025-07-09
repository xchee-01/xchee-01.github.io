// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
// REPLACE WITH YOUR CONFIG
firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload);
  
  const notificationTitle = payload.notification.title || 'Medical MCQ Quiz';
  const notificationOptions = {
    body: payload.notification.body || 'New quiz available!',
    icon: payload.notification.icon || '/icon-192x192.png',
    badge: '/badge-72x72.png',
    data: payload.data || {},
    actions: [
      {
        action: 'open',
        title: 'Take Quiz'
      },
      {
        action: 'later',
        title: 'Later'
      }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
