import { db, Board, Card } from "./firebase"; // Import Board and Card interfaces
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
  // getDoc is used in the component now
  orderBy,
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
  );
  return onSnapshot(cardsQuery, (querySnapshot) => {
    const cards: Card[] = []; // Use Card interface
    querySnapshot.forEach((doc) => {
      // Cast data to Card, assuming it matches the interface
      cards.push({ id: doc.id, ...doc.data() } as Card);
    });
    // Sort cards by position initially, though drag-and-drop will manage order later
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
  boardId: string // Need boardId to query relevant cards for reordering
) => {
  const cardRef = doc(db, "cards", cardId);
  const batch = writeBatch(db);

  // 1. Update the target card's column and potentially position (initially)
  batch.update(cardRef, { columnId: newColumnId });

  // 2. Get all cards in the source and destination columns to recalculate positions
  const cardsQuery = query(
    collection(db, "cards"),
    where("boardId", "==", boardId),
    where("columnId", "in", [oldColumnId, newColumnId]),
    orderBy("position")
  );

  const querySnapshot = await getDocs(cardsQuery);
  const allCards: Card[] = [];
  querySnapshot.forEach((doc) => {
    allCards.push({ id: doc.id, ...doc.data() } as Card);
  });

  // Separate cards by column
  const sourceColumnCards = allCards.filter(
    (c) => c.columnId === oldColumnId && c.id !== cardId
  );
  const destColumnCards = allCards.filter(
    (c) => c.columnId === newColumnId && c.id !== cardId
  );

  // Insert the moved card into the destination column at the correct index
  const movedCard = allCards.find((c) => c.id === cardId);
  if (movedCard) {
    movedCard.columnId = newColumnId; // Ensure columnId is updated locally
    destColumnCards.splice(newIndex, 0, movedCard);
  }

  // 3. Recalculate positions for both columns
  // Using a simple incrementing approach for now. Could use fractional indexing for robustness.
  let currentPos = 10; // Start position
  const posIncrement = 10; // Increment

  sourceColumnCards.forEach((card) => {
    batch.update(doc(db, "cards", card.id), { position: currentPos });
    currentPos += posIncrement;
  });

  currentPos = 10; // Reset for destination column
  destColumnCards.forEach((card) => {
    batch.update(doc(db, "cards", card.id), { position: currentPos });
    currentPos += posIncrement;
  });

  // 4. Commit the batch
  try {
    await batch.commit();
  } catch (error) {
    console.error("Error updating card positions:", error);
    // Handle error appropriately
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

// Vote for a card
export const voteForCard = async (cardId: string) => {
  const cardRef = doc(db, "cards", cardId);
  // Atomically increment the votes field
  await updateDoc(cardRef, {
    votes: increment(1),
  });
};

// Additional board operations...
