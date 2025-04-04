import { initializeApp } from "firebase/app";
import { getFirestore, Timestamp } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const signInAnonymousUser = async () => {
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error) {
    console.error("Error signing in anonymously:", error);
    throw error;
  }
};

// Database Schema

// boards collection
export interface Board {
  // Add export keyword
  id: string;
  name: string;
  createdAt: Timestamp;
  isActive: boolean;
  columns: {
    [columnId: string]: {
      id: string;
      title: string;
      order: number;
      sortByVotes?: boolean;
    };
  };
  facilitatorId?: string; // optional creator ID
  timerStartTime?: Timestamp | null; // When the timer was started or resumed
  timerDurationSeconds?: number; // Original duration set when started/reset
  timerIsRunning?: boolean; // True if the timer is currently counting down
  timerPausedDurationSeconds?: number | null; // Remaining seconds when paused, null otherwise
  timerOriginalDurationSeconds?: number; // The originally set duration that should be used for resets
}

// cards collection
export interface Card {
  // Add export keyword
  id: string;
  boardId: string;
  columnId: string;
  content: string;
  authorId: string; // anonymous ID
  authorName: string;
  createdAt: Timestamp;
  votes: number;
  position: number; // for ordering
}

// actions collection
export interface Action {
  // Add export keyword
  id: string;
  boardId: string;
  content: string;
  assignee?: string;
  status: "pending" | "in-progress" | "completed";
  createdAt: Timestamp;
  relatedCardIds: string[]; // reference to source cards
}

// users collection (for temporary session data)
export interface User {
  // Add export keyword
  id: string;
  name: string;
  color: string; // for user identification
  boardId: string;
  lastActive: Timestamp;
}
