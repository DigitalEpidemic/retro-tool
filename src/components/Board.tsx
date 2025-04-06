import {
  useState,
  useEffect,
  useRef,
  ChangeEvent,
  KeyboardEvent,
  FocusEvent,
  memo,
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
  subscribeToBoardParticipants,
  updateParticipantName,
  joinBoard,
  testFirestoreWrite,
} from "../services/boardService";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../services/firebase";
import Column from "./Column";
import CardComponent from "./Card";
import { useFirebase } from "../contexts/FirebaseContext";
import { Board as BoardType, Card as CardType, User } from "../services/firebase"; // Import User type
import {
  Users,
  TrendingUp,
  Share2,
  Settings,
  Play,
  Pause, // Import Pause icon
  RotateCcw,
  Download,
  X, // Import X icon for closing panel
  Edit2, // Import Edit2 icon for editing name
  Check, // Import Check icon for confirming edits
} from "lucide-react";

// Create a memoized version of the ParticipantsPanel
const MemoizedParticipantsPanel = memo(({ 
  isOpen, 
  onClose, 
  participants,
  currentUserId,
  onUpdateName
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  participants: User[];
  currentUserId: string;
  onUpdateName: (userId: string, newName: string) => void;
}) => {
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingUser && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingUser]);

  const handleStartEdit = (userId: string, currentName: string) => {
    setEditingUser(userId);
    setNewName(currentName);
  };

  const handleSaveName = () => {
    if (editingUser && newName.trim()) {
      onUpdateName(editingUser, newName.trim());
      setEditingUser(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setEditingUser(null);
    }
  };

  if (!isOpen) return null;

  // Filter out any invalid participants (shouldn't happen, but just in case)
  const validParticipants = participants.filter(p => p && p.id && p.name);

  return (
    <div className="fixed right-0 top-0 h-screen w-80 bg-white shadow-lg border-l border-gray-200 z-20 overflow-y-auto">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">Participants</h2>
        <button 
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Close panel"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      <div className="p-4">
        <ul className="space-y-3">
          {validParticipants.length === 0 ? (
            <li className="text-gray-500 italic">No participants yet</li>
          ) : (
            validParticipants.map(participant => (
              <li 
                key={participant.id} 
                className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50"
              >
                <div className="flex items-center">
                  <div 
                    className="h-8 w-8 rounded-full mr-3 flex items-center justify-center text-white"
                    style={{ backgroundColor: participant.color || '#6B7280' }}
                  >
                    {participant.name.charAt(0).toUpperCase()}
                  </div>
                  
                  {editingUser === participant.id ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      onBlur={handleSaveName}
                      autoComplete="off"
                    />
                  ) : (
                    <span className="font-medium text-gray-700">
                      {participant.name}
                      {participant.id === currentUserId && " (You)"}
                    </span>
                  )}
                </div>
                
                {participant.id === currentUserId && editingUser !== participant.id && (
                  <button 
                    onClick={() => handleStartEdit(participant.id, participant.name)}
                    className="text-gray-400 hover:text-blue-500"
                    aria-label="Edit your name"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                )}
                
                {editingUser === participant.id && (
                  <button 
                    onClick={handleSaveName}
                    className="text-green-500 hover:text-green-600"
                    aria-label="Save name"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
});

export default function Board() {
  const { boardId } = useParams<{ boardId: string }>();
  const { user, loading: authLoading, error: authError, updateUserDisplayName } = useFirebase(); // Get auth loading state and updateUserDisplayName
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
  const [isPanelOpen, setIsPanelOpen] = useState(false); // State for participants panel
  const [participants, setParticipants] = useState<User[]>([]); // State for participants list
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
      return;
    }
    
    // Auth is complete, user exists, proceed with subscriptions
    setLoading(true); // Set loading true while fetching board data
    setError(null); // Clear previous errors

    let unsubscribeBoard = () => {};
    let unsubscribeCards = () => {};
    let unsubscribeParticipants = () => {};

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

        // Always join the board when loading the component
        try {
          const success = await joinBoard(boardId, user.uid, user.displayName || "Anonymous User");
          
          if (!success) {
            console.error("Failed to join board as participant");
          }
        } catch (joinError) {
          console.error("Error in Board component when joining board:", joinError);
        }
        
        // Subscribe to participants regardless of join outcome
        try {
          unsubscribeParticipants = subscribeToBoardParticipants(boardId, (participantsData) => {
            setParticipants(participantsData);
          });
        } catch (subError) {
          console.error("Error setting up participants subscription in Board component:", subError);
        }
        
        // Set up a presence heartbeat to keep the user active
        const heartbeatInterval = setInterval(() => {
          if (user) {
            const userRef = doc(db, "users", user.uid);
            updateDoc(userRef, { lastActive: serverTimestamp() })
              .catch(err => console.error("Error updating user presence:", err));
          }
        }, 30000); // Update every 30 seconds
        
        // Clean up the heartbeat interval on unmount
        return () => {
          clearInterval(heartbeatInterval);
        };
      } catch (err) {
        console.error("Error checking/subscribing to board:", err);
        setError("Failed to load board data. Check console for details.");
        setLoading(false);
      }
    };

    // Call the async function
    checkAndSubscribe();

    // Cleanup function
    return () => {
      console.log("Cleaning up subscriptions for board:", boardId);
      unsubscribeBoard();
      unsubscribeCards();
      unsubscribeParticipants();
    };
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
        // Use parseInt to truncate the decimal instead of Math.floor to maintain consistency
        const remainingSeconds = parseInt((remainingMs / 1000).toString(), 10);

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
              timerOriginalDurationSeconds: newDurationSeconds, // Also update the original duration
            }
          : {
              timerPausedDurationSeconds: 0,
              timerOriginalDurationSeconds: 0, // Also update the original duration
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
    // Check inputRef.current exists along with boardId
    if (boardId && inputRef.current) {
      // REMOVED: Explicit blur call - rely on natural blur and the check in handleTimeInputBlur

      // Clear any pending delayed reset if resetting manually
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }

      // Reset to the last saved duration from the board state
      // Fallback to initialDurationSeconds only if board.timerDurationSeconds is undefined/null
      const durationToResetTo =
        board?.timerOriginalDurationSeconds ?? // Use the original duration if available
        board?.timerDurationSeconds ?? initialDurationSeconds;

      // Update local state immediately for responsiveness
      setEditableTimeStr(formatTime(durationToResetTo));

      // Pass the determined duration to resetTimer
      resetTimer(boardId, durationToResetTo).catch((err: unknown) => {
        // Type err
        console.error("Error resetting timer:", err);
        setError("Failed to reset timer.");
      });
    }
  };

  // Handle updating participant name
  const handleUpdateParticipantName = async (userId: string, newName: string) => {
    if (!userId || !newName.trim()) return;
    
    try {
      await updateParticipantName(userId, newName);
      
      // If this is the current user, update the user context
      if (user && userId === user.uid && updateUserDisplayName) {
        // Use the context method to update the display name
        updateUserDisplayName(newName);
      }
    } catch (error) {
      console.error("Error updating participant name:", error);
      setError("Failed to update name. Please try again.");
      // Clear error after 3 seconds
      setTimeout(() => setError(null), 3000);
    }
  };

  // Simplify the toggle participants panel function
  const toggleParticipantsPanel = () => {
    // Simply toggle the panel state
    setIsPanelOpen(!isPanelOpen);
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
            <button 
              className={`text-gray-700 hover:text-gray-900 flex items-center cursor-pointer ${isPanelOpen ? 'text-blue-500' : ''}`}
              onClick={toggleParticipantsPanel}
            >
              <Users className="h-5 w-5" />
              <span className="ml-1 text-sm">Participants</span>
              {participants.length > 0 && (
                <span className="ml-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">
                  {participants.length}
                </span>
              )}
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

      {/* Use the memoized participants panel */}
      <MemoizedParticipantsPanel 
        isOpen={isPanelOpen} 
        onClose={() => setIsPanelOpen(false)}
        participants={participants}
        currentUserId={user?.uid || ''}
        onUpdateName={handleUpdateParticipantName}
      />

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
