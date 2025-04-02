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
import {
  Users,
  TrendingUp,
  Share2,
  Settings,
  Play,
  RotateCcw,
  Download,
} from "lucide-react";

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

    console.log("Drag end event:", {
      source,
      destination,
      draggableId,
      boardId,
    });

    const sourceColumnId = source.droppableId;
    const destinationColumnId = destination.droppableId;
    // const sourceIndex = source.index; // Removed unused variable
    const destinationIndex = destination.index;

    // Find the card being moved
    const draggedCardIndex = cards.findIndex((card) => card.id === draggableId);
    if (draggedCardIndex === -1) {
      console.error("Card not found:", draggableId);
      return;
    }

    // Create a clone of cards array for update
    const updatedCards = [...cards];
    const draggedCard = { ...updatedCards[draggedCardIndex] };

    // Remove card from original position
    updatedCards.splice(draggedCardIndex, 1);

    // Update the column ID if needed
    draggedCard.columnId = destinationColumnId;

    // Find where to insert the card (simplify this logic)
    // For now we'll just extract cards in the destination column to find the right spot
    const destColumnCards = updatedCards.filter(
      (card) => card.columnId === destinationColumnId
    );

    // Calculate the insert index within the overall array
    let insertIndex;

    if (destColumnCards.length === 0) {
      // If the destination column is empty, place at the end of the array
      insertIndex = updatedCards.length;
    } else if (destinationIndex >= destColumnCards.length) {
      // If dropped after all existing cards, place at the end
      insertIndex = updatedCards.length;
    } else {
      // Find the card at the target destination index
      const refCard = destColumnCards[destinationIndex];
      // Find its position in the overall array
      insertIndex = updatedCards.findIndex((card) => card.id === refCard.id);
    }

    // Insert the card at the new position
    updatedCards.splice(insertIndex, 0, draggedCard);

    // Update state optimistically
    setCards(updatedCards);
    console.log("Updated cards state:", updatedCards);

    // Update Firestore
    try {
      updateCardPosition(
        draggableId,
        destinationColumnId,
        destinationIndex,
        sourceColumnId,
        boardId!
      );
    } catch (error) {
      console.error("Error updating card position:", error);
      // Revert state if needed
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-blue-500 font-medium">Loading...</div>
      </div>
    );
  }

  // Handle auth error state
  if (authError) {
    return (
      <div className="p-4 text-center text-red-500">
        Authentication Error: {authError.message}
      </div>
    );
  }

  // Handle combined loading state (auth + board fetch)
  if (loading || authLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-blue-500 font-medium">Loading...</div>
      </div>
    );
  }

  // Handle local error state (e.g., board not found)
  if (error) {
    return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  }

  // Add null check for board before rendering (should be redundant now with error handling, but safe)
  if (!board) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="text-gray-500">Board data not available.</div>
      </div>
    );
  }

  // Define ColumnType based on BoardType
  type ColumnType = BoardType["columns"][string];

  return (
    <div className="h-full flex flex-col">
      {/* Top Board Header */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h1 className="text-lg font-semibold text-gray-800">
            {boardId || "test-board"}
          </h1>
          {/* <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            Free retrospective
          </span> */}
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <span className="text-gray-700 font-medium">5:00</span>
            <button className="text-blue-500 hover:text-blue-600">
              <Play className="h-4 w-4" />
            </button>
            <button className="text-gray-400 hover:text-gray-600">
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="flex space-x-5">
            <button className="text-gray-700 hover:text-gray-900 flex items-center">
              <Users className="h-5 w-5" />
              <span className="ml-1 text-sm">Participants</span>
            </button>

            <button className="text-gray-700 hover:text-gray-900 flex items-center">
              <TrendingUp className="h-5 w-5" />
              <span className="ml-1 text-sm">Action points</span>
            </button>

            <button className="text-gray-700 hover:text-gray-900 flex items-center">
              <Download className="h-5 w-5" />
              <span className="ml-1 text-sm">Export</span>
            </button>

            <button className="text-gray-700 hover:text-gray-900 flex items-center">
              <Share2 className="h-5 w-5" />
              <span className="ml-1 text-sm">Share</span>
            </button>

            <button className="text-gray-700 hover:text-gray-900 flex items-center">
              <Settings className="h-5 w-5" />
              <span className="ml-1 text-sm">Options</span>
            </button>
          </div>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-3 gap-6 px-6 py-8 flex-grow">
          {Object.values(board.columns)
            .sort((a: ColumnType, b: ColumnType) => a.order - b.order)
            .map((column: ColumnType, index) => (
              <div
                key={column.id}
                className="border-r border-l border-gray-200 bg-white rounded shadow-sm"
              >
                <Column id={column.id} title={column.title} boardId={boardId!}>
                  <Droppable droppableId={column.id}>
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="h-full"
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
              </div>
            ))}
        </div>
      </DragDropContext>
    </div>
  );
}
