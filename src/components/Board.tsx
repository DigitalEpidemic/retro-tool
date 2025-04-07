import {
  ChangeEvent,
  FocusEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react"; // Remove memo import
import { useNavigate, useParams } from "react-router-dom";
// Use @hello-pangea/dnd instead of react-beautiful-dnd
import {
  DragDropContext,
  Draggable,
  Droppable,
  DropResult,
} from "@hello-pangea/dnd";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import {
  Download,
  Pause,
  Play, // Import Pause icon
  RotateCcw,
  Settings,
  Share2,
  TrendingUp,
  Users,
} from "lucide-react";
import { useFirebase } from "../contexts/FirebaseContext";
import {
  addActionPoint,
  deleteActionPoint,
  toggleActionPoint,
} from "../services/actionPointsService"; // Import action points service
import {
  createBoard,
  joinBoard,
  pauseTimer,
  resetTimer,
  startTimer,
  subscribeToBoard,
  subscribeToCards,
  updateCardPosition,
  updateColumnSortState,
  updateParticipantName as updateParticipantNameFirestore,
} from "../services/boardService";
import { Board as BoardType, Card as CardType, db } from "../services/firebase";
import ActionPointsPanel, { ActionPoint } from "./ActionPointsPanel"; // Import ActionPointsPanel
import CardComponent from "./Card";
import Column from "./Column";
import ExportModal from "./ExportModal"; // Import the ExportModal component
import ParticipantsPanel from "./ParticipantsPanel"; // Add ParticipantsPanel import

// Import the new presence service
import { OnlineUser } from "../services/firebase";
import {
  setupPresence,
  subscribeToParticipants,
  updateParticipantName as updateParticipantNameRTDB,
} from "../services/presenceService";

export default function Board() {
  const { boardId } = useParams<{ boardId: string }>();
  const {
    user,
    loading: authLoading,
    error: authError,
    updateUserDisplayName,
  } = useFirebase(); // Get auth loading state and updateUserDisplayName
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
  const [isActionPointsPanelOpen, setIsActionPointsPanelOpen] = useState(false); // State for action points panel
  const [participants, setParticipants] = useState<OnlineUser[]>([]); // State for participants list
  const [actionPoints, setActionPoints] = useState<ActionPoint[]>([]); // State for action points
  const [isExportModalOpen, setIsExportModalOpen] = useState(false); // State for export modal
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
    let cleanupPresence = () => {};

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

            // Get action points if they exist
            if (boardData.actionPoints) {
              setActionPoints(boardData.actionPoints);
            } else {
              setActionPoints([]);
            }
          }
          setLoading(false); // Set loading false once we get *any* snapshot (or null)
        });

        // Subscribe to cards changes (can run concurrently)
        unsubscribeCards = subscribeToCards(boardId, (cardsData) => {
          setCards(cardsData);
        });

        // Still join the board in Firestore for backwards compatibility with cards
        try {
          const joinResult = await joinBoard(
            boardId,
            user.uid,
            user.displayName || "Anonymous User"
          );

          // If join was successful and we have a name that's different from the current user's displayName,
          // update the user's displayName in the context
          if (
            joinResult.success &&
            joinResult.name &&
            joinResult.name !== user.displayName &&
            updateUserDisplayName
          ) {
            updateUserDisplayName(joinResult.name);
            // Setup real-time presence tracking with the updated display name
            cleanupPresence = setupPresence(boardId, joinResult.name);
          } else {
            // Setup real-time presence tracking with the current display name
            cleanupPresence = setupPresence(
              boardId,
              user.displayName || "Anonymous User"
            );
          }
        } catch (joinError) {
          console.error("Error joining board in Firestore:", joinError);
        }

        // Subscribe to participants using the new real-time service
        unsubscribeParticipants = subscribeToParticipants(
          boardId,
          (participantsData) => {
            setParticipants(participantsData);
          }
        );

        return () => {
          // This will be called when the component unmounts
          cleanupPresence();
        };
      } catch (err) {
        console.error("Error checking/subscribing to board:", err);
        setError("Failed to load board data. Check console for details.");
        setLoading(false);
      }
    };

    // Call the async function
    const setupPromise = checkAndSubscribe();

    // Cleanup function
    return () => {
      unsubscribeBoard();
      unsubscribeCards();
      unsubscribeParticipants();

      // Clean up any resources from the setup
      setupPromise
        .then((cleanup) => {
          if (typeof cleanup === "function") {
            cleanup(); // This will clear intervals and remove event listeners
          }
        })
        .catch((err) => console.error("Error during cleanup:", err));
    };
  }, [boardId, navigate, user, authLoading, updateUserDisplayName]);

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
        board?.timerDurationSeconds ??
        initialDurationSeconds;

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
  const handleUpdateParticipantName = async (
    userId: string,
    newName: string
  ) => {
    if (!userId || !newName.trim() || !boardId) return;

    try {
      // Update in Firestore for backwards compatibility with cards
      await updateParticipantNameFirestore(userId, newName);

      // Update in Realtime Database for real-time presence
      await updateParticipantNameRTDB(userId, boardId, newName);

      // If this is the current user, update the context
      if (user && userId === user.uid && updateUserDisplayName) {
        updateUserDisplayName(newName);
      }
    } catch (error) {
      console.error("Error updating participant name:", error);
      setError("Failed to update name. Please try again.");
      setTimeout(() => setError(null), 3000);
    }
  };

  // Simplify the toggle participants panel function
  const toggleParticipantsPanel = () => {
    // Simply toggle the panel state
    setIsPanelOpen(!isPanelOpen);
    // Close action points panel if open
    if (isActionPointsPanelOpen) {
      setIsActionPointsPanelOpen(false);
    }
  };

  // Toggle action points panel
  const toggleActionPointsPanel = () => {
    // Simply toggle the panel state
    setIsActionPointsPanelOpen(!isActionPointsPanelOpen);
    // Close participants panel if open
    if (isPanelOpen) {
      setIsPanelOpen(false);
    }
  };

  // Handle adding a new action point
  const handleAddActionPoint = async (text: string) => {
    if (!boardId || !text.trim()) return;

    // Create a temporary ID and action point for optimistic update
    const tempId = `temp-${Date.now()}`;
    const tempActionPoint: ActionPoint = {
      id: tempId,
      text: text.trim(),
      completed: false,
    };

    try {
      // Update local state optimistically for better UX
      const updatedActionPoints = [...actionPoints, tempActionPoint];
      setActionPoints(updatedActionPoints);

      // Then add to Firestore and wait for response
      const newActionPoint = await addActionPoint(boardId, text);

      // Replace the temporary action point with the real one to maintain
      // state consistency with Firestore
      setActionPoints(
        updatedActionPoints.map((ap) =>
          ap.id === tempId ? newActionPoint : ap
        )
      );
    } catch (error) {
      console.error("Error adding action point:", error);
      setError("Failed to add action point. Please try again.");

      // Remove the temporary action point on error
      setActionPoints((prevPoints) =>
        prevPoints.filter((ap) => ap.id !== tempId)
      );

      setTimeout(() => setError(null), 3000);
    }
  };

  // Handle toggling an action point's completed status
  const handleToggleActionPoint = async (id: string) => {
    if (!boardId) return;

    // Find the action point to toggle
    const actionPoint = actionPoints.find((ap) => ap.id === id);
    if (!actionPoint) return;

    try {
      // Create a new array with the toggled action point
      const updatedActionPoints = actionPoints.map((ap) =>
        ap.id === id ? { ...ap, completed: !ap.completed } : ap
      );

      // Update local state optimistically
      setActionPoints(updatedActionPoints);

      // Then update in Firestore
      await toggleActionPoint(boardId, id);
    } catch (error) {
      console.error("Error toggling action point:", error);
      setError("Failed to update action point. Please try again.");

      // Revert the local state on error
      setActionPoints(
        actionPoints.map((ap) =>
          ap.id === id ? { ...ap, completed: actionPoint.completed } : ap
        )
      );

      setTimeout(() => setError(null), 3000);
    }
  };

  // Handle deleting an action point
  const handleDeleteActionPoint = async (id: string) => {
    if (!boardId) return;

    // Find the action point that's being deleted
    const actionPointToDelete = actionPoints.find((ap) => ap.id === id);
    if (!actionPointToDelete) return;

    try {
      // Create a new array without the deleted action point
      const updatedActionPoints = actionPoints.filter((ap) => ap.id !== id);

      // Update local state optimistically
      setActionPoints(updatedActionPoints);

      // Then delete from Firestore
      await deleteActionPoint(boardId, id);
    } catch (error) {
      console.error("Error deleting action point:", error);
      setError("Failed to delete action point. Please try again.");

      // Add the action point back on error
      setActionPoints([...actionPoints]);

      setTimeout(() => setError(null), 3000);
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

  // Export functionality
  const handleExportClick = () => {
    setIsExportModalOpen(true);
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
              className={`text-gray-700 hover:text-gray-900 flex items-center cursor-pointer ${
                isPanelOpen ? "text-blue-500" : ""
              }`}
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

            <button
              className={`text-gray-700 hover:text-gray-900 flex items-center cursor-pointer ${
                isActionPointsPanelOpen ? "text-blue-500" : ""
              }`}
              onClick={toggleActionPointsPanel}
            >
              <TrendingUp className="h-5 w-5" />
              <span className="ml-1 text-sm">Action points</span>
              {actionPoints.length > 0 && (
                <span className="ml-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">
                  {actionPoints.length}
                </span>
              )}
            </button>

            <button
              className="text-gray-700 hover:text-gray-900 flex items-center cursor-pointer"
              onClick={handleExportClick}
            >
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

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        board={board}
        cards={cards}
      />

      {/* Use the participants panel */}
      <ParticipantsPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        participants={participants}
        currentUserId={user?.uid || ""}
        onUpdateName={handleUpdateParticipantName}
      />

      {/* Use the action points panel */}
      <ActionPointsPanel
        isOpen={isActionPointsPanelOpen}
        onClose={() => setIsActionPointsPanelOpen(false)}
        actionPoints={actionPoints}
        onAddActionPoint={handleAddActionPoint}
        onToggleActionPoint={handleToggleActionPoint}
        onDeleteActionPoint={handleDeleteActionPoint}
      />

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-3 gap-6 px-6 py-4 flex-1 overflow-hidden">
          {Object.values(board.columns)
            .sort((a: ColumnType, b: ColumnType) => a.order - b.order)
            .map((column: ColumnType) => (
              <div
                key={column.id}
                className="border-r border-l border-gray-200 bg-white rounded shadow-sm h-full flex flex-col overflow-hidden"
                data-testid={`column-${column.id}`}
                data-title={column.title}
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
