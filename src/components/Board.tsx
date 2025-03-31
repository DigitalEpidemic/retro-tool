import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
// Use @hello-pangea/dnd instead of react-beautiful-dnd
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import {
  subscribeToBoard,
  subscribeToCards,
  updateCardPosition,
  createBoard, // Import createBoard
} from "../services/boardService"; // Corrected import path
import { doc, getDoc } from "firebase/firestore"; // Import getDoc and doc
import { db } from "../services/firebase"; // Import db instance
import Column from "./Column";
import CardComponent from "./Card";
import { useFirebase } from "../contexts/FirebaseContext";
import { Board as BoardType, Card as CardType } from "../services/firebase"; // Import types

export default function Board() {
  const { boardId } = useParams<{ boardId: string }>();
  const { user, loading: authLoading, error: authError } = useFirebase(); // Get auth loading state
  const navigate = useNavigate();
  const [board, setBoard] = useState<BoardType | null>(null); // Use BoardType
  const [cards, setCards] = useState<CardType[]>([]); // Use CardType array
  const [loading, setLoading] = useState(true); // Local loading state for board data
  const [error, setError] = useState<string | null>(null); // Local error state

  useEffect(() => {
    // Don't proceed if auth is still loading or if there's no boardId
    if (authLoading || !boardId) {
      return;
    }

    // If auth is done but there's no user (e.g., sign-in failed), handle error or redirect
    if (!user) {
      setError("Authentication failed. Please try again.");
      setLoading(false);
      // Optionally redirect: navigate('/login');
      return;
    }

    // Auth is complete, user exists, proceed with subscriptions
    setLoading(true); // Set loading true while fetching board data
    setError(null); // Clear previous errors

    let unsubscribeBoard = () => {};
    let unsubscribeCards = () => {};

    const checkAndSubscribe = async () => {
      try {
        const boardRef = doc(db, "boards", boardId);
        const boardSnap = await getDoc(boardRef);

        if (!boardSnap.exists()) {
          // Board doesn't exist, try to create it
          console.log(`Board ${boardId} not found, attempting to create...`);
          try {
            // Use boardId as name for simplicity, or prompt user?
            await createBoard(`Board: ${boardId}`, user.uid, boardId);
            console.log(`Board ${boardId} created successfully.`);
            // No need to manually set board state here, subscription will pick it up
          } catch (createError) {
            console.error("Error creating board:", createError);
            setError(
              `Failed to create board "${boardId}". Check permissions or console.`
            );
            setLoading(false);
            return; // Stop if creation failed
          }
        }

        // Now that we know the board exists (or was just created), subscribe
        setLoading(true); // Ensure loading is true before subscription potentially sets it false
        setError(null);

        // Subscribe to board changes
        unsubscribeBoard = subscribeToBoard(boardId, (boardData) => {
          if (!boardData) {
            // This case might happen briefly or if deleted after creation attempt
            setError(`Board with ID "${boardId}" not found or access denied.`);
            setBoard(null);
          } else {
            setBoard(boardData);
            setError(null); // Clear error on successful load/update
          }
          setLoading(false); // Set loading false once we get *any* snapshot (or null)
        });

        // Subscribe to cards changes (can run concurrently)
        unsubscribeCards = subscribeToCards(boardId, (cardsData) => {
          setCards(cardsData);
          // Note: Card loading doesn't affect the main 'loading' state here
        });
      } catch (err) {
        console.error("Error checking/subscribing to board:", err);
        setError("Failed to load board data. Check console for details.");
        setLoading(false);
      }
    }; // End of checkAndSubscribe async function

    checkAndSubscribe(); // Call the async function

    // Cleanup function: This runs when the component unmounts or dependencies change
    return () => {
      console.log("Cleaning up subscriptions for board:", boardId);
      unsubscribeBoard(); // Call the stored unsubscribe function for the board
      unsubscribeCards(); // Call the stored unsubscribe function for cards
    };
    // Dependencies for the useEffect hook
  }, [boardId, navigate, user, authLoading]);

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Dropped outside a valid area
    if (!destination) return;

    // Dropped in the same position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // --- Optimistic Update ---
    // const startColumnId = source.droppableId; // Unused
    const finishColumnId = destination.droppableId;
    // const startIndex = source.index; // Unused
    const finishIndex = destination.index;

    // Find the dragged card
    const draggedCard = cards.find((card) => card.id === draggableId);
    if (!draggedCard) return; // Should not happen if draggableId is valid

    // Create a mutable copy of the cards array for manipulation
    const currentCards = Array.from(cards);

    // Find the actual card object being moved
    const cardToMoveIndex = currentCards.findIndex((c) => c.id === draggableId);
    if (cardToMoveIndex === -1) return; // Should not happen

    const cardToMove = {
      ...currentCards[cardToMoveIndex],
      columnId: finishColumnId,
    }; // Update columnId optimistically

    // Remove the card from its original position
    currentCards.splice(cardToMoveIndex, 1);

    // Find the correct index in the overall list based on the destination column and index
    // Get cards currently in the destination column, sorted by position
    const destColumnCards = currentCards
      .filter((c) => c.columnId === finishColumnId)
      .sort((a, b) => a.position - b.position);

    let targetIndex = -1;
    if (destColumnCards.length === 0) {
      // If destination column is empty, it's the first card
      // Find the first card of the next column (if any) or just add to end
      targetIndex = currentCards.length; // Add to the end if no cards in dest column
    } else if (finishIndex >= destColumnCards.length) {
      // If dropped at the end of the destination column
      const lastCardInDest = destColumnCards[destColumnCards.length - 1];
      targetIndex =
        currentCards.findIndex((c) => c.id === lastCardInDest.id) + 1;
    } else {
      // If dropped within the destination column
      const cardAtIndex = destColumnCards[finishIndex];
      targetIndex = currentCards.findIndex((c) => c.id === cardAtIndex.id);
    }

    // Insert the card at the calculated target index
    if (targetIndex === -1) {
      // Fallback: add to the end if index calculation failed (shouldn't happen ideally)
      currentCards.push(cardToMove);
    } else {
      currentCards.splice(targetIndex, 0, cardToMove);
    }

    // Update the local state immediately
    // Note: We don't recalculate 'position' numbers here, just the order and columnId.
    // The backend `updateCardPosition` handles the actual 'position' field update.
    setCards(currentCards);
    // --- End Optimistic Update ---

    // Update card position in Firestore (this will handle the actual position recalculation)
    updateCardPosition(
      draggableId,
      destination.droppableId,
      destination.index, // Pass the visual index for backend calculation
      source.droppableId,
      boardId!
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">Loading...</div>
    );
  }

  // Handle auth error state
  if (authError) {
    return (
      <div className="p-4 text-center text-red-600">
        Authentication Error: {authError.message}
      </div>
    );
  }

  // Handle combined loading state (auth + board fetch)
  if (loading || authLoading) {
    return (
      <div className="flex justify-center items-center h-64">Loading...</div>
    );
  }

  // Handle local error state (e.g., board not found)
  if (error) {
    return <div className="p-4 text-center text-red-600">Error: {error}</div>;
  }

  // Add null check for board before rendering (should be redundant now with error handling, but safe)
  if (!board) {
    return (
      <div className="flex justify-center items-center h-64">
        Board data not available.
      </div>
    );
  }

  // Define ColumnType based on BoardType
  type ColumnType = BoardType["columns"][string];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        {/* board is guaranteed to be non-null here */}
        <h1 className="text-2xl font-bold text-gray-900">{board.name}</h1>
        <div className="flex space-x-4">{/* Board actions will go here */}</div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* board is guaranteed to be non-null here */}
          {Object.values(board.columns)
            // Use ColumnType for sorting
            .sort((a: ColumnType, b: ColumnType) => a.order - b.order)
            // Use ColumnType for mapping
            .map((column: ColumnType) => (
              <Column
                key={column.id}
                id={column.id}
                title={column.title}
                boardId={boardId!}
              >
                <Droppable droppableId={column.id}>
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-3 min-h-[200px]"
                    >
                      {cards
                        .filter((card) => card.columnId === column.id)
                        .sort((a, b) => a.position - b.position)
                        .map((card, index) => (
                          <Draggable
                            key={card.id}
                            draggableId={card.id}
                            index={index}
                          >
                            {(provided) => (
                              <CardComponent
                                provided={provided}
                                card={card}
                                isOwner={card.authorId === user?.uid}
                              />
                            )}
                          </Draggable>
                        ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </Column>
            ))}
        </div>
      </DragDropContext>
    </div>
  );
}
