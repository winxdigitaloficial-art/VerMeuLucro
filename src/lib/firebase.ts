import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

// ========================================
// SUBSTITUIR PELAS SUAS CHAVES DO FIREBASE
// ========================================
const firebaseConfig = {
  apiKey: "AIzaSyBZnLh6OLjB2CgzY2KAxMW87M7g0z84y6w",
  authDomain: "vermeulucro.firebaseapp.com",
  projectId: "vermeulucro",
  storageBucket: "vermeulucro.firebasestorage.app",
  messagingSenderId: "6694336959",
  appId: "1:6694336959:web:7669b0b69584926c10c90a"
};
// ========================================

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
};
export const logout = async () => { await signOut(auth); };
