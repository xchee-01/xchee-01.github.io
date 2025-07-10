// Debug mode - set to true to see all debug messages
const DEBUG_MODE = true;

// Configuration
const CONFIG = {
    GAS_ENDPOINT: 'https://script.google.com/macros/s/AKfycbwRUpi2Pai4DTuW-eZOK5RCWkA70c5wTunfqfpRgXDcz-PvEmF8nBDdXmhhWKxmSqptfQ/exec', // You'll get this in Step 3
    VAPID_PUBLIC_KEY: 'BJ2e3MqkVGtVSij2HHyTCsYlWTP2QyXSLoP7kRCzt843LO1f6iq6dS4DpVMVuHIXSR6RK71Laroq0hSqIJcZ6p0',   // You'll get this in Step 2
    SERVICE_WORKER_PATH: 'https://xchee-01.github.io/MCQ/test/app/sw.js'
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

// Initialize on page load
window.addEventListener('load', async () => {
    debugLog.add('Page loaded, initializing...');
    
    // Check browser support
    if (!('serviceWorker' in navigator)) {
        updateStatus('Service Workers not supported in this browser!', true);
        debugLog.add('ERROR: Service Worker not supported');
        return;
    }
    
    if (!('PushManager' in window)) {
        updateStatus('Push notifications not supported in this browser!', true);
        debugLog.add('ERROR: Push Manager not supported');
        return;
    }
    
    debugLog.add('Browser supports required features');
    
    // Register service worker
    try {
        const registration = await navigator.serviceWorker.register(CONFIG.SERVICE_WORKER_PATH);
        debugLog.add('Service Worker registered', {
            scope: registration.scope,
            active: registration.active ? 'Yes' : 'No'
        });
        
        // Check if already subscribed
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            debugLog.add('Already subscribed to push notifications');
            document.getElementById('enableBtn').disabled = true;
            document.getElementById('testBtn').disabled = false;
            updateStatus('Push notifications already enabled!');
        }
    } catch (error) {
        debugLog.add('Service Worker registration failed', error);
        updateStatus('Service Worker registration failed: ' + error.message, true);
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
        
        // Step 2: Get service worker registration
        debugLog.add('Getting service worker registration...');
        const registration = await navigator.serviceWorker.ready;
        debugLog.add('Service worker is ready');
        
        // Step 3: Subscribe to push
        debugLog.add('Subscribing to push notifications...');
        
        if (!CONFIG.VAPID_PUBLIC_KEY || CONFIG.VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY_HERE') {
            updateStatus('❌ VAPID key not configured! See Step 2 in the guide.', true);
            return;
        }
        
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY)
        });
        
        debugLog.add('Push subscription successful', subscription.toJSON());
        
        // Step 4: Save subscription to server
        if (!CONFIG.GAS_ENDPOINT || CONFIG.GAS_ENDPOINT === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
            updateStatus('⚠️ Server endpoint not configured! See Step 3 in the guide.', true);
            debugLog.add('WARNING: Google Apps Script endpoint not configured');
            // Enable test button anyway for local testing
            document.getElementById('testBtn').disabled = false;
            document.getElementById('enableBtn').disabled = true;
            return;
        }
        
        await saveSubscription(subscription);
        
        updateStatus('✅ Push notifications enabled successfully!');
        document.getElementById('testBtn').disabled = false;
        document.getElementById('enableBtn').disabled = true;
        
    } catch (error) {
        debugLog.add('Subscription error', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        updateStatus('❌ Failed to subscribe: ' + error.message, true);
    }
}

// Save subscription to server
async function saveSubscription(subscription) {
    debugLog.add('Saving subscription to server...');
    
    try {
        const response = await fetch(CONFIG.GAS_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'subscribe',
                subscription: subscription.toJSON(),
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            })
        });
        
        const result = await response.json();
        debugLog.add('Server response', result);
        
        if (!response.ok) {
            throw new Error('Server returned error: ' + result.error);
        }
    } catch (error) {
        debugLog.add('Failed to save subscription', error);
        throw error;
    }
}

// Send test notification
async function sendTestNotification() {
    debugLog.add('Test notification button clicked');
    
    try {
        // Check if we have a valid endpoint
        if (!CONFIG.GAS_ENDPOINT || CONFIG.GAS_ENDPOINT === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
            // Local test - show notification directly
            debugLog.add('No server endpoint - showing local test notification');
            
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification('Test Quiz Notification', {
                body: 'This is a local test. Configure server for real push notifications.',
                icon: 'https://xchee-01.github.io/MCQ/test/app/icon-192.png',
                badge: 'https://xchee-01.github.io/MCQ/test/app/icon-192.png',
                vibrate: [200, 100, 200]
            });
            
            updateStatus('✅ Local test notification sent!');
            return;
        }
        
        // Send request to server
        debugLog.add('Sending test notification request to server...');
        const response = await fetch(CONFIG.GAS_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'test',
                timestamp: new Date().toISOString()
            })
        });
        
        const result = await response.json();
        debugLog.add('Server response', result);
        
        if (response.ok) {
            updateStatus('✅ Test notification request sent! Check your notifications.');
        } else {
            updateStatus('❌ Failed to send test notification: ' + result.error, true);
        }
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

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String) {
    debugLog.add('Converting VAPID key...');
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
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
