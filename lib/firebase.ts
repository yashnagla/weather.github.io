import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, initializeAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase only if config is provided
const app =
  getApps().length === 0 && firebaseConfig.apiKey
    ? initializeApp(firebaseConfig)
    : getApps().length > 0
    ? getApp()
    : null;

let analytics: ReturnType<typeof getAnalytics> | null = null;

// Initialize Analytics only in the browser and if supported
if (app && typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      // Use initializeAnalytics instead of getAnalytics to pass config
      analytics = initializeAnalytics(app, {
        config: {
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
        }
      });
    }
  });
}

export { app, analytics };
