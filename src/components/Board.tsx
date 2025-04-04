import {
  useState,
  useEffect,
  useRef,
  ChangeEvent,
  KeyboardEvent,
  FocusEvent,
} from "react"; // Add more imports
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
  createBoard,
  startTimer,
  pauseTimer,
  resetTimer,
  updateColumnSortState,
} from "../services/boardService";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../services/firebase";
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
  Pause, // Import Pause icon
  RotateCcw,
  Download,
} from "lucide-react";

export default function Board() {
  const { boardId } = useParams<{ boardId: string }>();
  const { user, loading: authLoading, error: authError } = useFirebase(); // Get auth loading state
  const navigate = useNavigate();
  const [board, setBoard] = useState<BoardType | null>(null); // Use BoardType
  const [cards, setCards] = useState<CardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remainingTime, setRemainingTime] = useState<number | null>(null); // State for countdown display
  const [editableTimeStr, setEditableTimeStr] = useState<string>(""); // State for editable input
  const [columnSortStates, setColumnSortStates] = useState<
    Record<string, boolean>
  >({}); // Track sort by votes per column
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref to store interval ID
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for delayed reset timeout
  const initialDurationSeconds = 300; // 5 minutes (default)
  const inputRef = useRef<HTMLInputElement>(null); // Ref for the input element
  const escapePressedRef = useRef(false); // Ref to track if blur was triggered by Escape

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

            // Initialize column sort states from Firestore
            if (boardData.columns) {
              const newSortStates: Record<string, boolean> = {};
              Object.entries(boardData.columns).forEach(([id, column]) => {
                newSortStates[id] = column.sortByVotes ?? false;
              });
              setColumnSortStates(newSortStates);
            }
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

  // Effect for Timer Logic
  useEffect(() => {
    // Clear any existing interval AND reset timeout when board data changes or component unmounts
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }

    if (
      board?.timerIsRunning &&
      board.timerStartTime &&
      board.timerDurationSeconds
    ) {
      const startTimeMs = board.timerStartTime.toMillis();
      const durationMs = board.timerDurationSeconds * 1000;
      const endTimeMs = startTimeMs + durationMs;

      const updateTimer = () => {
        const nowMs = Date.now();
        const remainingMs = Math.max(0, endTimeMs - nowMs);
        const remainingSeconds = Math.floor(remainingMs / 1000); // Use floor for more intuitive countdown start

        // Check if the timer has expired
        if (nowMs >= endTimeMs) {
          setRemainingTime(0); // Ensure display shows 0:00

          // Clear the interval immediately
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }

          // Schedule the reset action slightly delayed to allow 0:00 to display fully
          // Clear any potentially existing (though unlikely) timeout first
          if (resetTimeoutRef.current) {
            clearTimeout(resetTimeoutRef.current);
          }
          resetTimeoutRef.current = setTimeout(() => {
            if (boardId && board) {
              // Check if boardId and board exist
              // Reset to the duration that was just used for the countdown
              resetTimer(
                boardId,
                board.timerDurationSeconds ?? initialDurationSeconds
              ).catch((err: unknown) => {
                console.error("Error auto-resetting timer:", err);
                // Optionally set an error state here
              });
            }
            resetTimeoutRef.current = null; // Clear the ref after execution
          }, 990); // Delay slightly less than 1 second

          return; // Stop further processing for this interval tick
        }

        // If timer hasn't expired, update display using variables declared earlier
        setRemainingTime(remainingSeconds);
      };

      updateTimer(); // Initial update
      timerIntervalRef.current = setInterval(updateTimer, 1000); // Update every second
    } else if (
      board?.timerPausedDurationSeconds !== undefined &&
      board?.timerPausedDurationSeconds !== null
    ) {
      // Timer is paused, display the paused duration
      const pausedSeconds = board.timerPausedDurationSeconds;
      setRemainingTime(pausedSeconds);
      setEditableTimeStr(formatTime(pausedSeconds)); // Initialize editable string
    } else {
      // Timer is not running and not paused (reset state), show initial duration
      const initialSeconds =
        board?.timerDurationSeconds ?? initialDurationSeconds;
      setRemainingTime(initialSeconds);
      setEditableTimeStr(formatTime(initialSeconds)); // Initialize editable string
    }

    // Cleanup interval AND timeout on unmount or when dependencies change
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, [
    board,
    board?.timerIsRunning,
    board?.timerStartTime,
    board?.timerDurationSeconds,
    board?.timerPausedDurationSeconds,
    boardId,
  ]); // Re-run when timer state changes in Firestore

  // Helper function to format time
  const formatTime = (totalSeconds: number | null): string => {
    if (totalSeconds === null || totalSeconds < 0) {
      return "0:00"; // Or some default/loading state
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  // Helper function to parse "MM:SS" string to total seconds
  const parseTime = (timeStr: string): number | null => {
    const parts = timeStr.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!parts) return null;
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    if (
      isNaN(minutes) ||
      isNaN(seconds) ||
      seconds < 0 ||
      seconds > 59 ||
      minutes < 0
    ) {
      return null; // Invalid format or values
    }
    return minutes * 60 + seconds;
  };

  // Handlers for timer buttons
  const handleStartPauseTimer = () => {
    if (!boardId) return;

    if (board?.timerIsRunning) {
      // --- Pause Timer ---
      // Clear any pending delayed reset if pausing manually
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }
      pauseTimer(boardId, board).catch((err: unknown) => {
        // Type err
        console.error("Error pausing timer:", err);
        setError("Failed to pause timer.");
      });
    } else {
      // --- Start or Resume Timer ---
      // Pass the current board state to startTimer
      startTimer(boardId, board).catch((err: unknown) => {
        // Type err
        console.error("Error starting/resuming timer:", err);
        setError("Failed to start/resume timer.");
      });
    }
  };

  // Handler for saving edited time
  const handleSaveEditedTime = async () => {
    if (!boardId || board?.timerIsRunning) return; // Only save if stopped/paused

    const newDurationSeconds = parseTime(editableTimeStr);

    if (newDurationSeconds === null || newDurationSeconds < 0) {
      // Invalid input, revert to the last known valid time
      console.warn("Invalid time format entered:", editableTimeStr);
      const lastValidTime =
        board?.timerPausedDurationSeconds ??
        board?.timerDurationSeconds ??
        initialDurationSeconds;
      setEditableTimeStr(formatTime(lastValidTime));
      return;
    }

    // Update Firestore directly
    const boardRef = doc(db, "boards", boardId);
    try {
      await updateDoc(boardRef, {
        timerDurationSeconds: newDurationSeconds,
        ...(newDurationSeconds > 0
          ? {
              timerPausedDurationSeconds: newDurationSeconds,
            }
          : {
              timerPausedDurationSeconds: 0,
            }),
        timerIsRunning: false,
        timerStartTime: null,
      });
      console.log(
        "Timer duration updated successfully to:",
        newDurationSeconds
      );
      // Firestore listener will update the local state (remainingTime, editableTimeStr)
    } catch (err: unknown) {
      console.error("Error updating timer duration:", err);
      setError("Failed to update timer duration.");
      // Revert input on error
      const lastValidTime =
        board?.timerPausedDurationSeconds ??
        board?.timerDurationSeconds ??
        initialDurationSeconds;
      setEditableTimeStr(formatTime(lastValidTime)); // Revert input on error
    }
  };

  // Handle input change
  const handleTimeInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEditableTimeStr(e.target.value);
  };

  // Handle saving on Enter key press
  const handleTimeInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSaveEditedTime();
      // inputRef.current?.blur(); // Remove this line - caused double save attempt
    } else if (e.key === "Escape") {
      // Revert to last known valid time on Escape
      const lastValidTime =
        board?.timerPausedDurationSeconds ??
        board?.timerDurationSeconds ??
        initialDurationSeconds;
      escapePressedRef.current = true; // Signal that Escape was pressed
      setEditableTimeStr(formatTime(lastValidTime));
      inputRef.current?.blur(); // Remove focus
    }
  };

  // Handle saving on blur (losing focus)
  const handleTimeInputBlur = (e: FocusEvent<HTMLInputElement>) => {
    // If blur was triggered by Escape key, reset the flag and do nothing else
    if (escapePressedRef.current) {
      escapePressedRef.current = false;
      return;
    }

    // Prevent saving if the blur was caused by clicking a timer control button
    if (
      e.relatedTarget instanceof HTMLButtonElement &&
      e.relatedTarget.closest(".timer-controls") // Add a class to the controls container
    ) {
      return;
    }
    // Only save on blur if the value has actually changed from the last valid state
    const lastValidTime =
      board?.timerPausedDurationSeconds ??
      board?.timerDurationSeconds ??
      initialDurationSeconds;
    if (editableTimeStr !== formatTime(lastValidTime)) {
      handleSaveEditedTime();
    }
  };

  const handleResetTimer = () => {
    if (boardId) {
      // Clear any pending delayed reset if resetting manually
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }
      // Pass the initial duration to resetTimer
      resetTimer(boardId, initialDurationSeconds).catch((err: unknown) => {
        // Type err
        console.error("Error resetting timer:", err);
        setError("Failed to reset timer.");
      });
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    // Make async
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
      await updateCardPosition(
        // Await the promise
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
    <div className="h-screen flex flex-col overflow-hidden">
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
          {/* Timer Display and Controls */}
          {/* Add timer-controls class for blur logic */}
          <div className="flex items-center space-x-1 timer-controls">
            {/* Conditional Rendering: Input vs Span */}
            {board && !board.timerIsRunning ? (
              <input
                ref={inputRef}
                type="text"
                value={editableTimeStr}
                onChange={handleTimeInputChange}
                onKeyDown={handleTimeInputKeyDown}
                onBlur={handleTimeInputBlur}
                className="text-gray-700 font-medium w-12 text-right border border-gray-300 rounded px-1 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                // Add pattern for basic validation if desired, though JS handles parsing
                // pattern="\d{1,2}:\d{2}"
                title="Edit time (MM:SS)"
              />
            ) : (
              <span
                className="text-gray-700 font-medium w-12 text-right"
                title="Remaining time"
              >
                {formatTime(remainingTime)}
              </span>
            )}
            {/* Play/Pause Button */}
            <button
              onClick={handleStartPauseTimer}
              className={`cursor-pointer ${
                board?.timerIsRunning
                  ? "text-orange-500 hover:text-orange-600" // Style for Pause
                  : "text-blue-500 hover:text-blue-600" // Style for Play/Resume
              }`}
              aria-label={board?.timerIsRunning ? "Pause timer" : "Start timer"} // Add aria-label
            >
              {board?.timerIsRunning ? (
                <Pause className="h-4 w-4" /> // Show Pause icon when running
              ) : (
                <Play className="h-4 w-4" /> // Show Play icon when stopped/paused
              )}
            </button>
            {/* Reset Button */}
            <button
              onClick={handleResetTimer}
              aria-label="Reset timer" // Add aria-label
              // Disable reset if timer is running? Optional UX choice.
              // disabled={!!board?.timerIsRunning}
              className="text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          {/* Other Board Controls */}
          <div className="flex space-x-5">
            <button className="text-gray-700 hover:text-gray-900 flex items-center cursor-pointer">
              <Users className="h-5 w-5" />
              <span className="ml-1 text-sm">Participants</span>
            </button>

            <button className="text-gray-700 hover:text-gray-900 flex items-center cursor-pointer">
              <TrendingUp className="h-5 w-5" />
              <span className="ml-1 text-sm">Action points</span>
            </button>

            <button className="text-gray-700 hover:text-gray-900 flex items-center cursor-pointer">
              <Download className="h-5 w-5" />
              <span className="ml-1 text-sm">Export</span>
            </button>

            <button className="text-gray-700 hover:text-gray-900 flex items-center cursor-pointer">
              <Share2 className="h-5 w-5" />
              <span className="ml-1 text-sm">Share</span>
            </button>

            <button className="text-gray-700 hover:text-gray-900 flex items-center cursor-pointer">
              <Settings className="h-5 w-5" />
              <span className="ml-1 text-sm">Options</span>
            </button>
          </div>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-3 gap-6 px-6 py-4 flex-1 overflow-hidden">
          {Object.values(board.columns)
            .sort((a: ColumnType, b: ColumnType) => a.order - b.order)
            .map((column: ColumnType) => (
              <div
                key={column.id}
                className="border-r border-l border-gray-200 bg-white rounded shadow-sm h-full flex flex-col overflow-hidden"
              >
                <Column
                  id={column.id}
                  title={column.title}
                  boardId={boardId!}
                  sortByVotes={columnSortStates[column.id] || false}
                  onSortToggle={async () => {
                    const newSortState = !columnSortStates[column.id];
                    try {
                      await updateColumnSortState(
                        boardId!,
                        column.id,
                        newSortState
                      );
                      setColumnSortStates((prev) => ({
                        ...prev,
                        [column.id]: newSortState,
                      }));
                    } catch (error) {
                      console.error("Error updating sort state:", error);
                    }
                  }}
                >
                  <Droppable droppableId={column.id}>
                    {(provided) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="h-full overflow-y-scroll scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400"
                      >
                        {cards
                          .filter((card) => card.columnId === column.id)
                          .sort((a, b) =>
                            columnSortStates[column.id]
                              ? b.votes - a.votes
                              : a.position - b.position
                          )
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
