import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore, Timestamp } from "firebase/firestore";
import { ActionPoint } from "../components/ActionPointsPanel";

// Your web app's Firebase configuration
// In a real app, set this up as environment variables (.env file)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    `https://${
      import.meta.env.VITE_FIREBASE_PROJECT_ID
    }-default-rtdb.firebaseio.com`,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);

// Type for a board column
export interface Column {
  id: string;
  title: string;
  order: number;
  sortByVotes?: boolean;
}

// Type for a board
export interface Board {
  id: string;
  name: string;
  createdAt: Timestamp;
  isActive: boolean;
  columns: Record<string, Column>;
  facilitatorId?: string;
  timerIsRunning?: boolean;
  timerStartTime?: Timestamp;
  timerDurationSeconds?: number;
  timerPausedDurationSeconds?: number;
  timerOriginalDurationSeconds?: number;
  actionPoints?: ActionPoint[];
  showAddColumnPlaceholder?: boolean;
}

// Type for a card (note card)
export interface Card {
  id: string;
  boardId: string;
  columnId: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: Timestamp;
  votes: number;
  position: number;
  actionable?: boolean;
  color?: string; // Tailwind class name (e.g., 'bg-red-200')
}

// Type for a user
export interface User {
  id: string;
  name: string;
  color: string; // Tailwind class name (e.g., 'bg-red-200')
  boardId: string;
  lastActive: Timestamp;
  isViewingPage?: boolean;
}

// Type for online user in realtime database
export interface OnlineUser {
  id: string;
  name: string;
  color: string; // Tailwind class name (e.g., 'bg-red-200')
  boardId: string;
  lastOnline: number;
}
