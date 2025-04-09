import {
  get,
  off,
  onDisconnect,
  onValue,
  ref,
  serverTimestamp as rtdbTimestamp,
  set,
} from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, OnlineUser, rtdb } from './firebase';

// Generate a consistent Tailwind color class for a user based on their ID
const getColorForUser = (userId: string) => {
  // Available Tailwind color classes - exactly 14 distinct colors
  const tailwindColors = [
    'bg-red-200',
    'bg-orange-200',
    'bg-amber-200',
    'bg-yellow-200',
    'bg-lime-200',
    'bg-green-200',
    'bg-teal-200',
    'bg-cyan-200',
    'bg-sky-200',
    'bg-blue-200',
    'bg-indigo-200',
    'bg-violet-200',
    'bg-fuchsia-200',
    'bg-rose-200',
  ];

  // Use user ID to generate a consistent index
  const hash = Array.from(userId).reduce((acc, char) => acc + char.charCodeAt(0), 0);

  // Select a color based on the hash
  const colorIndex = hash % tailwindColors.length;
  return tailwindColors[colorIndex];
};

/**
 * Setup presence tracking for the current user in a specific board
 * @param boardId The board ID to track presence for
 * @param displayName The user's display name
 * @returns A cleanup function to call when the component unmounts
 */
export const setupPresence = async (boardId: string, displayName: string): Promise<() => void> => {
  // Don't proceed if there's no authenticated user
  if (!auth.currentUser) {
    console.error('Cannot setup presence without an authenticated user');
    return () => {}; // Return empty cleanup function
  }

  const userId = auth.currentUser.uid;
  const userStatusRef = ref(rtdb, `status/${userId}`);
  const userBoardRef = ref(rtdb, `boards/${boardId}/participants/${userId}`);

  // Try to get the user's color from Firestore, or generate one if not available
  let userColor;

  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists() && userSnap.data().color) {
      // Use color from Firestore
      userColor = userSnap.data().color;
    } else {
      // Fall back to generated color
      userColor = getColorForUser(userId);
    }
  } catch (error) {
    console.error('Error fetching user color for presence:', error);
    // Fallback to generated color
    userColor = getColorForUser(userId);
  }

  // User data to store
  const userData: OnlineUser = {
    id: userId,
    name: displayName || 'Anonymous',
    color: userColor,
    boardId,
    lastOnline: Date.now(),
  };

  // When this device disconnects, update the user's status
  onDisconnect(userStatusRef).set({
    online: false,
    lastChanged: rtdbTimestamp(),
  });

  // When this user leaves this board, remove their presence
  onDisconnect(userBoardRef).remove();

  // Set the user as online
  set(userStatusRef, {
    online: true,
    lastChanged: rtdbTimestamp(),
  });

  // Add the user to the board's participants
  set(userBoardRef, userData);

  // Return a cleanup function
  return () => {
    // Cancel any pending onDisconnect operations
    onDisconnect(userStatusRef).cancel();
    onDisconnect(userBoardRef).cancel();

    // Explicitly set the user's status to offline
    set(userStatusRef, {
      online: false,
      lastChanged: rtdbTimestamp(),
    });

    // Remove the user from the board's participants
    set(userBoardRef, null);
  };
};

/**
 * Subscribe to the participants in a board
 * @param boardId The board ID to track participants for
 * @param callback Function called with the list of current participants
 * @returns A function to unsubscribe
 */
export const subscribeToParticipants = (
  boardId: string,
  callback: (participants: OnlineUser[]) => void
): (() => void) => {
  const boardParticipantsRef = ref(rtdb, `boards/${boardId}/participants`);

  // Listen for changes to the participants in this board
  onValue(boardParticipantsRef, snapshot => {
    const participants: OnlineUser[] = [];

    if (snapshot.exists()) {
      // Convert the object to an array
      snapshot.forEach(childSnapshot => {
        participants.push(childSnapshot.val() as OnlineUser);
      });

      // Sort participants by name for consistent ordering
      participants.sort((a, b) => a.name.localeCompare(b.name));
    }

    callback(participants);
  });

  // Return a function to unsubscribe
  return () => {
    off(boardParticipantsRef);
  };
};

/**
 * Update a user's name
 * @param userId User ID to update
 * @param boardId Board ID where the user is present
 * @param newName New name for the user
 */
export const updateParticipantName = async (
  userId: string,
  boardId: string,
  newName: string
): Promise<void> => {
  // Don't update if the new name is empty or only whitespace
  if (!newName || newName.trim() === '') {
    return;
  }

  const userBoardRef = ref(rtdb, `boards/${boardId}/participants/${userId}`);

  try {
    // Get current user data
    const snapshot = await get(userBoardRef);
    if (snapshot.exists()) {
      const userData = snapshot.val();
      // Update just the name, keeping other properties
      await set(userBoardRef, {
        ...userData,
        name: newName,
      });
    }
  } catch (error) {
    console.error('Error updating participant name in RTDB:', error);
    throw error;
  }
};

// Update a participant's color in the real-time database
export const updateParticipantColor = async (
  userId: string,
  boardId: string,
  newColor: string // Now a Tailwind class name like 'bg-red-200'
): Promise<void> => {
  const userBoardRef = ref(rtdb, `boards/${boardId}/participants/${userId}`);

  try {
    // Get current user data
    const snapshot = await get(userBoardRef);
    if (snapshot.exists()) {
      const userData = snapshot.val();
      // Update just the color, keeping other properties
      await set(userBoardRef, {
        ...userData,
        color: newColor,
      });
    }
  } catch (error) {
    console.error('Error updating participant color in RTDB:', error);
    throw error;
  }
};
