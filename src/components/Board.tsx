import {
  ChangeEvent,
  FocusEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'; // Remove memo import
import { useNavigate, useParams } from 'react-router-dom';
// Use @hello-pangea/dnd instead of react-beautiful-dnd
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import {
  Download,
  Edit2,
  Menu,
  Pause,
  Play, // Import Pause icon
  RotateCcw,
  Settings,
  Share2,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useFirebase } from '../contexts/useFirebase';
import {
  addActionPoint,
  deleteActionPoint,
  toggleActionPoint,
} from '../services/actionPointsService'; // Import action points service
import {
  deleteBoard,
  joinBoard,
  pauseTimer,
  resetTimer,
  startTimer,
  subscribeToBoard,
  subscribeToCards,
  updateBoardName,
  updateCardPosition,
  updateColumnDescription,
  updateColumnSortState,
  updateColumnTitle,
  updateParticipantName,
  updateShowAddColumnPlaceholder,
  updateUserCardsColor,
} from '../services/boardService';
import { Board as BoardType, Card as CardType, db } from '../services/firebase';
import ActionPointsPanel, { ActionPoint } from './ActionPointsPanel'; // Import ActionPointsPanel
import AddColumnPlaceholder from './AddColumnPlaceholder'; // Import the AddColumnPlaceholder component
import CardComponent from './Card';
import Column from './Column';
import ExportModal from './ExportModal'; // Import the ExportModal component
import OptionsPanel from './OptionsPanel'; // Import the OptionsPanel component
import ParticipantsPanel from './ParticipantsPanel'; // Add ParticipantsPanel import
import ShareModal from './ShareModal'; // Import the ShareModal component

// Import the new presence service
import { OnlineUser } from '../services/firebase';
import {
  setupPresence,
  subscribeToParticipants,
  updateParticipantColor,
  updateParticipantName as updateParticipantNameRTDB,
} from '../services/presenceService';

// Track the last time we updated card colors to throttle updates
let lastCardColorUpdate = 0;
const COLOR_UPDATE_INTERVAL = 5000; // Minimum 5 seconds between card color updates

export default function Board() {
  const { boardId } = useParams<{ boardId: string }>();
  const { user, loading: authLoading, error: authError, updateUserDisplayName } = useFirebase(); // Get auth loading state and updateUserDisplayName
  const navigate = useNavigate();
  const [board, setBoard] = useState<BoardType | null>(null); // Use BoardType
  const [cards, setCards] = useState<CardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remainingTime, setRemainingTime] = useState<number | null>(null); // State for countdown display
  const [editableTimeStr, setEditableTimeStr] = useState<string>(''); // State for editable input
  const [isEditingTimer, setIsEditingTimer] = useState(false); // State to track timer edit mode
  const [columnSortStates, setColumnSortStates] = useState<Record<string, boolean>>({}); // Track sort by votes per column
  const [isPanelOpen, setIsPanelOpen] = useState(false); // State for participants panel
  const [isActionPointsPanelOpen, setIsActionPointsPanelOpen] = useState(false); // State for action points panel
  const [isOptionsPanelOpen, setIsOptionsPanelOpen] = useState(false); // State for options panel
  const [participants, setParticipants] = useState<OnlineUser[]>([]); // State for participants list
  const [actionPoints, setActionPoints] = useState<ActionPoint[]>([]); // State for action points
  const [isExportModalOpen, setIsExportModalOpen] = useState(false); // State for export modal
  const [isShareModalOpen, setIsShareModalOpen] = useState(false); // State for share modal
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null); // Ref to store interval ID
  const resetTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for delayed reset timeout
  const initialDurationSeconds = 300; // 5 minutes (default)
  const inputRef = useRef<HTMLInputElement>(null); // Ref for the input element
  const escapePressedRef = useRef(false); // Ref to track if blur was triggered by Escape
  const [showAddColumnPlaceholder, setShowAddColumnPlaceholder] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState(false); // Track dragging state
  const columnsContainerRef = useRef<HTMLDivElement>(null); // Reference to the columns container
  const autoScrollIntervalRef = useRef<NodeJS.Timeout | null>(null); // Reference to auto-scroll interval
  const lastClientXRef = useRef<number | null>(null); // Track last mouse/touch X position

  // Track if user's cards have been updated with the current color
  const cardColorsUpdatedRef = useRef(false);

  // Board name editing states
  const [isEditingBoardName, setIsEditingBoardName] = useState(false);
  const [editableBoardName, setEditableBoardName] = useState('');
  const boardNameInputRef = useRef<HTMLInputElement>(null);
  const boardNameEscapePressedRef = useRef(false);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // State for mobile hamburger menu

  // Track just-dragged card ID between renders
  const draggableId = useRef<string | null>(null);
  // Track the timestamp of the most recent drag operation
  const lastDragTimestampRef = useRef<number>(0);
  // Track local card positions to prevent flicker
  const localCardUpdatesRef = useRef<
    Record<string, { position: number; columnId: string; timestamp: number }>
  >({});
  // Add ref to track latest cards state
  const cardsRef = useRef<CardType[]>([]);

  // Update cards ref whenever cards state changes
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  useEffect(() => {
    // Don't proceed if auth is still loading or if there's no boardId
    if (authLoading || !boardId) {
      return;
    }

    // If auth is done but there's no user (e.g., sign-in failed), handle error or redirect
    if (!user) {
      setError('Authentication failed. Please try again.');
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
        const boardRef = doc(db, 'boards', boardId);
        const boardSnap = await getDoc(boardRef);

        if (!boardSnap.exists()) {
          // Board doesn't exist, redirect to home page
          console.log(`Board ${boardId} not found, redirecting to home page...`);
          navigate('/');
          return;
        }

        // Now that we know the board exists, subscribe
        setLoading(true); // Ensure loading is true before subscription potentially sets it false
        setError(null);

        // Subscribe to board changes
        unsubscribeBoard = subscribeToBoard(boardId, boardData => {
          if (!boardData) {
            // Board doesn't exist or was deleted - unsubscribe and redirect
            console.log(`Board ${boardId} not found in subscription, redirecting to home...`);
            unsubscribeBoard();
            unsubscribeCards();
            unsubscribeParticipants();
            navigate('/');
            return;
          }

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

          // Initialize showAddColumnPlaceholder from board data
          setShowAddColumnPlaceholder(boardData.showAddColumnPlaceholder === true);

          setLoading(false); // Set loading false once we get *any* snapshot
        });

        // Subscribe to cards changes (can run concurrently)
        unsubscribeCards = subscribeToCards(boardId, cardsData => {
          // Check if we have any local card updates that should override Firestore
          const now = Date.now();
          const debounceTime = 3000; // 3 seconds debounce - increased for multiple operations

          // Clean up expired entries from localCardUpdatesRef
          const activeCardUpdates: Record<
            string,
            { position: number; columnId: string; timestamp: number }
          > = {};
          let hasActiveUpdates = false;

          Object.entries(localCardUpdatesRef.current).forEach(([cardId, update]) => {
            if (now - update.timestamp < debounceTime) {
              activeCardUpdates[cardId] = update;
              hasActiveUpdates = true;
            }
          });

          // Replace with only active updates
          localCardUpdatesRef.current = activeCardUpdates;

          // If we've done a drag operation in the last few seconds, preserve local card positions
          if (hasActiveUpdates) {
            // Create a map of columns to cards for more efficient processing
            const columnCardsMap: Record<string, CardType[]> = {};

            // First, group all cards by column
            cardsData.forEach(card => {
              // Check if we have a local update for this card
              const localUpdate = localCardUpdatesRef.current[card.id];

              // Use the local column if there's an update
              const columnId = localUpdate ? localUpdate.columnId : card.columnId;

              if (!columnCardsMap[columnId]) {
                columnCardsMap[columnId] = [];
              }

              // Use the locally updated column ID if available
              columnCardsMap[columnId].push({ ...card, columnId });
            });

            // Now, process each column's cards, ordering by local positions where available
            const processedCards: CardType[] = [];

            Object.entries(columnCardsMap).forEach(([, columnCards]) => {
              // Sort cards within this column
              columnCards.sort((a, b) => {
                const aLocalUpdate = localCardUpdatesRef.current[a.id];
                const bLocalUpdate = localCardUpdatesRef.current[b.id];

                // If both have local updates, use the local positions
                if (aLocalUpdate && bLocalUpdate) {
                  return aLocalUpdate.position - bLocalUpdate.position;
                }

                // If only a has a local update, it should come first
                if (aLocalUpdate) return -1;

                // If only b has a local update, it should come first
                if (bLocalUpdate) return 1;

                // Otherwise, use their Firestore positions
                return (a.position || 0) - (b.position || 0);
              });

              // Assign sequential positions
              columnCards.forEach((card, index) => {
                processedCards.push({
                  ...card,
                  position: index * 1000,
                });
              });
            });

            setCards(processedCards);
          } else {
            setCards(cardsData);
          }
        });

        // Still join the board in Firestore for backwards compatibility with cards
        try {
          const joinResult = await joinBoard(
            boardId,
            user.uid,
            user.displayName ?? 'Anonymous User'
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
            cleanupPresence = await setupPresence(boardId, joinResult.name);
          } else {
            // Setup real-time presence tracking with the current display name
            cleanupPresence = await setupPresence(boardId, user.displayName ?? 'Anonymous User');
          }

          // No need to update localStorage - we'll rely on Firestore for color preference
        } catch (joinError) {
          console.error('Error joining board in Firestore:', joinError);
        }

        // Subscribe to participants using the new real-time service
        unsubscribeParticipants = subscribeToParticipants(boardId, participantsData => {
          setParticipants(participantsData);

          // Check if this user is in the participants list
          const isUserActive = participantsData.some(p => p.id === user.uid);

          // Only update card colors if:
          // 1. User is active in the participants list
          // 2. We haven't updated colors in this session yet (using ref)
          // 3. It's been at least COLOR_UPDATE_INTERVAL since the last update (throttling)
          const now = Date.now();
          if (
            isUserActive &&
            !cardColorsUpdatedRef.current &&
            now - lastCardColorUpdate > COLOR_UPDATE_INTERVAL
          ) {
            // Get user's color from Firestore instead of localStorage
            const getUserColor = async () => {
              try {
                const userRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userRef);

                if (userDoc.exists() && userDoc.data().color) {
                  const userColor = userDoc.data().color;

                  lastCardColorUpdate = now; // Update timestamp before async operation

                  updateUserCardsColor(user.uid, userColor, boardId)
                    .then(result => {
                      if (result.success) {
                        cardColorsUpdatedRef.current = true; // Mark as updated for this session
                        console.log(
                          `Updated ${result.updated} cards in this board with user's color`
                        );
                      }
                    })
                    .catch(err => {
                      console.error('Error updating card colors:', err);
                      // Failed update, reset throttle to allow retry sooner
                      lastCardColorUpdate = now - COLOR_UPDATE_INTERVAL / 2;
                    });
                }
              } catch (error) {
                console.error('Error getting user color:', error);
              }
            };

            getUserColor();
          }
        });

        return () => {
          // This will be called when the component unmounts
          cleanupPresence();
        };
      } catch (err) {
        console.error('Error checking/subscribing to board:', err);
        setError('Failed to load board data. Check console for details.');
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
        .then(cleanup => {
          if (typeof cleanup === 'function') {
            cleanup(); // This will clear intervals and remove event listeners
          }
        })
        .catch(err => console.error('Error during cleanup:', err));
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

    if (board?.timerIsRunning && board.timerStartTime && board.timerDurationSeconds) {
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
              resetTimer(boardId, board.timerDurationSeconds ?? initialDurationSeconds).catch(
                (err: unknown) => {
                  console.error('Error auto-resetting timer:', err);
                  // Optionally set an error state here
                }
              );
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
      const initialSeconds = board?.timerDurationSeconds ?? initialDurationSeconds;
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

  // Update editableBoardName when board data changes
  useEffect(() => {
    if (board) {
      setEditableBoardName(board.name ?? 'Unnamed Board');
    }
  }, [board, board?.name]);

  // Helper function to format time
  const formatTime = (totalSeconds: number | null): string => {
    if (totalSeconds === null || totalSeconds < 0) {
      return '0:00'; // Or some default/loading state
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Helper function to parse "MM:SS" string to total seconds
  const parseTime = (timeStr: string): number | null => {
    const parts = timeStr.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!parts) return null;
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    if (isNaN(minutes) || isNaN(seconds) || seconds < 0 || seconds > 59 || minutes < 0) {
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
        console.error('Error pausing timer:', err);
        setError('Failed to pause timer.');
      });
    } else {
      // --- Start or Resume Timer ---
      // Pass the current board state to startTimer
      startTimer(boardId, board).catch((err: unknown) => {
        // Type err
        console.error('Error starting/resuming timer:', err);
        setError('Failed to start/resume timer.');
      });
    }
  };

  // Handler for saving edited time
  const handleSaveEditedTime = async () => {
    if (!boardId || board?.timerIsRunning) return; // Only save if stopped/paused

    const newDurationSeconds = parseTime(editableTimeStr);

    if (newDurationSeconds === null || newDurationSeconds < 0) {
      // Invalid input, revert to the last known valid time
      console.warn('Invalid time format entered:', editableTimeStr);
      const lastValidTime =
        board?.timerPausedDurationSeconds ?? board?.timerDurationSeconds ?? initialDurationSeconds;
      setEditableTimeStr(formatTime(lastValidTime));
      return;
    }

    // Update Firestore directly
    const boardRef = doc(db, 'boards', boardId);
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
      console.error('Error updating timer duration:', err);
      setError('Failed to update timer duration.');
      // Revert input on error
      const lastValidTime =
        board?.timerPausedDurationSeconds ?? board?.timerDurationSeconds ?? initialDurationSeconds;
      setEditableTimeStr(formatTime(lastValidTime)); // Revert input on error
    }
  };

  // Handle input change
  const handleTimeInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEditableTimeStr(e.target.value);
  };

  // Handle click on timer link
  const handleTimerClick = () => {
    if (!board?.timerIsRunning) {
      setIsEditingTimer(true);
    }
  };

  // Handle saving on Enter key press
  const handleTimeInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveEditedTime();
      setIsEditingTimer(false);
    } else if (e.key === 'Escape') {
      // Revert to last known valid time on Escape
      const lastValidTime =
        board?.timerPausedDurationSeconds ?? board?.timerDurationSeconds ?? initialDurationSeconds;
      escapePressedRef.current = true; // Signal that Escape was pressed
      setEditableTimeStr(formatTime(lastValidTime));
      setIsEditingTimer(false);
      inputRef.current?.blur(); // Remove focus
    }
  };

  // Handle saving on blur (losing focus)
  const handleTimeInputBlur = (e: FocusEvent<HTMLInputElement>) => {
    // If blur was triggered by Escape key, reset the flag and do nothing else
    if (escapePressedRef.current) {
      escapePressedRef.current = false;
      setIsEditingTimer(false);
      return;
    }

    // Prevent saving if the blur was caused by clicking a timer control button
    if (
      e.relatedTarget instanceof HTMLButtonElement &&
      e.relatedTarget.closest('.timer-controls') // Add a class to the controls container
    ) {
      return;
    }
    // Only save on blur if the value has actually changed from the last valid state
    const lastValidTime =
      board?.timerPausedDurationSeconds ?? board?.timerDurationSeconds ?? initialDurationSeconds;
    if (editableTimeStr !== formatTime(lastValidTime)) {
      handleSaveEditedTime();
    }
    setIsEditingTimer(false);
  };

  const handleResetTimer = () => {
    // Check only if boardId is available
    if (boardId) {
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
        console.error('Error resetting timer:', err);
        setError('Failed to reset timer.');
      });
    }
  };

  // Handle updating participant name
  const handleUpdateParticipantName = async (userId: string, newName: string) => {
    if (!userId || !newName.trim() || !boardId) return;

    try {
      // Update in Firestore for backwards compatibility with cards
      await updateParticipantName(userId, newName);

      // Update in Realtime Database for real-time presence
      await updateParticipantNameRTDB(userId, boardId, newName);

      // If this is the current user, update the context
      if (user && userId === user.uid && updateUserDisplayName) {
        updateUserDisplayName(newName);
      }
    } catch (error) {
      console.error('Error updating participant name:', error);
      setError('Failed to update name. Please try again.');
      setTimeout(() => setError(null), 3000);
    }
  };

  // Handle updating participant color
  const handleUpdateParticipantColor = async (userId: string, newColor: string) => {
    console.log(
      `handleUpdateParticipantColor called with userId: ${userId}, newColor: ${newColor}, boardId: ${boardId}`
    );

    // Validate inputs
    if (!userId || !newColor || !boardId) {
      console.error('Missing required parameters:', {
        userId,
        newColor,
        boardId,
      });
      return;
    }

    // Get current user's color to check if it's actually changing
    const currentUser = participants.find(p => p.id === userId);
    if (currentUser && currentUser.color === newColor) {
      console.log(`Color is already ${newColor}, no need to update`);
      return;
    }

    try {
      // Update in Firestore
      const userRef = doc(db, 'users', userId);
      console.log(`Updating Firestore user document with color: ${newColor}`);
      await updateDoc(userRef, {
        color: newColor,
        lastUpdated: new Date(), // Add timestamp for tracking
      });

      // Update in Realtime Database for real-time presence
      console.log(`Updating RTDB presence with color: ${newColor}`);
      await updateParticipantColor(userId, boardId, newColor);

      // If this is the current user, also update their cards' color
      if (user && userId === user.uid) {
        // Only update card colors if enough time has passed since the last update
        const now = Date.now();
        if (now - lastCardColorUpdate > COLOR_UPDATE_INTERVAL) {
          console.log(`Updating user's cards color to: ${newColor}`);
          lastCardColorUpdate = now;
          const result = await updateUserCardsColor(userId, newColor, boardId);
          if (result.success) {
            console.log(`Successfully updated ${result.updated} cards with new color`);

            // Force a UI refresh by updating state
            const updatedParticipants = participants.map(p =>
              p.id === userId ? { ...p, color: newColor } : p
            );
            setParticipants(updatedParticipants);
          } else {
            console.error('Error updating cards with new color:', result.error);
          }
        } else {
          console.log(
            `Skipping card color update due to throttling. Time since last update: ${
              now - lastCardColorUpdate
            }ms`
          );
        }
      }
    } catch (error) {
      console.error('Error updating participant color:', error);
      setError('Failed to update color. Please try again.');
      setTimeout(() => setError(null), 3000);
    }
  };

  // Simplify the toggle participants panel function
  const toggleParticipantsPanel = () => {
    // Simply toggle the panel state
    setIsPanelOpen(!isPanelOpen);
    // Close other panels if open
    if (isActionPointsPanelOpen) {
      setIsActionPointsPanelOpen(false);
    }
    if (isOptionsPanelOpen) {
      setIsOptionsPanelOpen(false);
    }
  };

  // Toggle action points panel
  const toggleActionPointsPanel = () => {
    // Simply toggle the panel state
    setIsActionPointsPanelOpen(!isActionPointsPanelOpen);
    // Close other panels if open
    if (isPanelOpen) {
      setIsPanelOpen(false);
    }
    if (isOptionsPanelOpen) {
      setIsOptionsPanelOpen(false);
    }
  };

  // Toggle options panel
  const toggleOptionsPanel = () => {
    // Simply toggle the panel state
    setIsOptionsPanelOpen(!isOptionsPanelOpen);
    // Close other panels if open
    if (isPanelOpen) {
      setIsPanelOpen(false);
    }
    if (isActionPointsPanelOpen) {
      setIsActionPointsPanelOpen(false);
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
      setActionPoints(updatedActionPoints.map(ap => (ap.id === tempId ? newActionPoint : ap)));
    } catch (error) {
      console.error('Error adding action point:', error);
      setError('Failed to add action point. Please try again.');

      // Remove the temporary action point on error
      setActionPoints(prevPoints => prevPoints.filter(ap => ap.id !== tempId));

      setTimeout(() => setError(null), 3000);
    }
  };

  // Handle toggling an action point's completed status
  const handleToggleActionPoint = async (id: string) => {
    if (!boardId) return;

    // Find the action point to toggle
    const actionPoint = actionPoints.find(ap => ap.id === id);
    if (!actionPoint) return;

    try {
      // Create a new array with the toggled action point
      const updatedActionPoints = actionPoints.map(ap =>
        ap.id === id ? { ...ap, completed: !ap.completed } : ap
      );

      // Update local state optimistically
      setActionPoints(updatedActionPoints);

      // Then update in Firestore
      await toggleActionPoint(boardId, id);
    } catch (error) {
      console.error('Error toggling action point:', error);
      setError('Failed to update action point. Please try again.');

      // Revert the local state on error
      setActionPoints(
        actionPoints.map(ap => (ap.id === id ? { ...ap, completed: actionPoint.completed } : ap))
      );

      setTimeout(() => setError(null), 3000);
    }
  };

  // Handle deleting an action point
  const handleDeleteActionPoint = async (id: string) => {
    if (!boardId) return;

    // Find the action point that's being deleted
    const actionPointToDelete = actionPoints.find(ap => ap.id === id);
    if (!actionPointToDelete) return;

    try {
      // Create a new array without the deleted action point
      const updatedActionPoints = actionPoints.filter(ap => ap.id !== id);

      // Update local state optimistically
      setActionPoints(updatedActionPoints);

      // Then delete from Firestore
      await deleteActionPoint(boardId, id);
    } catch (error) {
      console.error('Error deleting action point:', error);
      setError('Failed to delete action point. Please try again.');

      // Add the action point back on error
      setActionPoints([...actionPoints]);

      setTimeout(() => setError(null), 3000);
    }
  };

  // Handle drag start
  const handleDragStart = () => {
    setIsDragging(true);
    lastClientXRef.current = null; // Reset position tracking
  };

  const handleDragEnd = async (result: DropResult) => {
    // Clear drag state
    setIsDragging(false);

    // Clear auto-scroll interval
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }

    // Make async
    const { destination, source, draggableId } = result;

    // Dropped outside a valid area
    if (!destination) return;

    // Dropped in the same position
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      return;
    }

    const sourceColumnId = source.droppableId;
    const destinationColumnId = destination.droppableId;
    // const sourceIndex = source.index; // Removed unused variable
    const destinationIndex = destination.index;

    // Use cardsRef.current to access the latest cards state
    const currentCards = cardsRef.current;

    // Find the card being moved
    const draggedCardIndex = currentCards.findIndex(card => card.id === draggableId);
    if (draggedCardIndex === -1) {
      console.error('Card not found:', draggableId);
      return;
    }

    // Create a clone of cards array for update
    const updatedCards = [...currentCards];
    const draggedCard = { ...updatedCards[draggedCardIndex] };

    // Remove card from original position
    updatedCards.splice(draggedCardIndex, 1);

    // Update the column ID if needed
    draggedCard.columnId = destinationColumnId;

    // Find where to insert the card (simplify this logic)
    // For now we'll just extract cards in the destination column to find the right spot
    const destColumnCards = updatedCards.filter(card => card.columnId === destinationColumnId);

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
      insertIndex = updatedCards.findIndex(card => card.id === refCard.id);
    }

    // Insert the card at the new position
    updatedCards.splice(insertIndex, 0, draggedCard);

    // Calculate new position values for all cards in the source and destination columns
    // We need to recalculate both columns to maintain consistent ordering
    if (sourceColumnId !== destinationColumnId) {
      // If moving between columns, update both source and destination column positions
      const updatedSourceColumnCards = updatedCards.filter(
        card => card.columnId === sourceColumnId
      );
      updatedSourceColumnCards.forEach((card, idx) => {
        card.position = idx * 1000;

        // Update our local tracking for this card's position
        localCardUpdatesRef.current[card.id] = {
          position: idx * 1000,
          columnId: sourceColumnId,
          timestamp: Date.now(),
        };
      });
    }

    // Always update destination column positions
    const updatedDestColumnCards = updatedCards.filter(
      card => card.columnId === destinationColumnId
    );
    updatedDestColumnCards.forEach((card, idx) => {
      card.position = idx * 1000;

      // Update our local tracking for this card's position
      localCardUpdatesRef.current[card.id] = {
        position: idx * 1000,
        columnId: destinationColumnId,
        timestamp: Date.now(),
      };
    });

    // Find the moved card's new position
    const movedCardNewPosition = updatedCards.find(card => card.id === draggableId)?.position ?? 0;

    // Store the local update in the ref to preserve it during Firestore updates
    localCardUpdatesRef.current[draggableId] = {
      position: movedCardNewPosition,
      columnId: destinationColumnId,
      timestamp: Date.now(),
    };

    // Update the last drag timestamp
    lastDragTimestampRef.current = Date.now();

    // Update state optimistically
    setCards(updatedCards);

    // Update Firestore
    try {
      // Only update if boardId is available
      if (boardId) {
        await updateCardPosition(
          draggableId,
          destinationColumnId,
          destinationIndex,
          sourceColumnId,
          boardId
        );

        // Keep local updates for 2 more seconds after Firestore completes
        // This ensures we don't get flickering even after the update completes
        lastDragTimestampRef.current = Date.now();
      } else {
        console.error('Cannot update card position: boardId is undefined');
      }
    } catch (error) {
      console.error('Error updating card position:', error);
      // Revert state if needed
    }
  };

  // Export functionality
  const handleExportClick = () => {
    setIsExportModalOpen(true);
  };

  // Share functionality
  const handleShareClick = () => {
    setIsShareModalOpen(true);
  };

  // Handle deleting the board
  const handleDeleteBoard = async () => {
    if (!boardId || !user) {
      setError('You must be logged in to delete a board.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      setLoading(true);

      // First check if the user is the facilitator
      if (board?.facilitatorId !== user.uid) {
        setError('Only the board creator can delete this board.');
        setLoading(false);
        setTimeout(() => setError(null), 3000);
        return;
      }

      // Delete the board first
      await deleteBoard(boardId, user.uid);

      // Then navigate to home page after successful deletion
      navigate('/');
    } catch (error) {
      console.error('Error deleting board:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to delete board. Please try again.'
      );
      setLoading(false);
      setTimeout(() => setError(null), 3000);
    }
  };

  // Handle toggling the add column placeholder visibility
  const handleToggleAddColumnPlaceholder = async (show: boolean) => {
    if (!boardId) return;

    try {
      // Update local state optimistically
      setShowAddColumnPlaceholder(show);

      // Update in Firestore
      const result = await updateShowAddColumnPlaceholder(boardId, show);

      if (!result.success) {
        // Revert state if the update failed
        setShowAddColumnPlaceholder(!show);
        console.error('Failed to update column placeholder visibility:', result.error);
      }
    } catch (error) {
      // Revert state on error
      setShowAddColumnPlaceholder(!show);
      console.error('Error toggling add column placeholder:', error);
    }
  };

  // Check if the current user is the board owner/facilitator
  const isBoardOwner = useMemo(() => {
    return board?.facilitatorId === user?.uid;
  }, [board?.facilitatorId, user?.uid]);

  // Effect to track which column is visible while scrolling
  useEffect(() => {
    if (!board?.columns) return;

    // Function to handle scroll events
    const handleScroll = () => {
      // Get all column elements
      const columnElements = Object.values(board.columns)
        .sort((a, b) => a.order - b.order)
        .map(column => ({
          id: column.id,
          element: document.getElementById(`column-${column.id}`),
        }))
        .filter(item => item.element !== null);

      // Add "Add Column" placeholder if visible
      if (board.facilitatorId === user?.uid && showAddColumnPlaceholder) {
        const addColumnElement = document.getElementById('add-column-placeholder');
        if (addColumnElement) {
          columnElements.push({
            id: 'add-column',
            element: addColumnElement,
          });
        }
      }

      // Determine which column is most visible in the viewport
      const viewportMiddle = window.innerHeight / 2;

      // Find the column closest to the middle of the viewport
      let smallestDistance = Infinity;

      columnElements.forEach(({ id: _id, element }) => {
        if (element) {
          const rect = element.getBoundingClientRect();
          const elementMiddle = rect.top + rect.height / 2;
          const distanceToMiddle = Math.abs(elementMiddle - viewportMiddle);

          if (distanceToMiddle < smallestDistance) {
            smallestDistance = distanceToMiddle;
          }
        }
      });

      // No need to update the UI based on scroll position
    };

    // Run the scroll handler once to initialize
    handleScroll();

    // Cleanup
    return () => {
      // No need for cleanup since we're not adding event listeners
    };
  }, [board?.columns, board?.facilitatorId, user?.uid, showAddColumnPlaceholder]);

  // Handle tracking mouse/touch position for auto-scrolling
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if ('touches' in e) {
        // Touch event
        lastClientXRef.current = e.touches[0].clientX;
      } else {
        // Mouse event
        lastClientXRef.current = e.clientX;
      }
    };

    // Listen to both mouse and touch events
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('touchmove', handleMouseMove as EventListener);

    // Start auto-scroll interval when dragging
    if (!autoScrollIntervalRef.current && columnsContainerRef.current) {
      autoScrollIntervalRef.current = setInterval(() => {
        if (!isDragging || !columnsContainerRef.current || lastClientXRef.current === null) {
          return;
        }

        const container = columnsContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const currentX = lastClientXRef.current;

        // Auto-scroll thresholds
        const scrollEdgeSize = 100; // Size of the scroll activating area from edge

        // Check if mouse/touch is near left or right edge of container
        if (currentX < containerRect.left + scrollEdgeSize) {
          // Scroll left when near left edge
          const scrollSpeed = Math.max(5, (scrollEdgeSize - (currentX - containerRect.left)) / 2);
          container.scrollLeft -= scrollSpeed;
        } else if (currentX > containerRect.right - scrollEdgeSize) {
          // Scroll right when near right edge
          const scrollSpeed = Math.max(5, (currentX - (containerRect.right - scrollEdgeSize)) / 2);
          container.scrollLeft += scrollSpeed;
        }
      }, 16); // 60fps-ish update rate
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchmove', handleMouseMove as EventListener);
    };
  }, [isDragging]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
    };
  }, []);

  // Handle board name click to start editing
  const handleBoardNameClick = () => {
    if (isBoardOwner && !isEditingBoardName) {
      setIsEditingBoardName(true);
    }
  };

  // Add effect to select all text when editing starts
  useEffect(() => {
    if (isEditingBoardName && boardNameInputRef.current) {
      // Focus and select all text after the input is rendered
      setTimeout(() => {
        if (boardNameInputRef.current) {
          boardNameInputRef.current.select();
        }
      }, 10);
    }
  }, [isEditingBoardName]);

  // Handle saving board name
  const handleSaveBoardName = async () => {
    if (!boardId || !isBoardOwner) return;

    const trimmedName = editableBoardName.trim();
    if (!trimmedName) {
      // Don't allow empty names, revert to previous name or default
      setEditableBoardName(board?.name ?? 'Unnamed Board');
      setIsEditingBoardName(false);
      return;
    }

    // Only save if the name has changed
    if (trimmedName !== board?.name) {
      try {
        const result = await updateBoardName(boardId, trimmedName);
        if (!result.success) {
          // Revert to original name if update failed
          setEditableBoardName(board?.name ?? 'Unnamed Board');
          console.error('Failed to update board name:', result.error);
        }
      } catch (error) {
        console.error('Error updating board name:', error);
        setEditableBoardName(board?.name ?? 'Unnamed Board'); // Revert on error
      }
    }

    setIsEditingBoardName(false);
  };

  // Handle input change
  const handleBoardNameInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEditableBoardName(e.target.value);
  };

  // Handle key press in input
  const handleBoardNameInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveBoardName();
    } else if (e.key === 'Escape') {
      boardNameEscapePressedRef.current = true;
      setEditableBoardName(board?.name ?? 'Unnamed Board'); // Revert to original name
      setIsEditingBoardName(false);
      boardNameInputRef.current?.blur();
    }
  };

  // Handle input blur
  const handleBoardNameInputBlur = () => {
    // If blur was triggered by Escape key, reset the flag and do nothing else
    if (boardNameEscapePressedRef.current) {
      boardNameEscapePressedRef.current = false;
      return;
    }

    handleSaveBoardName();
  };

  // Modified onDragEnd to track the dragged card ID
  const wrappedHandleDragEnd = (result: DropResult) => {
    draggableId.current = result.draggableId;
    handleDragEnd(result);
  };

  const [isMobile, setIsMobile] = useState(false);

  // Set up viewport detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // 768px is md: breakpoint in Tailwind
    };

    // Check initially
    checkMobile();

    // Add resize listener
    window.addEventListener('resize', checkMobile);

    // Clean up
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
      <div className="p-4 text-center text-red-500">Authentication Error: {authError.message}</div>
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
  type ColumnType = BoardType['columns'][string];

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      {/* Loading/Error state handling */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-gray-500">Loading board...</div>
        </div>
      )}

      {!loading && !boardId && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-500">Invalid board ID</div>
        </div>
      )}

      {!loading && !board && boardId && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-500">Board not found</div>
        </div>
      )}

      {!loading && board && boardId && (
        <>
          {/* Top Board Header */}
          <div className="px-3 sm:px-6 py-3 border-b border-gray-200 bg-white flex flex-col md:flex-row md:items-center">
            {!isMobile && (
              <div className="flex items-center space-x-4 mr-4 shrink-0 order-2 md:order-1">
                {/* Timer Display and Controls */}
                <div
                  className="flex items-center space-x-1 timer-controls"
                  data-testid="desktop-timer-controls"
                >
                  {/* Conditional Rendering: Input vs Clickable Span */}
                  {board?.timerIsRunning ? (
                    <span
                      className="text-gray-700 font-medium w-12 text-right"
                      title="Remaining time"
                    >
                      {formatTime(remainingTime)}
                    </span>
                  ) : isEditingTimer ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editableTimeStr}
                      onChange={handleTimeInputChange}
                      onKeyDown={handleTimeInputKeyDown}
                      onBlur={handleTimeInputBlur}
                      autoFocus
                      className="text-gray-700 font-medium w-12 text-right border border-gray-300 rounded px-1 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      title="Edit time (MM:SS)"
                      data-testid="desktop-timer-input"
                    />
                  ) : (
                    <span
                      className="text-gray-700 font-medium w-12 text-right cursor-pointer hover:text-blue-500"
                      title="Click to edit time"
                      onClick={handleTimerClick}
                    >
                      {formatTime(remainingTime)}
                    </span>
                  )}
                  {/* Play/Pause Button */}
                  <button
                    onClick={handleStartPauseTimer}
                    className={`cursor-pointer p-1 rounded transition-colors duration-300 touch-feedback ${
                      board?.timerIsRunning
                        ? 'text-orange-500 hover:text-orange-600 active:text-orange-700 hover:bg-orange-50 active:bg-orange-100'
                        : 'text-blue-500 hover:text-blue-600 active:text-blue-700 hover:bg-blue-50 active:bg-blue-100'
                    }`}
                    aria-label={board?.timerIsRunning ? 'Pause timer' : 'Start timer'}
                    data-testid="desktop-timer-play-pause-button"
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
                    aria-label="Reset timer"
                    disabled={!!board?.timerIsRunning}
                    className={`cursor-pointer p-1 rounded transition-colors duration-300 touch-feedback ${
                      board?.timerIsRunning
                        ? 'text-gray-400 opacity-50 cursor-not-allowed'
                        : 'text-gray-600 hover:text-gray-800 active:text-gray-900 hover:bg-gray-50 active:bg-gray-100'
                    }`}
                    data-testid="desktop-timer-reset-button"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>

                {/* Other Board Controls */}
                <div className="flex space-x-5">
                  <button
                    className={`text-gray-700 hover:text-gray-900 active:text-blue-800 flex items-center cursor-pointer p-2 rounded hover:bg-gray-50 active:bg-gray-100 transition-colors duration-300 touch-feedback ${
                      isPanelOpen ? 'text-blue-500' : ''
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
                    className={`text-gray-700 hover:text-gray-900 active:text-blue-800 flex items-center cursor-pointer p-2 rounded hover:bg-gray-50 active:bg-gray-100 transition-colors duration-300 touch-feedback ${
                      isActionPointsPanelOpen ? 'text-blue-500' : ''
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
                    className="text-gray-700 hover:text-gray-900 active:text-blue-800 flex items-center cursor-pointer p-2 rounded hover:bg-gray-50 active:bg-gray-100 transition-colors duration-300 touch-feedback"
                    onClick={handleExportClick}
                  >
                    <Download className="h-5 w-5" />
                    <span className="ml-1 text-sm">Export</span>
                  </button>

                  <button
                    className="text-gray-700 hover:text-gray-900 active:text-blue-800 flex items-center cursor-pointer p-2 rounded hover:bg-gray-50 active:bg-gray-100 transition-colors duration-300 touch-feedback"
                    onClick={handleShareClick}
                  >
                    <Share2 className="h-5 w-5" />
                    <span className="ml-1 text-sm">Share</span>
                  </button>

                  <button
                    className={`text-gray-700 hover:text-gray-900 active:text-blue-800 flex items-center cursor-pointer p-2 rounded hover:bg-gray-50 active:bg-gray-100 transition-colors duration-300 touch-feedback ${
                      isOptionsPanelOpen ? 'text-blue-500' : ''
                    }`}
                    onClick={toggleOptionsPanel}
                  >
                    <Settings className="h-5 w-5" />
                    <span className="ml-1 text-sm">Options</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between md:order-1 md:order-none md:mr-4 md:min-w-0 md:flex-1">
              <div className="flex items-center space-x-3 truncate min-w-0">
                {isEditingBoardName ? (
                  <input
                    ref={boardNameInputRef}
                    type="text"
                    value={editableBoardName}
                    onChange={handleBoardNameInputChange}
                    onKeyDown={handleBoardNameInputKeyDown}
                    onBlur={handleBoardNameInputBlur}
                    autoFocus
                    className="text-lg font-semibold text-gray-800 border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 w-full max-w-md"
                    data-testid="board-name-input"
                  />
                ) : (
                  <h1
                    className={`text-lg font-semibold text-gray-800 ${isBoardOwner ? 'cursor-pointer hover:text-blue-600 group' : ''} truncate w-full`}
                    onClick={handleBoardNameClick}
                    data-testid="board-name"
                    title={board.name ?? 'Unnamed Board'}
                  >
                    {board.name ?? 'Unnamed Board'}
                  </h1>
                )}
              </div>

              {/* Hamburger menu button - only on mobile */}
              <button
                className="text-gray-700 hover:text-gray-900 p-2 rounded-full md:hidden cursor-pointer active:bg-gray-100 transition-colors duration-300 touch-feedback"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="Toggle menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            </div>

            {/* Mobile Timer Controls - moved under the title and hamburger */}
            {isMobile && (
              <div
                className="flex items-center justify-center mt-2 border-t border-gray-200 pt-3 pb-1 timer-controls"
                data-testid="mobile-timer-controls"
              >
                <div className="inline-flex items-center">
                  {/* Conditional Rendering: Input vs Clickable Span */}
                  {board?.timerIsRunning ? (
                    <span
                      className="text-gray-700 font-medium text-lg w-20 text-right pr-2"
                      title="Remaining time"
                    >
                      {formatTime(remainingTime)}
                    </span>
                  ) : isEditingTimer ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editableTimeStr}
                      onChange={handleTimeInputChange}
                      onKeyDown={handleTimeInputKeyDown}
                      onBlur={handleTimeInputBlur}
                      autoFocus
                      className="text-gray-700 font-medium w-20 text-right pr-2 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-lg"
                      title="Edit time (MM:SS)"
                      data-testid="mobile-timer-input"
                    />
                  ) : (
                    <span
                      className="text-gray-700 font-medium text-lg w-20 text-right pr-2 cursor-pointer hover:text-blue-500"
                      title="Click to edit time"
                      onClick={handleTimerClick}
                    >
                      {formatTime(remainingTime)}
                    </span>
                  )}

                  {/* Play/Pause Button */}
                  <button
                    onClick={handleStartPauseTimer}
                    className={`cursor-pointer p-1 rounded transition-colors duration-300 touch-feedback mx-4 ${
                      board?.timerIsRunning
                        ? 'text-orange-500 hover:text-orange-600 active:text-orange-700 hover:bg-orange-50 active:bg-orange-100'
                        : 'text-blue-500 hover:text-blue-600 active:text-blue-700 hover:bg-blue-50 active:bg-blue-100'
                    }`}
                    aria-label={board?.timerIsRunning ? 'Pause timer' : 'Start timer'}
                    data-testid="mobile-timer-play-pause-button"
                  >
                    {board?.timerIsRunning ? (
                      <Pause className="h-7 w-7" />
                    ) : (
                      <Play className="h-7 w-7" />
                    )}
                  </button>

                  {/* Reset Button */}
                  <button
                    onClick={handleResetTimer}
                    aria-label="Reset timer"
                    disabled={!!board?.timerIsRunning}
                    className={`p-1 rounded transition-colors duration-300 touch-feedback ${
                      board?.timerIsRunning
                        ? 'text-gray-400 opacity-50 cursor-not-allowed'
                        : 'text-gray-600 hover:text-gray-800 active:text-gray-900 hover:bg-gray-50 active:bg-gray-100 cursor-pointer'
                    }`}
                    data-testid="mobile-timer-reset-button"
                  >
                    <RotateCcw className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Mobile Menu Panel - shown when hamburger is clicked */}
            {isMobileMenuOpen && (
              <div className="fixed inset-0 bg-white z-50 md:hidden flex flex-col">
                <div className="border-b border-gray-200 flex justify-between items-center px-3 py-3">
                  <h2 className="text-lg font-semibold text-gray-800">Menu</h2>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-gray-500 hover:text-gray-700 active:text-gray-900 cursor-pointer p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors duration-300 touch-feedback"
                    aria-label="Close menu"
                  >
                    <X className="h-6 w-6 md:h-5 md:w-5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex flex-col space-y-5">
                    <button
                      className="flex items-center py-4 px-3 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors active:bg-gray-100 duration-300 touch-feedback"
                      onClick={() => {
                        toggleParticipantsPanel();
                        setIsMobileMenuOpen(false); // Close menu when opening panel
                      }}
                    >
                      <div className="bg-blue-50 p-3 rounded-full">
                        <Users className="h-6 w-6 text-blue-500" />
                      </div>
                      <span className="ml-4 text-lg">Participants</span>
                      {participants.length > 0 && (
                        <span className="ml-auto bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded-full">
                          {participants.length}
                        </span>
                      )}
                    </button>

                    <button
                      className="flex items-center py-4 px-3 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors active:bg-gray-100 duration-300 touch-feedback"
                      onClick={() => {
                        toggleActionPointsPanel();
                        setIsMobileMenuOpen(false); // Close menu when opening panel
                      }}
                    >
                      <div className="bg-green-50 p-3 rounded-full">
                        <TrendingUp className="h-6 w-6 text-green-500" />
                      </div>
                      <span className="ml-4 text-lg">Action Points</span>
                      {actionPoints.length > 0 && (
                        <span className="ml-auto bg-green-100 text-green-800 text-sm font-medium px-2.5 py-0.5 rounded-full">
                          {actionPoints.length}
                        </span>
                      )}
                    </button>

                    <button
                      className="flex items-center py-4 px-3 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors active:bg-gray-100 duration-300 touch-feedback"
                      onClick={() => {
                        handleExportClick();
                        setIsMobileMenuOpen(false); // Close menu when opening modal
                      }}
                    >
                      <div className="bg-purple-50 p-3 rounded-full">
                        <Download className="h-6 w-6 text-purple-500" />
                      </div>
                      <span className="ml-4 text-lg">Export</span>
                    </button>

                    <button
                      className="flex items-center py-4 px-3 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors active:bg-gray-100 duration-300 touch-feedback"
                      onClick={() => {
                        handleShareClick();
                        setIsMobileMenuOpen(false); // Close menu when opening modal
                      }}
                    >
                      <div className="bg-indigo-50 p-3 rounded-full">
                        <Share2 className="h-6 w-6 text-indigo-500" />
                      </div>
                      <span className="ml-4 text-lg">Share</span>
                    </button>

                    <button
                      className="flex items-center py-4 px-3 hover:bg-gray-50 rounded-xl cursor-pointer transition-colors active:bg-gray-100 duration-300 touch-feedback"
                      onClick={() => {
                        toggleOptionsPanel();
                        setIsMobileMenuOpen(false); // Close menu when opening panel
                      }}
                    >
                      <div className="bg-gray-100 p-3 rounded-full">
                        <Settings className="h-6 w-6 text-gray-500" />
                      </div>
                      <span className="ml-4 text-lg">Options</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Export Modal */}
          <ExportModal
            isOpen={isExportModalOpen}
            onClose={() => setIsExportModalOpen(false)}
            board={board}
            cards={cards}
          />

          {/* Share Modal */}
          <ShareModal
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            boardId={boardId ?? ''}
          />

          {/* Use the participants panel */}
          <ParticipantsPanel
            isOpen={isPanelOpen}
            onClose={() => setIsPanelOpen(false)}
            participants={participants}
            currentUserId={user?.uid ?? ''}
            onUpdateName={handleUpdateParticipantName}
            onUpdateColor={handleUpdateParticipantColor}
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

          {/* Use the options panel */}
          <OptionsPanel
            isOpen={isOptionsPanelOpen}
            onClose={() => setIsOptionsPanelOpen(false)}
            onDeleteBoard={handleDeleteBoard}
            isBoardCreator={user?.uid === board?.facilitatorId}
            showAddColumnPlaceholder={showAddColumnPlaceholder}
            onToggleAddColumnPlaceholder={handleToggleAddColumnPlaceholder}
          />

          <DragDropContext onDragStart={handleDragStart} onDragEnd={wrappedHandleDragEnd}>
            <div className="flex-1 px-2 sm:px-4 md:px-6 py-4 overflow-hidden flex flex-col">
              {/* Responsive columns grid */}
              <div
                ref={columnsContainerRef}
                className={`flex flex-1 gap-3 md:gap-6 overflow-x-auto md:overflow-x-auto overflow-y-hidden touch-pan-x snap-x snap-mandatory ${isDragging ? 'auto-scroll-enabled' : ''}`}
                style={{
                  scrollBehavior: 'smooth',
                }}
                id="columns-container"
              >
                {Object.values(board?.columns ?? {})
                  .sort((a: ColumnType, b: ColumnType) => a.order - b.order)
                  .map((column: ColumnType, index: number, columnsArray: ColumnType[]) => (
                    <div
                      id={`column-${column.id}`}
                      key={column.id}
                      className="border-r border-l border-gray-200 bg-white rounded shadow-sm h-full flex flex-col overflow-hidden scroll-mt-[70px] min-w-full w-full md:min-w-0 md:w-0 flex-shrink-0 snap-start md:flex-grow md:basis-0"
                      data-testid={`column-${column.id}`}
                      data-title={column.title}
                      style={{ scrollMarginTop: '70px' }}
                    >
                      <Column
                        id={column.id}
                        title={column.title}
                        boardId={boardId ?? ''}
                        sortByVotes={columnSortStates[column.id] ?? false}
                        description={column.description}
                        isBoardOwner={board?.facilitatorId === user?.uid}
                        columnIndex={index}
                        totalColumns={columnsArray.length}
                        onSortToggle={async () => {
                          const newSortState = !columnSortStates[column.id];
                          try {
                            await updateColumnSortState(boardId, column.id, newSortState);
                            setColumnSortStates(prev => ({
                              ...prev,
                              [column.id]: newSortState,
                            }));
                          } catch (error) {
                            console.error('Error updating sort state:', error);
                          }
                        }}
                        onTitleUpdate={async newTitle => {
                          try {
                            if (boardId) {
                              await updateColumnTitle(boardId, column.id, newTitle);
                              // No need to update local state - Firestore listener will handle it
                            }
                          } catch (error) {
                            console.error('Error updating column title:', error);
                          }
                        }}
                        onDescriptionUpdate={async newDescription => {
                          try {
                            if (boardId) {
                              await updateColumnDescription(boardId, column.id, newDescription);
                              // No need to update local state - Firestore listener will handle it
                            }
                          } catch (error) {
                            console.error('Error updating column description:', error);
                          }
                        }}
                      >
                        <Droppable droppableId={column.id}>
                          {provided => (
                            <div
                              {...provided.droppableProps}
                              ref={provided.innerRef}
                              className="h-full overflow-y-scroll scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-400"
                            >
                              {cards
                                .filter(card => card.columnId === column.id)
                                .sort((a, b) =>
                                  columnSortStates[column.id]
                                    ? b.votes - a.votes
                                    : a.position - b.position
                                )
                                .map((card, index) => (
                                  <Draggable key={card.id} draggableId={card.id} index={index}>
                                    {provided => (
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

                {/* Add Column Placeholder - only visible to board owner and when showAddColumnPlaceholder is true */}
                {board?.facilitatorId === user?.uid && showAddColumnPlaceholder && (
                  <div
                    id="add-column-placeholder"
                    className="scroll-mt-[70px] min-w-full w-full md:min-w-0 md:w-0 flex-shrink-0 snap-start md:flex-grow md:basis-0"
                    style={{ scrollMarginTop: '70px' }}
                  >
                    <AddColumnPlaceholder
                      boardId={boardId ?? ''}
                      onColumnAdded={() => {
                        // Optional callback when a new column is added
                        // Could refresh data or show notification
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </DragDropContext>
        </>
      )}
    </div>
  );
}
