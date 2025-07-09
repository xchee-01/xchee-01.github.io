// Node.js script to send push notifications using FCM API v1
// Requires: npm install google-auth-library node-fetch

const { GoogleAuth } = require('google-auth-library');
const fetch = require('node-fetch');

// Configuration
const PROJECT_ID = 'mcq-quizz-app'; // Replace with your Firebase project ID
const SERVICE_ACCOUNT_PATH = 'https://xchee-01.github.io/MCQ/test/app/service-account-key.json'; // Path to your service account JSON file

// Initialize Google Auth
const auth = new GoogleAuth({
  keyFile: SERVICE_ACCOUNT_PATH,
  scopes: ['https://www.googleapis.com/auth/firebase.messaging']
});

async function getAccessToken() {
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  return accessToken.token;
}

async function sendNotification(fcmToken, title, body, data = {}) {
  try {
    const accessToken = await getAccessToken();
    
    const message = {
      message: {
        token: fcmToken,
        notification: {
          title: title,
          body: body
        },
        data: data,
        webpush: {
          fcm_options: {
            link: 'https://xchee-01.github.io/MCQ/test/app/'
          },
          notification: {
            icon: '/icon-192x192.png',
            badge: '/badge-72x72.png',
            requireInteraction: true,
            actions: [
              {
                action: 'open',
                title: 'Open Quiz'
              }
            ]
          }
        }
      }
    };

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      }
    );

    const result = await response.json();
    
    if (response.ok) {
      console.log('Notification sent successfully:', result);
      return { success: true, result };
    } else {
      console.error('Failed to send notification:', result);
      return { success: false, error: result };
    }
  } catch (error) {
    console.error('Error sending notification:', error);
    return { success: false, error: error.message };
  }
}

// Example usage
async function sendTestNotification() {
  // Replace with actual FCM token from your client
  const fcmToken = 'YOUR_CLIENT_FCM_TOKEN';
  
  const result = await sendNotification(
    fcmToken,
    '📚 New Medical Quiz Available!',
    'Test your knowledge with 20 new emergency medicine questions.',
    {
      quizId: 'emergency-med-001',
      difficulty: 'intermediate',
      questionCount: '20'
    }
  );
  
  console.log('Send result:', result);
}

// Send different types of notifications
async function sendQuizReminder(fcmToken) {
  return await sendNotification(
    fcmToken,
    '⏰ Study Reminder',
    'Time for your daily medical quiz practice!',
    {
      type: 'reminder',
      action: 'daily-quiz'
    }
  );
}

async function sendQuizResults(fcmToken, score, total) {
  return await sendNotification(
    fcmToken,
    '🎯 Quiz Results',
    `You scored ${score}/${total} on your last quiz. Keep practicing!`,
    {
      type: 'results',
      score: score.toString(),
      total: total.toString()
    }
  );
}

// Export for use in other modules
module.exports = {
  sendNotification,
  sendQuizReminder,
  sendQuizResults
};

// Run test if called directly
if (require.main === module) {
  sendTestNotification();
}
