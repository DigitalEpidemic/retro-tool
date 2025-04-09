import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs, // Add getDoc back for resetTimer
  increment,
  onSnapshot,
  query,
  serverTimestamp, // Keep for potential future use if needed
  setDoc, // Import setDoc for creating with specific ID
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Board, Card, db, User } from './firebase'; // Import auth along with other exports
// nanoid and Timestamp are no longer used directly here

// Create a new board, optionally with a specific ID
export const createBoard = async (
  name: string,
  creatorId?: string,
  boardId?: string // Optional specific ID
) => {
  // Default columns
  const columns = {
    col1: { id: 'col1', title: 'What went well', order: 0 },
    col2: { id: 'col2', title: 'What can be improved', order: 1 },
    col3: { id: 'col3', title: 'Action items', order: 2 },
  };

  const boardData = {
    name,
    createdAt: serverTimestamp(),
    isActive: true,
    columns,
    facilitatorId: creatorId || null, // Store creator if provided
    showAddColumnPlaceholder: false, // Default to hiding the add column placeholder
  };

  if (boardId) {
    // Create with a specific ID using setDoc
    const boardRef = doc(db, 'boards', boardId);
    await setDoc(boardRef, boardData);
    return boardId; // Return the provided ID
  } else {
    // Original behavior: Create with an auto-generated ID using addDoc
    const boardRef = await addDoc(collection(db, 'boards'), boardData);
    return boardRef.id; // Return the generated ID
  }
};

// Subscribe to board updates
export const subscribeToBoard = (
  boardId: string,
  callback: (board: Board | null) => void // Use Board interface
) => {
  const boardRef = doc(db, 'boards', boardId);
  return onSnapshot(boardRef, doc => {
    if (doc.exists()) {
      // Cast doc.data() to Board
      callback({ id: doc.id, ...doc.data() } as Board);
    } else {
      callback(null);
    }
  });
};

// Subscribe to cards for a specific board
export const subscribeToCards = (
  boardId: string,
  callback: (cards: Card[]) => void // Use Card interface
) => {
  const cardsQuery = query(
    collection(db, 'cards'),
    where('boardId', '==', boardId)
    // Removed orderBy temporarily as it might be causing indexing issues
  );
  return onSnapshot(cardsQuery, querySnapshot => {
    const cards: Card[] = []; // Use Card interface
    querySnapshot.forEach(doc => {
      // Cast data to Card, assuming it matches the interface
      cards.push({ id: doc.id, ...doc.data() } as Card);
    });
    // Sort cards by position client-side instead
    cards.sort((a, b) => (a.position || 0) - (b.position || 0));
    callback(cards);
  });
};

// Add a new card to a column
export const addCard = async (
  boardId: string,
  columnId: string,
  content: string,
  authorId: string,
  authorName: string = 'Anonymous',
  authorColor?: string // Tailwind class name (e.g., 'bg-red-200')
) => {
  const cardData = {
    boardId,
    columnId,
    content,
    authorId,
    authorName,
    createdAt: serverTimestamp(),
    votes: 0,
    position: Date.now(), // Use timestamp for initial positioning, will be updated by DnD
    color: authorColor, // Tailwind class name for card background
  };
  await addDoc(collection(db, 'cards'), cardData);
};

// Update card position after drag-and-drop
export const updateCardPosition = async (
  cardId: string,
  newColumnId: string,
  newIndex: number,
  oldColumnId: string,
  boardId: string
) => {
  try {
    // 1. Get all cards for this board
    const cardsQuery = query(collection(db, 'cards'), where('boardId', '==', boardId));

    const querySnapshot = await getDocs(cardsQuery);
    const allCards: Card[] = [];
    querySnapshot.forEach(doc => {
      allCards.push({ id: doc.id, ...doc.data() } as Card);
    });

    // 2. Find the moved card
    const movedCard = allCards.find(card => card.id === cardId);
    if (!movedCard) {
      console.error(`Card with ID ${cardId} not found`);
      return;
    }

    // 3. Separate cards into source and destination columns
    const sourceColumnCards = allCards.filter(
      card => card.columnId === oldColumnId && card.id !== cardId
    );

    // If same column move, use the same array (minus the moved card)
    const destColumnCards =
      oldColumnId === newColumnId
        ? sourceColumnCards
        : allCards.filter(card => card.columnId === newColumnId && card.id !== cardId);

    // 4. Insert the moved card at the new index
    destColumnCards.splice(newIndex, 0, {
      ...movedCard,
      columnId: newColumnId, // Update column ID
    });

    // 5. Batch all updates
    const batch = writeBatch(db);

    // Update moved card's column if needed
    if (oldColumnId !== newColumnId) {
      const cardRef = doc(db, 'cards', cardId);
      batch.update(cardRef, { columnId: newColumnId });
    }

    // Update positions for source column if different from destination
    if (oldColumnId !== newColumnId) {
      sourceColumnCards.forEach((card, index) => {
        const cardRef = doc(db, 'cards', card.id);
        batch.update(cardRef, { position: index * 1000 });
      });
    }

    // Update positions for destination column
    destColumnCards.forEach((card, index) => {
      const cardRef = doc(db, 'cards', card.id);
      batch.update(cardRef, {
        position: index * 1000,
        // Only update columnId for the moved card
        ...(card.id === cardId ? { columnId: newColumnId } : {}),
      });
    });

    // 6. Commit all updates
    await batch.commit();
  } catch (error) {
    console.error('Error updating card positions:', error);
    // Log more detailed error for debugging
    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    }
  }
};

// Update card content
export const updateCard = async (cardId: string, updates: Partial<Card>) => {
  const cardRef = doc(db, 'cards', cardId);
  await updateDoc(cardRef, updates);
};

// Delete a card
export const deleteCard = async (cardId: string) => {
  const cardRef = doc(db, 'cards', cardId);
  await deleteDoc(cardRef);
};

// Simple voting without user tracking
export const voteForCard = async (cardId: string, voteType: 'up' | 'down') => {
  const cardRef = doc(db, 'cards', cardId);
  const voteChange = voteType === 'up' ? 1 : -1;

  await updateDoc(cardRef, {
    votes: increment(voteChange),
  });
};

// Start or Resume the timer for a board
export const startTimer = async (
  boardId: string,
  currentBoardData: Board | null // Pass current board data to check for paused state
) => {
  const boardRef = doc(db, 'boards', boardId);
  const durationToUse =
    currentBoardData?.timerPausedDurationSeconds ?? // Use paused time if available
    currentBoardData?.timerDurationSeconds ?? // Otherwise use original duration
    300; // Default to 300 if nothing is set

  // Track the original duration that the user set
  const originalDuration =
    currentBoardData?.timerOriginalDurationSeconds ?? // Use existing original if available
    (currentBoardData?.timerPausedDurationSeconds === null
      ? currentBoardData?.timerDurationSeconds
      : (currentBoardData?.timerOriginalDurationSeconds ??
        currentBoardData?.timerDurationSeconds)) ??
    durationToUse; // Otherwise use current duration

  await updateDoc(boardRef, {
    timerIsRunning: true,
    timerStartTime: serverTimestamp(),
    timerDurationSeconds: durationToUse, // Set the duration for this run
    timerPausedDurationSeconds: null, // Clear paused duration on start/resume
    timerOriginalDurationSeconds: originalDuration, // Store the original duration
  });
};

// Pause the timer for a board
export const pauseTimer = async (
  boardId: string,
  currentBoardData: Board | null // Pass current board data to calculate remaining time
) => {
  if (
    !currentBoardData ||
    !currentBoardData.timerIsRunning ||
    !currentBoardData.timerStartTime ||
    currentBoardData.timerDurationSeconds === undefined ||
    currentBoardData.timerDurationSeconds === null
  ) {
    console.warn('Timer cannot be paused, invalid state:', currentBoardData);
    return; // Cannot pause if not running or data missing
  }

  const boardRef = doc(db, 'boards', boardId);
  const startTimeMs = currentBoardData.timerStartTime.toMillis();
  const durationMs = currentBoardData.timerDurationSeconds * 1000;
  const nowMs = Date.now();
  const elapsedMs = nowMs - startTimeMs;
  const remainingMs = Math.max(0, durationMs - elapsedMs);
  // Use parseInt instead of Math.ceil to truncate decimal portion consistently
  const remainingSeconds = parseInt((remainingMs / 1000).toString(), 10);

  // Ensure we maintain the original duration
  const originalDuration =
    currentBoardData.timerOriginalDurationSeconds ?? currentBoardData.timerDurationSeconds;

  await updateDoc(boardRef, {
    timerIsRunning: false,
    timerPausedDurationSeconds: remainingSeconds, // Store remaining time
    timerStartTime: null, // Clear start time as it's paused
    timerDurationSeconds: currentBoardData.timerDurationSeconds, // Preserve original duration
    timerOriginalDurationSeconds: originalDuration, // Maintain original duration
  });
};

// Reset the timer for a board
export const resetTimer = async (boardId: string, initialDuration: number = 300) => {
  const boardRef = doc(db, 'boards', boardId);

  // Just use the provided initialDuration directly
  // The calling code (handleResetTimer) will ensure we get the original duration if available
  await updateDoc(boardRef, {
    timerIsRunning: false,
    timerStartTime: null,
    timerPausedDurationSeconds: initialDuration,
    timerDurationSeconds: initialDuration,
    timerOriginalDurationSeconds: initialDuration,
  });
};

// Update column sort state in Firestore
export const updateColumnSortState = async (
  boardId: string,
  columnId: string,
  sortByVotes: boolean
) => {
  const boardRef = doc(db, 'boards', boardId);
  await updateDoc(boardRef, {
    [`columns.${columnId}.sortByVotes`]: sortByVotes,
  });
};

// Subscribe to board participants with optimized loading
export const subscribeToBoardParticipants = (
  boardId: string,
  callback: (participants: User[]) => void
) => {
  try {
    // Set up an efficient query with metadata changes disabled for better performance
    const participantsQuery = query(collection(db, 'users'), where('boardId', '==', boardId));

    // Use a simple cache to avoid duplicate updates
    let lastParticipantsJSON = '';

    return onSnapshot(
      participantsQuery,
      { includeMetadataChanges: false }, // Only notify on committed changes
      querySnapshot => {
        const participants: User[] = [];
        const now = Date.now();
        const inactiveThreshold = 20 * 1000; // 20 seconds in milliseconds

        querySnapshot.forEach(doc => {
          const data = doc.data();
          const user = {
            id: doc.id,
            name: data.name || 'Anonymous',
            color: data.color || 'bg-blue-200',
            boardId: data.boardId || boardId,
            lastActive: data.lastActive || null,
            isViewingPage: data.isViewingPage !== false, // Default to true if not set
          } as User;

          // A user is considered active if EITHER:
          // 1. They explicitly marked as viewing the page
          // 2. They had activity in the last 20 seconds (for backwards compatibility)
          const lastActive = user.lastActive ? user.lastActive.toMillis() : 0;
          const recentlyActive = now - lastActive < inactiveThreshold;
          const isActive = user.isViewingPage || recentlyActive;

          // Only include active users
          if (isActive) {
            participants.push(user);
          }
        });

        // Sort participants by name for consistent ordering
        participants.sort((a, b) => a.name.localeCompare(b.name));

        // Only update if the participants data has actually changed
        const participantsJSON = JSON.stringify(
          participants.map(p => ({ id: p.id, name: p.name }))
        );
        if (participantsJSON !== lastParticipantsJSON) {
          lastParticipantsJSON = participantsJSON;
          callback(participants);
        }
      },
      error => {
        console.error(`Error getting participants for board ${boardId}:`, error);
        callback([]);
      }
    );
  } catch (error) {
    console.error(`Error setting up participants subscription for board ${boardId}:`, error);
    return () => {};
  }
};

// Update participant name
export const updateParticipantName = async (userId: string, newName: string) => {
  try {
    // Update the user document
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      name: newName,
      lastActive: serverTimestamp(),
    });

    // Update all cards authored by this user
    const cardsQuery = query(collection(db, 'cards'), where('authorId', '==', userId));

    const querySnapshot = await getDocs(cardsQuery);

    // Only create a batch if there are cards to update
    if (!querySnapshot.empty) {
      const batch = writeBatch(db);

      querySnapshot.forEach(cardDoc => {
        const cardRef = doc(db, 'cards', cardDoc.id);
        batch.update(cardRef, { authorName: newName });
      });

      await batch.commit();
    }

    return true;
  } catch (error) {
    console.error('Error updating participant name:', error);
    throw error; // Rethrow so the UI can show an error message
  }
};

// Join a board (create or update participant)
export const joinBoard = async (
  boardId: string,
  userId: string,
  userName: string = 'Anonymous User'
) => {
  try {
    // Check if user document exists
    const userRef = doc(db, 'users', userId);

    try {
      const userSnap = await getDoc(userRef);

      // Get the user's color - prioritize the stored Firestore color
      let userColor;
      if (userSnap.exists() && userSnap.data().color) {
        // Use existing color from Firestore
        userColor = userSnap.data().color;
      } else {
        // Generate a Tailwind color class if no color exists
        const getRandomPastelColor = () => {
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

          // Use userId to generate a consistent index
          const hash = Array.from(userId).reduce((acc, char) => acc + char.charCodeAt(0), 0);

          // Select a color based on the hash
          const colorIndex = hash % tailwindColors.length;
          return tailwindColors[colorIndex];
        };
        userColor = getRandomPastelColor();
      }

      if (userSnap.exists()) {
        // Get the existing name if available
        const existingName = userSnap.data().name;

        // Update existing user - preserve existing name if present (higher priority than anonymous)
        const nameToUse =
          existingName && existingName !== 'Anonymous User' ? existingName : userName;

        try {
          await updateDoc(userRef, {
            boardId,
            lastActive: serverTimestamp(),
            // Only update name if the incoming name is not anonymous or if no name exists
            name: nameToUse,
            // Only update the color if it's not already set to preserve user preference
            ...(userSnap.data().color ? {} : { color: userColor }),
          });

          // Return the name that's being used and the color
          return { success: true, name: nameToUse, color: userColor };
        } catch (updateError) {
          console.error(`Failed to update user ${userId}:`, updateError);
          throw updateError;
        }
      } else {
        // Create new user
        try {
          const userData = {
            id: userId,
            name: userName,
            color: userColor,
            boardId,
            lastActive: serverTimestamp(),
          };
          await setDoc(userRef, userData);

          // Return the name that's being used and the color
          return { success: true, name: userName, color: userColor };
        } catch (createError) {
          console.error(`Failed to create user ${userId}:`, createError);
          throw createError;
        }
      }
    } catch (docError) {
      console.error(`Error checking user document ${userId}:`, docError);
      throw docError;
    }
  } catch (error) {
    console.error('Error joining board:', error);
    // Return false to indicate failure
    return { success: false, name: userName };
  }
};

// Simple test function to verify Firestore write access
export const testFirestoreWrite = async (userId: string) => {
  try {
    // Create a test document in a 'test' collection
    const testRef = doc(db, 'test', userId);

    await setDoc(testRef, {
      timestamp: serverTimestamp(),
      test: true,
      message: 'Test write operation',
    });

    return true;
  } catch (error) {
    console.error('Firestore write test failed:', error);
    return false;
  }
};

// Additional board operations...

// Add a function to clean up users who have been inactive for too long
export const cleanupInactiveUsers = async (boardId: string) => {
  try {
    const now = Date.now();
    const inactiveThreshold = 30 * 1000; // 30 seconds (slightly longer than the display threshold)

    // Query for users in this board
    const usersQuery = query(collection(db, 'users'), where('boardId', '==', boardId));

    const snapshot = await getDocs(usersQuery);
    const batch = writeBatch(db);
    let hasInactiveUsers = false;

    snapshot.forEach(doc => {
      const data = doc.data();
      const lastActive = data.lastActive ? data.lastActive.toMillis() : 0;
      const recentlyActive = now - lastActive <= inactiveThreshold;

      // A user should be cleaned up if they:
      // 1. Explicitly marked as not viewing the page (tab closed/switched)
      // 2. OR haven't been active recently (no heartbeats recently)
      const inactive = data.isViewingPage === false || !recentlyActive;

      if (inactive) {
        hasInactiveUsers = true;
        // Remove the boardId from the user document instead of deleting
        // This preserves their identity but removes them from the board
        batch.update(doc.ref, {
          boardId: null,
          lastLeaveTime: serverTimestamp(),
          isViewingPage: false,
        });
      }
    });

    if (hasInactiveUsers) {
      await batch.commit();
    }

    return hasInactiveUsers;
  } catch (error) {
    console.error('Error cleaning up inactive users:', error);
    return false;
  }
};

// Delete a board and all its related data (cards)
export const deleteBoard = async (boardId: string, userId: string) => {
  try {
    // 1. Check if the user is the facilitator of the board
    const boardRef = doc(db, 'boards', boardId);
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) {
      throw new Error(`Board with ID ${boardId} not found`);
    }

    const boardData = boardSnap.data();
    if (boardData.facilitatorId !== userId) {
      throw new Error('Only the board creator can delete the board');
    }

    // 2. Since we've verified permissions, use a direct approach for deletion

    // First delete the board document itself - this is the most critical part
    await deleteDoc(boardRef);

    // Then find and delete cards
    const cardsQuery = query(collection(db, 'cards'), where('boardId', '==', boardId));

    const cardsSnapshot = await getDocs(cardsQuery);

    // Delete cards using a batch - but even if this fails, the board is already gone
    if (cardsSnapshot.size > 0) {
      const batch = writeBatch(db);
      cardsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // Update user records to remove associations with this board
    const usersQuery = query(collection(db, 'users'), where('boardId', '==', boardId));

    const usersSnapshot = await getDocs(usersQuery);

    if (usersSnapshot.size > 0) {
      const batch = writeBatch(db);
      usersSnapshot.docs.forEach(doc =>
        batch.update(doc.ref, {
          boardId: null,
          lastLeaveTime: serverTimestamp(),
        })
      );
      await batch.commit();
    }

    return true;
  } catch (error) {
    console.error('Error deleting board:', error);
    throw error;
  }
};

// Delete a column from a board
export const deleteColumn = async (boardId: string, columnId: string) => {
  try {
    // 1. Get the board document
    const boardRef = doc(db, 'boards', boardId);
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) {
      throw new Error(`Board with ID ${boardId} not found`);
    }

    // 2. Get the board data and update columns
    const boardData = boardSnap.data() as Board;
    const columns = boardData.columns || {};

    // Create a new columns object without the deleted column
    const updatedColumns = { ...columns };
    delete updatedColumns[columnId];

    // 3. Update the board document with the modified columns
    await updateDoc(boardRef, {
      columns: updatedColumns,
    });

    // 4. Delete all cards associated with this column
    const cardsQuery = query(
      collection(db, 'cards'),
      where('boardId', '==', boardId),
      where('columnId', '==', columnId)
    );

    const querySnapshot = await getDocs(cardsQuery);
    const batch = writeBatch(db);

    querySnapshot.forEach(document => {
      batch.delete(doc(db, 'cards', document.id));
    });

    // Commit the batch delete
    await batch.commit();

    return { success: true };
  } catch (error) {
    console.error('Error deleting column:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Add a new column to a board
export const addColumn = async (boardId: string, title: string) => {
  try {
    // 1. Get the board document
    const boardRef = doc(db, 'boards', boardId);
    const boardSnap = await getDoc(boardRef);

    if (!boardSnap.exists()) {
      throw new Error(`Board with ID ${boardId} not found`);
    }

    // 2. Get the board data and existing columns
    const boardData = boardSnap.data() as Board;
    const columns = boardData.columns || {};

    // 3. Generate a unique ID for the new column
    const columnId = `col-${Date.now()}`;

    // 4. Determine the highest order value
    const highestOrder = Object.values(columns).reduce((max, col) => Math.max(max, col.order), -1);

    // 5. Create the new column object
    const newColumn = {
      id: columnId,
      title,
      order: highestOrder + 1,
      sortByVotes: false,
    };

    // 6. Add the new column to the columns object
    const updatedColumns = {
      ...columns,
      [columnId]: newColumn,
    };

    // 7. Update the board document with the modified columns
    await updateDoc(boardRef, {
      columns: updatedColumns,
    });

    return {
      success: true,
      columnId,
    };
  } catch (error) {
    console.error('Error adding column:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Update the board's preference for showing the add column placeholder
export const updateShowAddColumnPlaceholder = async (boardId: string, showPlaceholder: boolean) => {
  try {
    const boardRef = doc(db, 'boards', boardId);
    await updateDoc(boardRef, {
      showAddColumnPlaceholder: showPlaceholder,
    });
    return { success: true };
  } catch (error) {
    console.error('Error updating add column placeholder visibility:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Update color for all cards created by a user
export const updateUserCardsColor = async (
  userId: string,
  newColor: string,
  specificBoardId?: string
) => {
  try {
    // Find all cards authored by this user
    let cardsQuery;

    if (specificBoardId) {
      // If a specific board ID is provided, only update cards in that board
      cardsQuery = query(
        collection(db, 'cards'),
        where('authorId', '==', userId),
        where('boardId', '==', specificBoardId)
      );
    } else {
      // Otherwise update all cards by this user (original behavior)
      cardsQuery = query(collection(db, 'cards'), where('authorId', '==', userId));
    }

    const querySnapshot = await getDocs(cardsQuery);

    if (querySnapshot.empty) {
      return { success: true, updated: 0 };
    }

    // Use a batch to update all cards efficiently
    const batch = writeBatch(db);

    querySnapshot.forEach(cardDoc => {
      const cardRef = doc(db, 'cards', cardDoc.id);
      // newColor is now a Tailwind class like 'bg-red-200'
      batch.update(cardRef, { color: newColor });
    });

    await batch.commit();

    return {
      success: true,
      updated: querySnapshot.size,
    };
  } catch (error) {
    console.error("Error updating user's card colors:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
