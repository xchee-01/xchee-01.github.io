// Service Worker for Medical MCQ Quiz PWA
const CACHE_NAME = 'mcq-quiz-v1';
const urlsToCache = [
  'https://xchee-01.github.io/MCQ/test/app/',
  'https://xchee-01.github.io/MCQ/test/app/index.html',
  'https://xchee-01.github.io/MCQ/test/app/manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
      .catch(() => {
        // Offline fallback
        return new Response('Offline - Please check your connection', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      })
  );
});

// Push event - handle push notifications
self.addEventListener('push', (event) => {
  console.log('Push event received:', event);
  
  let notificationData = {
    title: 'Medical MCQ Quiz',
    body: 'New quiz available!',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png'
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.notification?.title || notificationData.title,
        body: data.notification?.body || notificationData.body,
        icon: data.notification?.icon || notificationData.icon,
        badge: data.notification?.badge || notificationData.badge,
        data: data.data || {}
      };
    } catch (e) {
      console.error('Error parsing push data:', e);
    }
  }
  
  const options = {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    vibrate: [200, 100, 200],
    data: notificationData.data,
    actions: [
      {
        action: 'open',
        title: 'Open Quiz'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Notification click received:', event);
  
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    // Open the app or focus existing window
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url === 'https://xchee-01.github.io/MCQ/test/app/' && 'focus' in client) {
            return client.focus();
          }
          if (clients.openWindow) {
            return clients.openWindow('https://xchee-01.github.io/MCQ/test/app/');
          }
        }
      })
    );
  }
});

// Background sync for offline quiz submissions (optional)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-quiz-results') {
    event.waitUntil(syncQuizResults());
  }
});

async function syncQuizResults() {
  // Implement syncing of offline quiz results
  console.log('Syncing quiz results...');
}
