import { auth, rtdb, OnlineUser } from './firebase';
import { 
  ref, 
  onValue, 
  onDisconnect, 
  set, 
  serverTimestamp as rtdbTimestamp,
  off,
  query,
  orderByChild,
  equalTo
} from 'firebase/database';

// Generate a consistent color for a user based on their ID
const getColorForUser = (userId: string) => {
  // Use user ID to generate a consistent color
  const hash = Array.from(userId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 80%)`; // Pastel color
};

/**
 * Setup presence tracking for the current user in a specific board
 * @param boardId The board ID to track presence for
 * @param displayName The user's display name
 * @returns A cleanup function to call when the component unmounts
 */
export const setupPresence = (boardId: string, displayName: string): (() => void) => {
  // Don't proceed if there's no authenticated user
  if (!auth.currentUser) {
    console.error('Cannot setup presence without an authenticated user');
    return () => {}; // Return empty cleanup function
  }
  
  const userId = auth.currentUser.uid;
  const userStatusRef = ref(rtdb, `status/${userId}`);
  const userBoardRef = ref(rtdb, `boards/${boardId}/participants/${userId}`);
  
  // User data to store
  const userData: OnlineUser = {
    id: userId,
    name: displayName || 'Anonymous',
    color: getColorForUser(userId),
    boardId,
    lastOnline: Date.now()
  };
  
  // When this device disconnects, update the user's status
  onDisconnect(userStatusRef).set({
    online: false,
    lastChanged: rtdbTimestamp()
  });
  
  // When this user leaves this board, remove their presence
  onDisconnect(userBoardRef).remove();
  
  // Set the user as online
  set(userStatusRef, {
    online: true,
    lastChanged: rtdbTimestamp()
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
      lastChanged: rtdbTimestamp()
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
  onValue(boardParticipantsRef, (snapshot) => {
    const participants: OnlineUser[] = [];
    
    if (snapshot.exists()) {
      // Convert the object to an array
      snapshot.forEach((childSnapshot) => {
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
) => {
  if (!newName.trim()) return;
  
  const userBoardRef = ref(rtdb, `boards/${boardId}/participants/${userId}`);
  
  // Use the update method from firebase/database to only update the name field
  await set(userBoardRef, {
    id: userId,
    name: newName,
    color: getColorForUser(userId),
    boardId,
    lastOnline: Date.now()
  });
}; 