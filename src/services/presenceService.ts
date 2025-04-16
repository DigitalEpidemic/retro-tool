import {
  get,
  off,
  onDisconnect,
  onValue,
  ref,
  serverTimestamp as rtdbTimestamp,
  set,
  query as rtdbQuery,
  orderByChild,
  equalTo,
  DataSnapshot,
} from 'firebase/database';
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  writeBatch,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
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

  // Clean up inactive boards when a user joins any board
  await cleanupInactiveBoards();

  const userId = auth.currentUser.uid;
  const userStatusRef = ref(rtdb, `status/${userId}`);
  const userBoardRef = ref(rtdb, `boards/${boardId}/participants/${userId}`);
  const boardLastActiveRef = ref(rtdb, `boards/${boardId}/lastActive`);
  const userDocRef = doc(db, 'users', userId);

  // Try to get the user's color from Firestore, or generate one if not available
  let userColor;

  try {
    const userSnap = await getDoc(userDocRef);

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

  // Update the user's boardId in Firestore
  try {
    await updateDoc(userDocRef, {
      boardId,
      lastActive: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating user boardId in Firestore:', error);
    // Continue anyway - the joinBoard function may have already updated this
  }

  // When this device disconnects, update the user's status
  onDisconnect(userStatusRef).set({
    online: false,
    lastChanged: rtdbTimestamp(),
  });

  // When this user leaves this board, remove their presence
  onDisconnect(userBoardRef).remove();

  // When this user leaves, update the board's lastActive timestamp
  // This will help track when the last user left the board
  onDisconnect(boardLastActiveRef).set(rtdbTimestamp());

  // Set the user as online
  set(userStatusRef, {
    online: true,
    lastChanged: rtdbTimestamp(),
  });

  // Add the user to the board's participants
  set(userBoardRef, userData);

  // Update the board's lastActive timestamp
  set(boardLastActiveRef, rtdbTimestamp());

  // Return a cleanup function
  return () => {
    // Cancel any pending onDisconnect operations
    onDisconnect(userStatusRef).cancel();
    onDisconnect(userBoardRef).cancel();
    onDisconnect(boardLastActiveRef).cancel();

    // Explicitly set the user's status to offline
    set(userStatusRef, {
      online: false,
      lastChanged: rtdbTimestamp(),
    });

    // Remove the user from the board's participants
    set(userBoardRef, null);

    // Update the board's lastActive timestamp when the user leaves
    set(boardLastActiveRef, rtdbTimestamp());

    // Update the user's boardId to null in Firestore
    try {
      updateDoc(userDocRef, {
        boardId: null,
        lastActive: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating user boardId to null:', error);
    }
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

/**
 * Checks for and deletes boards that have been inactive (no participants) for at least 1 minute
 * This is called when a user joins any board to clean up abandoned boards
 */
export const cleanupInactiveBoards = async (): Promise<void> => {
  try {
    // Get all board references from RTDB
    const boardsRef = ref(rtdb, 'boards');
    const boardsSnapshot = await get(boardsRef);

    if (!boardsSnapshot.exists()) {
      return; // No boards to check
    }

    const now = Date.now();
    const inactiveThreshold = 60 * 1000; // 1 minute in milliseconds
    const inactiveBoardIds: string[] = [];

    // Iterate through all boards in RTDB
    boardsSnapshot.forEach((boardSnapshot: DataSnapshot) => {
      const boardId = boardSnapshot.key;
      if (!boardId) return;

      // Check if the board has any participants
      const participantsSnapshot = boardSnapshot.child('participants');

      if (!participantsSnapshot.exists() || participantsSnapshot.size === 0) {
        // No participants, check when the last participant left
        const lastActiveSnapshot = boardSnapshot.child('lastActive');

        if (lastActiveSnapshot.exists()) {
          let lastActiveTime = lastActiveSnapshot.val();

          // Handle Firebase server timestamp format (it could be a number or an object with .seconds)
          if (typeof lastActiveTime === 'object' && lastActiveTime !== null) {
            // Convert server timestamp to milliseconds
            if (lastActiveTime.seconds) {
              lastActiveTime = lastActiveTime.seconds * 1000;
            } else {
              // If we can't interpret the timestamp format, use current time - we don't want to delete too quickly
              lastActiveTime = now;
            }
          }

          // If the board has been inactive for more than the threshold, mark for deletion
          if (now - lastActiveTime > inactiveThreshold) {
            inactiveBoardIds.push(boardId);
          }
        } else {
          // If there's no lastActive timestamp, add one now and don't delete yet
          set(ref(rtdb, `boards/${boardId}/lastActive`), rtdbTimestamp());
        }
      } else {
        // Board has participants, update the lastActive time
        set(ref(rtdb, `boards/${boardId}/lastActive`), rtdbTimestamp());
      }
    });

    // Delete all inactive boards and their cards
    for (const boardId of inactiveBoardIds) {
      await deleteInactiveBoard(boardId);
    }

    if (inactiveBoardIds.length > 0) {
      console.log(`Cleaned up ${inactiveBoardIds.length} inactive boards`);
    }
  } catch (error) {
    console.error('Error cleaning up inactive boards:', error);
  }
};

/**
 * Deletes an inactive board and all associated cards
 * @param boardId ID of the board to delete
 */
const deleteInactiveBoard = async (boardId: string): Promise<void> => {
  try {
    // First, verify the board exists in Firestore
    const boardRef = doc(db, 'boards', boardId);
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) {
      // If the board doesn't exist in Firestore, just clean up RTDB
      await set(ref(rtdb, `boards/${boardId}`), null);
      return;
    }

    // Step 1: Delete all cards associated with this board
    const cardsQuery = query(collection(db, 'cards'), where('boardId', '==', boardId));
    const cardsSnapshot = await getDocs(cardsQuery);

    if (cardsSnapshot.size > 0) {
      const batch = writeBatch(db);
      cardsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // Step 2: Delete the board itself from Firestore
    await deleteDoc(boardRef);

    // Step 3: Clean up the RTDB entry
    await set(ref(rtdb, `boards/${boardId}`), null);

    console.log(`Successfully deleted inactive board ${boardId} and all associated cards`);
  } catch (error) {
    console.error(`Error deleting inactive board ${boardId}:`, error);
  }
};
