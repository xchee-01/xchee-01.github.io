// firebase-messaging-sw.js
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

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload);
  
  const notificationTitle = payload.notification.title || 'Quiz App Notification';
  const notificationOptions = {
    body: payload.notification.body || 'You have a new quiz available!',
    icon: '/MCQ/test/app/icon-192.png',
    badge: '/MCQ/test/app/icon-192.png',
    tag: payload.data?.tag || 'quiz-notification',
    data: payload.data,
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

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);
  event.notification.close();
  
  let url = '/MCQ/test/app/';
  if (event.notification.data && event.notification.data.url) {
    url = event.notification.data.url;
  }
  
  if (event.action === 'open') {
    // Open the quiz
    event.waitUntil(
      clients.openWindow(url)
    );
  } else if (event.action === 'later') {
    // Just close the notification
    event.notification.close();
  } else {
    // Default click - open the app
    event.waitUntil(
      clients.openWindow(url)
    );
  }
});
