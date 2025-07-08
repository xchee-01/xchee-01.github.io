// API Configuration
export const API_ENDPOINTS = {
    student: 'https://script.google.com/macros/s/AKfycbxWuiUJ-C1CAFV6iT8YW5JxCNQu-8FKypdgHUkqHyFXO5q4fZ2oY5UQds9sMLRZxutJnQ/exec',
    question: 'https://script.google.com/macros/s/AKfycbwgz36nEAPOzRZGj8645EvJSXbg3aS5o36lA1MNiQ9sqh2loIBuNEdUfLgA01jt0Uw/exec',
    topic: 'https://script.google.com/macros/s/AKfycbwWdBN7BKln9k1FB_mxMjY63CVoLQx8Qb6cMCrxTztkjXnWrRWyBXy6k_9FWGQ7IfXLBA/exec'
};

// JSONP Request Handler
export function jsonpRequest(url, callback, errorCallback) {
    const callbackName = 'jsonpCallback_' + Date.now();
    const script = document.createElement('script');
    let timeoutId;
    
    // Setup timeout
    timeoutId = setTimeout(() => {
        delete window[callbackName];
        document.body.removeChild(script);
        if (errorCallback) {
            errorCallback(new Error('Request timeout'));
        }
    }, 10000); // 10 second timeout
    
    window[callbackName] = function(data) {
        clearTimeout(timeoutId);
        delete window[callbackName];
        document.body.removeChild(script);
        callback(data);
    };
    
    script.onerror = function() {
        clearTimeout(timeoutId);
        delete window[callbackName];
        document.body.removeChild(script);
        if (errorCallback) {
            errorCallback(new Error('Failed to load script'));
        }
    };
    
    script.src = `${url}?callback=${callbackName}`;
    document.body.appendChild(script);
}

// Load data for specific view
export function loadViewData(view, showLoadingFn, hideLoadingFn, updateLastUpdatedFn, renderViewFn) {
    const endpoint = API_ENDPOINTS[view];
    
    // Show loading
    showLoadingFn(view);
    
    jsonpRequest(endpoint, 
        (data) => {
            // Hide loading
            hideLoadingFn(view);
            
            // Update last updated time
            updateLastUpdatedFn(data.lastUpdated);
            
            // Render view
            renderViewFn(view, data);
        },
        (error) => {
            // Show error message
            const loadingEl = document.getElementById(`${view}Loading`);
            loadingEl.innerHTML = `
                <div style="color: var(--danger-red); padding: 2rem;">
                    <h3>Error Loading Data</h3>
                    <p>Failed to load ${view} data. Please try again later.</p>
                    <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--nus-blue); color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
    );
}

// Update last updated timestamp
export function updateLastUpdated(timestamp) {
    if (!timestamp) {
        document.getElementById('lastUpdated').textContent = 'Last updated: Unknown';
        return;
    }
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
        document.getElementById('lastUpdated').textContent = 'Last updated: Invalid date';
        return;
    }
    const formatted = date.toLocaleString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('lastUpdated').textContent = `Last updated: ${formatted}`;
}
