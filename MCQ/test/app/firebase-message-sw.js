// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
// REPLACE WITH YOUR CONFIG
firebase.initializeApp({
  apiKey: "AIzaSyBAcoyOwbFwQVzFUp-FuI3Uh4uLF1MWpf0",
  authDomain: "mcq-quizz-app.firebaseapp.com",
  projectId: "mcq-quizz-app",
  storageBucket: "mcq-quizz-app.firebasestorage.app",
  messagingSenderId: "256408674329",
  appId: "1:256408674329:web:fddf7b3b74c489b4ce4a88"
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
