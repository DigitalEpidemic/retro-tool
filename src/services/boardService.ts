import { db, Board, Card, User, auth } from "./firebase"; // Import auth along with other exports
import {
  collection,
  doc,
  addDoc, // Keep for potential future use if needed
  setDoc, // Import setDoc for creating with specific ID
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  getDocs,
  getDoc, // Add getDoc back for resetTimer
  increment,
} from "firebase/firestore";
// nanoid and Timestamp are no longer used directly here

// Create a new board, optionally with a specific ID
export const createBoard = async (
  name: string,
  creatorId?: string,
  boardId?: string // Optional specific ID
) => {
  // Default columns
  const columns = {
    col1: { id: "col1", title: "What went well", order: 0 },
    col2: { id: "col2", title: "What can be improved", order: 1 },
    col3: { id: "col3", title: "Action items", order: 2 },
  };

  const boardData = {
    name,
    createdAt: serverTimestamp(),
    isActive: true,
    columns,
    facilitatorId: creatorId || null, // Store creator if provided
  };

  if (boardId) {
    // Create with a specific ID using setDoc
    const boardRef = doc(db, "boards", boardId);
    await setDoc(boardRef, boardData);
    return boardId; // Return the provided ID
  } else {
    // Original behavior: Create with an auto-generated ID using addDoc
    const boardRef = await addDoc(collection(db, "boards"), boardData);
    return boardRef.id; // Return the generated ID
  }
};

// Subscribe to board updates
export const subscribeToBoard = (
  boardId: string,
  callback: (board: Board | null) => void // Use Board interface
) => {
  const boardRef = doc(db, "boards", boardId);
  return onSnapshot(boardRef, (doc) => {
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
    collection(db, "cards"),
    where("boardId", "==", boardId)
    // Removed orderBy temporarily as it might be causing indexing issues
  );
  return onSnapshot(cardsQuery, (querySnapshot) => {
    const cards: Card[] = []; // Use Card interface
    querySnapshot.forEach((doc) => {
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
  authorName: string = "Anonymous"
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
  };
  await addDoc(collection(db, "cards"), cardData);
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
    const cardsQuery = query(
      collection(db, "cards"),
      where("boardId", "==", boardId)
    );

    const querySnapshot = await getDocs(cardsQuery);
    const allCards: Card[] = [];
    querySnapshot.forEach((doc) => {
      allCards.push({ id: doc.id, ...doc.data() } as Card);
    });

    // 2. Find the moved card
    const movedCard = allCards.find((card) => card.id === cardId);
    if (!movedCard) {
      console.error(`Card with ID ${cardId} not found`);
      return;
    }

    // 3. Separate cards into source and destination columns
    const sourceColumnCards = allCards.filter(
      (card) => card.columnId === oldColumnId && card.id !== cardId
    );

    // If same column move, use the same array (minus the moved card)
    const destColumnCards =
      oldColumnId === newColumnId
        ? sourceColumnCards
        : allCards.filter(
            (card) => card.columnId === newColumnId && card.id !== cardId
          );

    // 4. Insert the moved card at the new index
    destColumnCards.splice(newIndex, 0, {
      ...movedCard,
      columnId: newColumnId, // Update column ID
    });

    // 5. Batch all updates
    const batch = writeBatch(db);

    // Update moved card's column if needed
    if (oldColumnId !== newColumnId) {
      const cardRef = doc(db, "cards", cardId);
      batch.update(cardRef, { columnId: newColumnId });
    }

    // Update positions for source column if different from destination
    if (oldColumnId !== newColumnId) {
      sourceColumnCards.forEach((card, index) => {
        const cardRef = doc(db, "cards", card.id);
        batch.update(cardRef, { position: index * 1000 });
      });
    }

    // Update positions for destination column
    destColumnCards.forEach((card, index) => {
      const cardRef = doc(db, "cards", card.id);
      batch.update(cardRef, {
        position: index * 1000,
        // Only update columnId for the moved card
        ...(card.id === cardId ? { columnId: newColumnId } : {}),
      });
    });

    // 6. Commit all updates
    await batch.commit();
    console.log("Card positions updated successfully");
  } catch (error) {
    console.error("Error updating card positions:", error);
    // Log more detailed error for debugging
    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    }
  }
};

// Update card content
export const updateCard = async (cardId: string, updates: Partial<Card>) => {
  const cardRef = doc(db, "cards", cardId);
  await updateDoc(cardRef, updates);
};

// Delete a card
export const deleteCard = async (cardId: string) => {
  const cardRef = doc(db, "cards", cardId);
  await deleteDoc(cardRef);
};

// Simple voting without user tracking
export const voteForCard = async (cardId: string, voteType: "up" | "down") => {
  const cardRef = doc(db, "cards", cardId);
  const voteChange = voteType === "up" ? 1 : -1;

  await updateDoc(cardRef, {
    votes: increment(voteChange),
  });
};

// Start or Resume the timer for a board
export const startTimer = async (
  boardId: string,
  currentBoardData: Board | null // Pass current board data to check for paused state
) => {
  const boardRef = doc(db, "boards", boardId);
  const durationToUse =
    currentBoardData?.timerPausedDurationSeconds ?? // Use paused time if available
    currentBoardData?.timerDurationSeconds ?? // Otherwise use original duration
    300; // Default to 300 if nothing is set
  
  // Track the original duration that the user set
  const originalDuration = 
    currentBoardData?.timerOriginalDurationSeconds ?? // Use existing original if available
    (currentBoardData?.timerPausedDurationSeconds === null 
      ? currentBoardData?.timerDurationSeconds 
      : currentBoardData?.timerOriginalDurationSeconds ?? currentBoardData?.timerDurationSeconds) ?? 
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
    console.warn("Timer cannot be paused, invalid state:", currentBoardData);
    return; // Cannot pause if not running or data missing
  }

  const boardRef = doc(db, "boards", boardId);
  const startTimeMs = currentBoardData.timerStartTime.toMillis();
  const durationMs = currentBoardData.timerDurationSeconds * 1000;
  const nowMs = Date.now();
  const elapsedMs = nowMs - startTimeMs;
  const remainingMs = Math.max(0, durationMs - elapsedMs);
  // Use parseInt instead of Math.ceil to truncate decimal portion consistently
  const remainingSeconds = parseInt((remainingMs / 1000).toString(), 10);

  // Ensure we maintain the original duration
  const originalDuration = currentBoardData.timerOriginalDurationSeconds ?? currentBoardData.timerDurationSeconds;

  await updateDoc(boardRef, {
    timerIsRunning: false,
    timerPausedDurationSeconds: remainingSeconds, // Store remaining time
    timerStartTime: null, // Clear start time as it's paused
    timerDurationSeconds: currentBoardData.timerDurationSeconds, // Preserve original duration
    timerOriginalDurationSeconds: originalDuration, // Maintain original duration
  });
};

// Reset the timer for a board
export const resetTimer = async (
  boardId: string,
  initialDuration: number = 300
) => {
  const boardRef = doc(db, "boards", boardId);
  
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
  const boardRef = doc(db, "boards", boardId);
  await updateDoc(boardRef, {
    [`columns.${columnId}.sortByVotes`]: sortByVotes,
  });
};

// Subscribe to board participants
export const subscribeToBoardParticipants = (
  boardId: string,
  callback: (participants: User[]) => void
) => {
  try {
    // Set up the specific query for this board
    const participantsQuery = query(
      collection(db, "users"),
      where("boardId", "==", boardId)
    );
    
    return onSnapshot(
      participantsQuery, 
      (querySnapshot) => {
        const participants: User[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          
          // Ensure the document has the minimum required fields
          participants.push({
            id: doc.id, // Use the Firestore document ID
            name: data.name || 'Anonymous',
            color: data.color || '#6B7280',
            boardId: data.boardId || boardId,
            lastActive: data.lastActive || serverTimestamp()
          } as User);
        });
        
        callback(participants);
      },
      (error) => {
        console.error(`Error getting participants for board ${boardId}:`, error);
        // Return empty array on error
        callback([]);
      }
    );
  } catch (error) {
    console.error(`Error setting up participants subscription for board ${boardId}:`, error);
    // Return a dummy unsubscribe function
    return () => {};
  }
};

// Update participant name
export const updateParticipantName = async (
  userId: string, 
  newName: string
) => {
  try {
    // Update the user document
    const userRef = doc(db, "users", userId);
    await updateDoc(userRef, { 
      name: newName,
      lastActive: serverTimestamp() 
    });
    
    // Update all cards authored by this user
    const cardsQuery = query(
      collection(db, "cards"), 
      where("authorId", "==", userId)
    );
    
    const querySnapshot = await getDocs(cardsQuery);
    
    // Only create a batch if there are cards to update
    if (!querySnapshot.empty) {
      const batch = writeBatch(db);
      
      querySnapshot.forEach((cardDoc) => {
        const cardRef = doc(db, "cards", cardDoc.id);
        batch.update(cardRef, { authorName: newName });
      });
      
      await batch.commit();
    }
    
    return true;
  } catch (error) {
    console.error("Error updating participant name:", error);
    throw error; // Rethrow so the UI can show an error message
  }
};

// Join a board (create or update participant)
export const joinBoard = async (
  boardId: string,
  userId: string,
  userName: string = "Anonymous User"
) => {
  try {
    // Random pastel color for the user
    const getRandomPastelColor = () => {
      // Use userId to generate a consistent color for the same user
      const hash = Array.from(userId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const hue = hash % 360;
      return `hsl(${hue}, 70%, 80%)`; // Pastel color
    };
    
    // Check if user document exists
    const userRef = doc(db, "users", userId);
    
    try {
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        // Update existing user
        try {
          await updateDoc(userRef, {
            boardId,
            lastActive: serverTimestamp(),
            // Ensure name is also updated if provided
            ...(userName ? { name: userName } : {})
          });
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
            color: getRandomPastelColor(),
            boardId,
            lastActive: serverTimestamp()
          };
          await setDoc(userRef, userData);
        } catch (createError) {
          console.error(`Failed to create user ${userId}:`, createError);
          throw createError;
        }
      }
      
      return true;
    } catch (docError) {
      console.error(`Error checking user document ${userId}:`, docError);
      throw docError;
    }
  } catch (error) {
    console.error("Error joining board:", error);
    // Return false to indicate failure
    return false;
  }
};

// Simple test function to verify Firestore write access
export const testFirestoreWrite = async (userId: string) => {
  try {
    // Create a test document in a 'test' collection
    const testRef = doc(db, "test", userId);
    
    await setDoc(testRef, {
      timestamp: serverTimestamp(),
      test: true,
      message: "Test write operation"
    });
    
    return true;
  } catch (error) {
    console.error("Firestore write test failed:", error);
    return false;
  }
};

// Additional board operations...
