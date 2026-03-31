import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCw-Sa1gQWq9QBc26lotaqlC1BIxAki6_M',
  authDomain: 'gasstationproject-9dd89.firebaseapp.com',
  projectId: 'gasstationproject-9dd89',
  storageBucket: 'gasstationproject-9dd89.firebasestorage.app',
  messagingSenderId: '978890379614',
  appId: '1:978890379614:web:a69c92841c92dc2828bfcf',
  measurementId: 'G-3D7H5K6CFX',
};

export const isFirebaseConfigured = true;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
let analytics = null;

if (typeof window !== 'undefined') {
  isSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {});
}

export { analytics, app, auth, db };
