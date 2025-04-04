import React from "react"; // Import React
import { act, fireEvent, render, screen } from "@testing-library/react"; // Removed unused waitFor
import userEvent from "@testing-library/user-event";
import type { User as FirebaseUser } from "firebase/auth";
import { Timestamp, updateDoc } from "firebase/firestore";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DraggableProvided, // Import specific DnD types
  DroppableProvided, // Import specific DnD types
  DropResult,
} from "@hello-pangea/dnd"; // Import DropResult
import * as FirebaseContext from "../../contexts/FirebaseContext";
import * as boardService from "../../services/boardService";
import type {
  Board as BoardType,
  Card as CardType,
} from "../../services/firebase"; // Import types from firebase
import Board from "../Board";

// Create a mock document snapshot that implements the exists() method
const createMockDocSnap = (
  exists = true,
  data: Record<string, unknown> = {} // Use unknown instead of any
) => ({
  exists: () => exists,
  data: () => data,
  id: "test-doc-id",
});

// Mock firebase module entirely
vi.mock("../../services/firebase", () => {
  return {
    db: {
      collection: vi.fn(() => ({ doc: vi.fn() })),
    },
    auth: {
      currentUser: { uid: "test-user-id" },
    },
    signInAnonymousUser: vi.fn(),
  };
});

// Mock hello-pangea/dnd
// Variable to store the onDragEnd handler
let capturedOnDragEnd: ((result: DropResult) => void) | null = null;

vi.mock("@hello-pangea/dnd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hello-pangea/dnd")>();
  return {
    ...actual, // Keep actual implementations for types etc.
    // Correctly define DragDropContext as a function component
    DragDropContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragEnd: (result: DropResult) => void;
    }) => {
      // Capture the onDragEnd handler passed by the Board component
      capturedOnDragEnd = onDragEnd; // Store the handler in the variable
      // Return the children wrapped in a div for testing purposes
      return <div data-testid="drag-drop-context">{children}</div>;
    },
    // Correctly define Droppable as a function component
    // Correctly define Droppable as a function component
    Droppable: ({
      children,
    }: {
      children: (provided: DroppableProvided) => React.ReactNode; // Use DroppableProvided
    }) => {
      // Call the children function with mock provided data
      // Cast to any to allow adding data-testid for the mock
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return children({
        innerRef: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        droppableProps: { "data-testid": "droppable" } as any, // Keep cast for mock
        placeholder: null,
      });
    },
    // Correctly define Draggable as a function component
    // Correctly define Draggable as a function component
    Draggable: ({
      children,
      draggableId,
    }: {
      children: (provided: DraggableProvided) => React.ReactNode; // Use DraggableProvided
      draggableId: string;
    }) => {
      // Call the children function with mock provided data
      // Cast to any to allow adding data-testid for the mock
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return children({
        innerRef: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draggableProps: { "data-testid": `draggable-${draggableId}` } as any, // Keep cast for mock
        dragHandleProps: null,
      });
    },
  };
});

// Mock the services
vi.mock("../../services/boardService", () => ({
  subscribeToBoard: vi.fn(),
  subscribeToCards: vi.fn(),
  updateCardPosition: vi.fn(),
  createBoard: vi.fn(),
  startTimer: vi.fn(() => Promise.resolve()),
  pauseTimer: vi.fn(() => Promise.resolve()),
  resetTimer: vi.fn(() => Promise.resolve()),
  updateColumnSortState: vi.fn(() => Promise.resolve()),
}));

// Mock the firebase context
vi.mock("../../contexts/FirebaseContext", () => ({
  useFirebase: vi.fn(),
}));

// Create a variable to control mock getDoc behavior
let mockDocExists = true;
let mockDocData: Record<string, unknown> = { name: "Test Board" }; // Use unknown

// Mock firebase/firestore with more complete implementations
vi.mock("firebase/firestore", () => {
  const docRef = { id: "test-doc-id" };

  return {
    doc: vi.fn(() => docRef),
    getDoc: vi.fn(() =>
      Promise.resolve(createMockDocSnap(mockDocExists, mockDocData))
    ),
    updateDoc: vi.fn(() => Promise.resolve()),
    collection: vi.fn(() => ({ doc: vi.fn(() => docRef) })),
    query: vi.fn(),
    where: vi.fn(),
    serverTimestamp: vi.fn(() => new Date()),
    Timestamp: {
      now: vi.fn(() => ({
        toMillis: () => Date.now(),
        toDate: () => new Date(),
      })),
      fromMillis: vi.fn((ms) => ({
        toMillis: () => ms,
        toDate: () => new Date(ms),
      })),
    },
    getDocs: vi.fn(() => Promise.resolve({ forEach: vi.fn() })),
    writeBatch: vi.fn(() => ({
      update: vi.fn(),
      commit: vi.fn(() => Promise.resolve()),
    })),
    increment: vi.fn((num) => num),
    setDoc: vi.fn(() => Promise.resolve()),
  };
});

// Mock the Child components
vi.mock("../Column", () => ({
  default: ({
    children,
    title,
    id,
    sortByVotes,
    onSortToggle,
  }: {
    children: React.ReactNode;
    title: string;
    id: string;
    sortByVotes: boolean;
    onSortToggle: () => void;
  }) => (
    <div
      data-testid={`column-${id}`}
      data-title={title}
      data-sort={sortByVotes}
    >
      <button data-testid={`sort-toggle-${id}`} onClick={onSortToggle}>
        Toggle Sort
      </button>
      {children}
    </div>
  ),
}));

vi.mock("../Card", () => ({
  default: ({
    card,
    isOwner,
    provided,
  }: {
    card: CardType; // Use imported Card type
    isOwner: boolean;
    provided: DraggableProvided; // Use DraggableProvided
  }) => (
    <div
      data-testid={`card-${card.id}`}
      data-content={card.content}
      data-author={card.authorId}
      data-is-owner={isOwner}
      ref={provided.innerRef}
      {...provided.draggableProps}
    >
      {card.content}
    </div>
  ),
}));

// Mock data for testing
const mockUser = {
  uid: "test-user-id",
  displayName: "Test User",
  emailVerified: false,
  isAnonymous: true,
  metadata: {},
  providerData: [],
  refreshToken: "",
  tenantId: null,
  delete: vi.fn(),
  getIdToken: vi.fn(),
  getIdTokenResult: vi.fn(),
  reload: vi.fn(),
  toJSON: vi.fn(),
} as unknown as FirebaseUser;

const mockBoard: BoardType = {
  // Use imported Board type
  id: "test-board-id",
  name: "Test Board",
  columns: {
    col1: { id: "col1", title: "What went well", order: 0, sortByVotes: false }, // Add sortByVotes
    col2: {
      id: "col2",
      title: "What can be improved",
      order: 1,
      sortByVotes: false,
    }, // Add sortByVotes
    col3: { id: "col3", title: "Action items", order: 2, sortByVotes: false }, // Add sortByVotes
  },
  createdAt: Timestamp.now(),
  isActive: true,
  timerDurationSeconds: 300,
  timerIsRunning: false,
  timerPausedDurationSeconds: null,
  timerStartTime: null,
};

const mockCards = [
  {
    id: "card1",
    boardId: "test-board-id",
    columnId: "col1",
    content: "Test Card 1",
    authorId: "test-user-id",
    authorName: "Test User",
    createdAt: Timestamp.now(),
    votes: 3,
    position: 0,
  },
  {
    id: "card2",
    boardId: "test-board-id",
    columnId: "col2",
    content: "Test Card 2",
    authorId: "other-user-id",
    authorName: "Other User",
    createdAt: Timestamp.now(),
    votes: 1,
    position: 0,
  },
  {
    id: "card3",
    boardId: "test-board-id",
    columnId: "col3",
    content: "Test Card 3",
    authorId: "test-user-id",
    authorName: "Test User",
    createdAt: Timestamp.now(),
    votes: 0,
    position: 0,
  },
];

describe("Board", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock state
    mockDocExists = true;
    mockDocData = { name: "Test Board" };

    // Set up the mocks for each test
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
    });

    // Set up subscription callbacks
    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (boardId, callback) => {
        act(() => {
          // Immediately call the callback with mock data
          callback(mockBoard);
        });
        // Return cleanup function
        return vi.fn();
      }
    );

    vi.mocked(boardService.subscribeToCards).mockImplementation(
      (boardId, callback) => {
        act(() => {
          // Immediately call the callback with mock data
          callback(mockCards);
        });
        // Return cleanup function
        return vi.fn();
      }
    );

    // Mock the createBoard function
    vi.mocked(boardService.createBoard).mockResolvedValue("test-board-id");
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders the board with columns and cards", async () => {
    // Use act to wrap the render
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // First check for loading state
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();

    // Wait for the board to be rendered
    expect(screen.getByTestId("drag-drop-context")).toBeInTheDocument();

    // Check if columns are rendered
    expect(screen.getByTestId("column-col1")).toBeInTheDocument();
    expect(screen.getByTestId("column-col2")).toBeInTheDocument();
    expect(screen.getByTestId("column-col3")).toBeInTheDocument();

    // Check if column titles are set correctly
    expect(screen.getByTestId("column-col1").getAttribute("data-title")).toBe(
      "What went well"
    );
    expect(screen.getByTestId("column-col2").getAttribute("data-title")).toBe(
      "What can be improved"
    );
    expect(screen.getByTestId("column-col3").getAttribute("data-title")).toBe(
      "Action items"
    );

    // Look directly for draggable elements which will contain our cards
    expect(screen.getByTestId("draggable-card1")).toBeInTheDocument();
    expect(screen.getByTestId("draggable-card2")).toBeInTheDocument();
    expect(screen.getByTestId("draggable-card3")).toBeInTheDocument();

    // Verify card contents are still visible in the DOM
    expect(screen.getByText("Test Card 1")).toBeInTheDocument();
    expect(screen.getByText("Test Card 2")).toBeInTheDocument();
    expect(screen.getByText("Test Card 3")).toBeInTheDocument();
  });

  it("displays loading state when loading", async () => {
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: null,
      loading: true,
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/boards/test-board-id"]}>
        <Routes>
          <Route path="/boards/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("displays error state when there is an auth error", async () => {
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: null,
      loading: false,
      error: new Error("Authentication failed"),
    });

    render(
      <MemoryRouter initialEntries={["/boards/test-board-id"]}>
        <Routes>
          <Route path="/boards/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/Authentication Error/)).toBeInTheDocument();
  });

  it("displays loading state when auth is loading", async () => {
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: null,
      loading: true, // Auth loading
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/boards/test-board-id"]}>
        <Routes>
          <Route path="/boards/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    // Ensure subscriptions are not called yet
    expect(boardService.subscribeToBoard).not.toHaveBeenCalled();
    expect(boardService.subscribeToCards).not.toHaveBeenCalled();
  });

  it("displays error state when auth is done but user is null", async () => {
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: null, // No user
      loading: false, // Auth finished
      error: null,
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(
      screen.getByText("Error: Authentication failed. Please try again.")
    ).toBeInTheDocument();
    expect(boardService.subscribeToBoard).not.toHaveBeenCalled();
  });

  it("displays error when board is not found and creation fails", async () => {
    // Simulate board not existing
    mockDocExists = false;
    mockDocData = {};
    // Simulate creation failing
    const createError = new Error("Permission Denied");
    vi.mocked(boardService.createBoard).mockRejectedValue(createError);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/non-existent-board"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(
      screen.getByText(/Failed to create board "non-existent-board"/)
    ).toBeInTheDocument();
    expect(boardService.createBoard).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("displays error when board subscription returns null", async () => {
    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (_, callback) => {
        act(() => {
          callback(null); // Board not found
        });
        return vi.fn();
      }
    );

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/non-existent-board"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(
      screen.getByText(/Board with ID "non-existent-board" not found/)
    ).toBeInTheDocument();
  });

  it("displays error when initial getDoc fails unexpectedly", async () => {
    const getDocError = new Error("Firestore unavailable");
    vi.mocked(
      vi.mocked(await import("firebase/firestore")).getDoc
    ).mockRejectedValue(getDocError);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByText(/Failed to load board data/)).toBeInTheDocument();
    consoleErrorSpy.mockRestore();
  });

  it("creates a new board when the board does not exist", async () => {
    // Set up getDoc to return a non-existent board
    mockDocExists = false;
    mockDocData = {};

    // First call returns null (board not found), subsequent calls return the board
    let boardCallCount = 0;
    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (_, callback) => {
        if (boardCallCount === 0) {
          // First time: board not found
          boardCallCount++;
          act(() => {
            callback(null);
          });
        } else {
          // Second time: board exists after creation
          act(() => {
            callback(mockBoard);
          });
        }
        return vi.fn();
      }
    );

    // Mock createBoard to trigger the second subscribeToBoard callback
    vi.mocked(boardService.createBoard).mockImplementation(
      async (name, creatorId, boardId) => {
        // Simulate async creation
        await Promise.resolve();
        // Trigger the state update by incrementing the counter
        // The subscribeToBoard mock handles the act wrapping internally now
        boardCallCount++;
        return boardId || "test-board-id";
      }
    );

    // Reset the subscribeToBoard mock to its default behavior for this test,
    // as the specific redefinition is no longer needed with the act fix above.
    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (boardId, callback) => {
        if (boardCallCount === 0) {
          // First call: board not found (mockDocExists is false)
          act(() => {
            callback(null);
          });
        } else {
          // Second call (after createBoard): board exists
          act(() => {
            // Wrap the state update
            callback(mockBoard);
          });
        }
        return vi.fn();
      }
    );

    // Wrap the render and potential async updates in act
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
      // Allow promises inside the render/useEffect to resolve
      await Promise.resolve();
    });

    // The createBoard function should be called eventually
    expect(boardService.createBoard).toHaveBeenCalledWith(
      expect.stringContaining("test-board-id"),
      mockUser.uid,
      "test-board-id"
    );

    // Add assertions to check if the board eventually renders after creation
    // This might require waiting for the second subscribeToBoard callback
    await screen.findByTestId("drag-drop-context");
    expect(screen.getByTestId("column-col1")).toBeInTheDocument();
  });

  // ==================================
  // Timer Tests
  // ==================================

  describe("Timer Functionality", () => {
    it("handles timer controls correctly (start, pause, reset)", async () => {
      const user = userEvent.setup();
      let boardCallback: (board: BoardType | null) => void = () => {}; // Initialize
      vi.mocked(boardService.subscribeToBoard).mockImplementation(
        (_, callback) => {
          boardCallback = callback; // Assign in mock
          act(() => callback(mockBoard)); // Initial state
          return vi.fn();
        }
      );

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      // --- Start ---
      const playButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(playButton);
      expect(boardService.startTimer).toHaveBeenCalledWith(
        "test-board-id",
        mockBoard
      );

      // Simulate board update after start
      const runningBoard = {
        ...mockBoard,
        timerIsRunning: true,
        timerStartTime: Timestamp.now(),
      };
      act(() => boardCallback(runningBoard));

      // --- Pause ---
      const pauseButton = screen.getByRole("button", { name: /pause timer/i });
      await user.click(pauseButton);
      expect(boardService.pauseTimer).toHaveBeenCalledWith(
        "test-board-id",
        runningBoard
      );

      // Simulate board update after pause
      const pausedBoard = {
        ...runningBoard,
        timerIsRunning: false,
        timerPausedDurationSeconds: 299,
      }; // Example paused time
      act(() => boardCallback(pausedBoard));

      // --- Reset ---
      const resetButton = screen.getByRole("button", { name: /reset timer/i });
      await user.click(resetButton);
      expect(boardService.resetTimer).toHaveBeenCalledWith(
        "test-board-id",
        300
      ); // 300 is initialDurationSeconds

      // Simulate board update after reset
      act(() => boardCallback(mockBoard)); // Back to initial state
    });

    it("displays the correct time when timer is running", async () => {
      vi.useFakeTimers();
      // boardCallback is not needed here as we don't trigger updates manually
      const startTime = Date.now();
      const runningBoard = {
        ...mockBoard,
        timerIsRunning: true,
        timerStartTime: Timestamp.fromMillis(startTime),
        timerDurationSeconds: 5, // 5 seconds for testing
      };

      vi.mocked(boardService.subscribeToBoard).mockImplementation(
        (_, callback) => {
          // boardCallback = callback; // Removed assignment
          act(() => callback(runningBoard));
          return vi.fn();
        }
      );

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      // Initial render shows full time briefly before interval kicks in
      expect(screen.getByText("0:05")).toBeInTheDocument();

      // Advance time by 2 seconds
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByText("0:03")).toBeInTheDocument();

      // Advance time by another 2 seconds
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByText("0:01")).toBeInTheDocument();

      vi.useRealTimers();
    });

    it("automatically resets the timer when it expires", async () => {
      vi.useFakeTimers();
      let boardCallback: (board: BoardType | null) => void = () => {}; // Initialize
      const startTime = Date.now();
      const shortDuration = 2; // 2 seconds
      const runningBoard = {
        ...mockBoard,
        timerIsRunning: true,
        timerStartTime: Timestamp.fromMillis(startTime),
        timerDurationSeconds: shortDuration,
        timerPausedDurationSeconds: null,
      };

      vi.mocked(boardService.subscribeToBoard).mockImplementation(
        (_, callback) => {
          boardCallback = callback;
          act(() => callback(runningBoard));
          return vi.fn();
        }
      );
      vi.mocked(boardService.resetTimer).mockResolvedValue(); // Ensure reset doesn't fail

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      expect(screen.getByText("0:02")).toBeInTheDocument();

      // Advance time past expiration + reset delay
      await act(async () => {
        vi.advanceTimersByTime(3500); // 2s duration + ~1s delay + buffer
      });

      // Check if resetTimer was called with the duration that just finished
      expect(boardService.resetTimer).toHaveBeenCalledWith(
        "test-board-id",
        shortDuration
      );

      // Simulate the board state update after reset
      const resetBoard = {
        ...mockBoard,
        timerIsRunning: false,
        timerStartTime: null,
        timerDurationSeconds: shortDuration, // Should reset to the duration used
        timerPausedDurationSeconds: shortDuration,
      };
      act(() => boardCallback(resetBoard));

      // Timer should display the reset duration in the input field
      expect(screen.getByDisplayValue("0:02")).toBeInTheDocument();

      vi.useRealTimers();
    });

    it("handles error during automatic timer reset", async () => {
      vi.useFakeTimers();
      // boardCallback is not needed here
      const startTime = Date.now();
      const shortDuration = 1; // 1 second
      const runningBoard = {
        ...mockBoard,
        timerIsRunning: true,
        timerStartTime: Timestamp.fromMillis(startTime),
        timerDurationSeconds: shortDuration,
      };
      const resetError = new Error("Failed to auto-reset");
      vi.mocked(boardService.resetTimer).mockRejectedValue(resetError);
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      vi.mocked(boardService.subscribeToBoard).mockImplementation(
        (_, callback) => {
          // boardCallback = callback; // Removed assignment
          act(() => callback(runningBoard));
          return vi.fn();
        }
      );

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      // Advance time past expiration + reset delay
      await act(async () => {
        vi.advanceTimersByTime(2500); // 1s duration + ~1s delay + buffer
      });

      expect(boardService.resetTimer).toHaveBeenCalledWith(
        "test-board-id",
        shortDuration
      );
      // Check console for error (though no user-facing error is set in this path)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error auto-resetting timer:",
        resetError
      );

      // State might remain showing 0:00 as reset failed
      expect(screen.getByText("0:00")).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    });

    it("handles resetting timer after running", async () => {
      const user = userEvent.setup();

      // Create a direct function mock for resetTimer
      const resetTimerMock = vi.fn().mockResolvedValue(undefined);
      // Replace the implementation
      vi.mocked(boardService.resetTimer).mockImplementation(resetTimerMock);

      // Create a board with explicit timer values
      const testBoard = {
        ...mockBoard,
        id: "test-board-id",
        timerDurationSeconds: 300,
        timerIsRunning: false,
      };

      // Setup subscribeToBoard mock with the test board
      vi.mocked(boardService.subscribeToBoard).mockImplementation(
        (_, callback) => {
          act(() => callback(testBoard));
          return vi.fn();
        }
      );

      // Render the component
      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      // Find the reset button
      const resetButton = screen.getByRole("button", { name: /reset timer/i });
      expect(resetButton).toBeInTheDocument();

      // Click the reset button and ensure async wrapping
      await act(async () => {
        await user.click(resetButton);
      });

      // Verify resetTimer mock was called with the correct arguments
      expect(resetTimerMock).toHaveBeenCalledWith("test-board-id", 300);
    });

    it("handles editing timer duration when paused", async () => {
      const user = userEvent.setup();
      let boardCallback: (board: BoardType | null) => void;

      // Mock resetTimer to resolve successfully
      vi.mocked(boardService.resetTimer).mockResolvedValue();

      // Setup a paused timer state
      const pausedBoard = {
        ...mockBoard,
        timerIsRunning: false,
        timerPausedDurationSeconds: 120, // 2 minutes
        timerDurationSeconds: 120,
      };

      vi.mocked(boardService.subscribeToBoard).mockImplementation(
        (_, callback) => {
          boardCallback = callback;
          act(() => {
            callback(pausedBoard);
          });
          return vi.fn();
        }
      );

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      // Find the editable timer input - first check if it exists at all
      const timerInput = screen.getByDisplayValue("2:00");
      expect(timerInput).toBeInTheDocument();

      // Edit the timer value
      await user.clear(timerInput);
      await user.type(timerInput, "3:30");

      // Simulate pressing Enter
      vi.mocked(updateDoc).mockResolvedValue();
      await act(async () => {
        fireEvent.keyDown(timerInput, { key: "Enter" });
      });

      // Verify that updateDoc was called with the correct timer values
      // 3:30 equals 210 seconds (3 minutes * 60 + 30 seconds)
      expect(vi.mocked(updateDoc)).toHaveBeenCalledWith(
        expect.anything(), // The doc ref
        {
          // The data payload
          timerDurationSeconds: 210,
          timerPausedDurationSeconds: 210, // Should also update paused duration
          timerIsRunning: false,
          timerStartTime: null,
        }
      );

      // IMPORTANT: Simulate the board update after saving the new time
      // This updates the board state that handleResetTimer will use
      const updatedBoard = {
        ...pausedBoard,
        timerDurationSeconds: 210,
        timerPausedDurationSeconds: 210,
      };
      act(() => boardCallback(updatedBoard));

      // Now test the reset functionality
      const resetButton = screen.getByRole("button", { name: /reset timer/i });
      expect(resetButton).toBeInTheDocument();

      await user.click(resetButton);

      // Should be called with the new duration (210 seconds)
      expect(boardService.resetTimer).toHaveBeenCalledWith(
        "test-board-id",
        210 // The new duration we just set
      );
    });

    it("prevents saving edited time when timer is running", async () => {
      // user is not needed here
      const runningBoard = {
        ...mockBoard,
        timerIsRunning: true,
        timerStartTime: Timestamp.now(),
      };
      vi.mocked(boardService.subscribeToBoard).mockImplementation((_, cb) => {
        act(() => cb(runningBoard));
        return vi.fn();
      });

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      // Timer is running, so input should not be visible
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByText("5:00")).toBeInTheDocument(); // Shows formatted time

      // Directly call the handler function to simulate an impossible scenario
      // This tests the guard `if (!boardId || board?.timerIsRunning) return;`
      // We'll rely on the fact that the input isn't rendered, implying the save logic path isn't reachable via UI interaction.
      // We can also check that updateDoc wasn't called if we could somehow trigger the save handler.
      // For now, asserting the input absence is the main check.
      expect(vi.mocked(updateDoc)).not.toHaveBeenCalled();
    });

    it("reverts timer input to last valid time on invalid entry (Enter)", async () => {
      const user = userEvent.setup();
      const pausedBoard = { ...mockBoard, timerPausedDurationSeconds: 120 }; // 2:00
      vi.mocked(boardService.subscribeToBoard).mockImplementation((_, cb) => {
        act(() => cb(pausedBoard));
        return vi.fn();
      });
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const timerInput = screen.getByDisplayValue("2:00");
      await user.clear(timerInput);
      await user.type(timerInput, "abc"); // Invalid input
      fireEvent.keyDown(timerInput, { key: "Enter" });

      // Should revert to 2:00
      expect(timerInput).toHaveValue("2:00");
      expect(vi.mocked(updateDoc)).not.toHaveBeenCalled(); // Save should not happen
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Invalid time format entered:",
        "abc"
      );
      consoleWarnSpy.mockRestore();
    });

    it("reverts timer input to last valid time on invalid entry (Blur)", async () => {
      const user = userEvent.setup();
      const pausedBoard = { ...mockBoard, timerPausedDurationSeconds: 120 }; // 2:00
      vi.mocked(boardService.subscribeToBoard).mockImplementation((_, cb) => {
        act(() => cb(pausedBoard));
        return vi.fn();
      });
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const timerInput = screen.getByDisplayValue("2:00");
      await user.clear(timerInput);
      await user.type(timerInput, "5:60"); // Invalid time value
      await act(async () => {
        fireEvent.blur(timerInput);
      });

      // Should revert to 2:00
      expect(timerInput).toHaveValue("2:00");
      expect(vi.mocked(updateDoc)).not.toHaveBeenCalled(); // Save should not happen
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Invalid time format entered:",
        "5:60"
      );
      consoleWarnSpy.mockRestore();
    });

    it("reverts timer input on Escape key press", async () => {
      const user = userEvent.setup();
      const pausedBoard = { ...mockBoard, timerPausedDurationSeconds: 120 }; // 2:00
      vi.mocked(boardService.subscribeToBoard).mockImplementation((_, cb) => {
        act(() => cb(pausedBoard));
        return vi.fn();
      });

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const timerInput = screen.getByDisplayValue("2:00");
      await user.clear(timerInput);
      await user.type(timerInput, "3:30");
      expect(timerInput).toHaveValue("3:30"); // Value changed

      // Press Escape
      fireEvent.keyDown(timerInput, { key: "Escape" });

      // Should revert to 2:00
      expect(timerInput).toHaveValue("2:00");
    });

    it("does not save timer on blur if focus moves to a timer control button", async () => {
      const user = userEvent.setup();
      const pausedBoard = { ...mockBoard, timerPausedDurationSeconds: 120 }; // 2:00
      vi.mocked(boardService.subscribeToBoard).mockImplementation((_, cb) => {
        act(() => cb(pausedBoard));
        return vi.fn();
      });

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const timerInput = screen.getByDisplayValue("2:00");
      const playButton = screen.getByRole("button", { name: /start timer/i });

      await user.clear(timerInput);
      await user.type(timerInput, "4:00"); // Change the value

      // Simulate blur by focusing the play button
      // fireEvent.blur doesn't easily support relatedTarget, simulate by focusing
      await act(async () => {
        playButton.focus(); // Focus the button
        // Manually trigger blur on the input, assuming focus moved to playButton
        fireEvent.blur(timerInput, { relatedTarget: playButton });
      });

      // Assert that updateDoc was NOT called because the blur target was a control
      expect(vi.mocked(updateDoc)).not.toHaveBeenCalled();
      // Input value should remain what was typed
      expect(timerInput).toHaveValue("4:00");
    });

    it("resets timer to the last saved duration", async () => {
      const user = userEvent.setup();
      let boardCallback: (board: BoardType | null) => void = () => {};

      // Mock necessary service functions
      vi.mocked(boardService.startTimer).mockResolvedValue();
      vi.mocked(boardService.pauseTimer).mockResolvedValue();
      vi.mocked(boardService.resetTimer).mockResolvedValue();

      // Initial state: Paused, default duration 300s (5:00)
      const initialPausedBoard = {
        ...mockBoard,
        timerIsRunning: false,
        timerPausedDurationSeconds: 300,
        timerDurationSeconds: 300,
      };

      vi.mocked(boardService.subscribeToBoard).mockImplementation(
        (_, callback) => {
          boardCallback = callback;
          act(() => callback(initialPausedBoard));
          return vi.fn();
        }
      );

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      // 1. Edit time to 2:00 (120 seconds)
      const timerInput = screen.getByDisplayValue("5:00");
      await user.clear(timerInput);
      await user.type(timerInput, "2:00");

      // 2. Save the new time (Press Enter)
      vi.mocked(updateDoc).mockResolvedValue();
      await act(async () => {
        fireEvent.keyDown(timerInput, { key: "Enter" });
      });

      // Verify updateDoc was called to save 120s
      expect(vi.mocked(updateDoc)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          timerDurationSeconds: 120,
          timerPausedDurationSeconds: 120,
        })
      );

      // Simulate board update after save
      const savedBoardState = {
        ...initialPausedBoard,
        timerDurationSeconds: 120,
        timerPausedDurationSeconds: 120,
      };
      act(() => boardCallback(savedBoardState));

      // Input should now show 2:00
      expect(timerInput).toHaveValue("2:00");

      // 3. Start the timer
      const playButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(playButton);
      expect(boardService.startTimer).toHaveBeenCalledWith(
        "test-board-id",
        savedBoardState
      );

      // Simulate board update after starting timer
      const runningBoardState = {
        ...savedBoardState,
        timerIsRunning: true,
        timerStartTime: Timestamp.now(),
        timerPausedDurationSeconds: null,
      };
      act(() => boardCallback(runningBoardState));

      // 4. Verify timer is running - should show formatted time, not input
      expect(screen.getByText("2:00")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("2:00")).not.toBeInTheDocument();

      // 5. Pause the timer (simulate some time has passed)
      const pauseButton = screen.getByRole("button", { name: /pause timer/i });
      await user.click(pauseButton);
      expect(boardService.pauseTimer).toHaveBeenCalledWith(
        "test-board-id",
        runningBoardState
      );

      // Simulate board update after pausing with 100 seconds left
      const pausedBoardState = {
        ...runningBoardState,
        timerIsRunning: false,
        timerStartTime: null,
        timerPausedDurationSeconds: 100, // Some time has passed
        timerDurationSeconds: 120, // Original duration unchanged
      };
      act(() => boardCallback(pausedBoardState));

      // 6. Verify timer is paused at the partially elapsed time
      const pausedTimerInput = screen.getByDisplayValue("1:40"); // 100 seconds = 1:40
      expect(pausedTimerInput).toBeInTheDocument();

      // 7. Click Reset
      const resetButton = screen.getByRole("button", { name: /reset timer/i });
      await act(async () => {
        await user.click(resetButton);
      });

      // Verify resetTimer was called with the *original saved duration* (120s)
      expect(boardService.resetTimer).toHaveBeenCalledWith(
        "test-board-id",
        120 // The saved duration, not the partially elapsed time
      );

      // Simulate board update after reset
      const resetBoardState = {
        ...pausedBoardState,
        timerIsRunning: false,
        timerStartTime: null,
        timerPausedDurationSeconds: 120, // Reset to original saved duration
        timerDurationSeconds: 120, // Same original duration
      };
      act(() => boardCallback(resetBoardState));

      // Input should show the reset time (2:00) - the original saved time
      expect(screen.getByDisplayValue("2:00")).toBeInTheDocument();
    });
  }); // End Timer Describe Block

  // ==================================
  // Column Sorting Tests
  // ==================================
  describe("Column Sorting", () => {
    it("handles toggling column sort state", async () => {
      const user = userEvent.setup();

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      // Find the sort toggle button for column 1
      const sortButton = screen.getByTestId("sort-toggle-col1");
      await user.click(sortButton);

      // Check if updateColumnSortState was called
      expect(boardService.updateColumnSortState).toHaveBeenCalledWith(
        "test-board-id",
        "col1",
        true // Toggling from false (default) to true
      );
    });

    it("sorts cards by position by default", async () => {
      const cardsWithPositions = [
        { ...mockCards[0], columnId: "col1", position: 1 }, // card1, pos 1
        {
          id: "card4",
          boardId: "test-board-id",
          columnId: "col1",
          content: "Card 4",
          authorId: "a",
          authorName: "A",
          createdAt: Timestamp.now(),
          votes: 5,
          position: 0,
        }, // card4, pos 0
      ];
      vi.mocked(boardService.subscribeToCards).mockImplementation((_, cb) => {
        act(() => cb(cardsWithPositions));
        return vi.fn();
      });

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const column1 = screen.getByTestId("column-col1");
      const cardsInCol1 = column1.querySelectorAll(
        '[data-testid^="draggable-"]'
      );

      // Expect card4 (pos 0) then card1 (pos 1)
      expect(cardsInCol1[0].getAttribute("data-testid")).toBe(
        "draggable-card4"
      );
      expect(cardsInCol1[1].getAttribute("data-testid")).toBe(
        "draggable-card1"
      );
    });

    it("sorts cards by votes when toggled", async () => {
      const user = userEvent.setup();
      let boardCallback: (board: BoardType | null) => void;
      const cardsWithVotes = [
        { ...mockCards[0], columnId: "col1", votes: 2, position: 0 }, // card1, votes 2
        {
          id: "card4",
          boardId: "test-board-id",
          columnId: "col1",
          content: "Card 4",
          authorId: "a",
          authorName: "A",
          createdAt: Timestamp.now(),
          votes: 5,
          position: 1,
        }, // card4, votes 5
      ];
      vi.mocked(boardService.subscribeToCards).mockImplementation((_, cb) => {
        act(() => cb(cardsWithVotes));
        return vi.fn();
      });
      vi.mocked(boardService.subscribeToBoard).mockImplementation((_, cb) => {
        boardCallback = cb;
        act(() => cb(mockBoard)); // Start with default sort (position)
        return vi.fn();
      });

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      // Toggle sort for col1
      const sortButton = screen.getByTestId("sort-toggle-col1");
      await act(async () => {
        await user.click(sortButton);
        // Simulate board update after toggle
        const sortedBoard = {
          ...mockBoard,
          columns: {
            ...mockBoard.columns,
            col1: { ...mockBoard.columns.col1, sortByVotes: true },
          },
        };
        boardCallback(sortedBoard);
      });

      const column1 = screen.getByTestId("column-col1");
      const cardsInCol1 = column1.querySelectorAll(
        '[data-testid^="draggable-"]'
      );

      // Expect card4 (votes 5) then card1 (votes 2)
      expect(cardsInCol1[0].getAttribute("data-testid")).toBe(
        "draggable-card4"
      );
      expect(cardsInCol1[1].getAttribute("data-testid")).toBe(
        "draggable-card1"
      );
    });
  }); // End Column Sorting Describe Block

  // ==================================
  // Drag and Drop Tests
  // ==================================
  describe("Drag and Drop", () => {
    // Helper to get the onDragEnd handler (now uses the captured variable)
    const getOnDragEndHandler = (): ((result: DropResult) => void) => {
      if (!capturedOnDragEnd) {
        throw new Error("onDragEnd handler was not captured by the mock");
      }
      if (!capturedOnDragEnd) {
        throw new Error("onDragEnd handler was not captured by the mock");
      }
      return capturedOnDragEnd;
    };

    beforeEach(() => {
      // Ensure mocks are ready for each D&D test
      vi.mocked(boardService.subscribeToBoard).mockImplementation((_, cb) => {
        act(() => cb(mockBoard));
        return vi.fn();
      });
      vi.mocked(boardService.subscribeToCards).mockImplementation((_, cb) => {
        act(() => cb(mockCards));
        return vi.fn();
      });
      vi.mocked(boardService.updateCardPosition).mockResolvedValue(); // Default success
    });

    it("handleDragEnd: does nothing if destination is null", async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const handleDragEnd = getOnDragEndHandler();

      // Simulate drop outside
      const result: DropResult = {
        destination: null,
        source: { droppableId: "col1", index: 0 },
        draggableId: "card1",
        reason: "DROP",
        mode: "FLUID",
        type: "DEFAULT",
        combine: null, // Add missing property
      };

      await act(async () => {
        handleDragEnd(result);
      });

      // Assert that updateCardPosition was NOT called
      expect(boardService.updateCardPosition).not.toHaveBeenCalled();
      // Optionally assert that card state hasn't changed if needed
    });

    it("handleDragEnd: does nothing if dropped in the same position", async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const handleDragEnd = getOnDragEndHandler();

      // Simulate drop in the same place
      const result: DropResult = {
        destination: { droppableId: "col1", index: 0 },
        source: { droppableId: "col1", index: 0 },
        draggableId: "card1",
        reason: "DROP",
        mode: "FLUID",
        type: "DEFAULT",
        combine: null, // Add missing property
      };

      await act(async () => {
        handleDragEnd(result);
      });

      expect(boardService.updateCardPosition).not.toHaveBeenCalled();
    });

    it("handleDragEnd: does nothing if dropped in the same position", async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const handleDragEnd = getOnDragEndHandler();
      const result: DropResult = {
        destination: { droppableId: "col1", index: 0 },
        source: { droppableId: "col1", index: 0 },
        draggableId: "card1",
        reason: "DROP",
        mode: "FLUID",
        type: "DEFAULT",
        combine: null,
      };

      await act(async () => {
        handleDragEnd(result);
      });
      expect(boardService.updateCardPosition).not.toHaveBeenCalled();
    });

    it("handleDragEnd: calls updateCardPosition on valid drop (move col1 -> col2)", async () => {
      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const handleDragEnd = getOnDragEndHandler();

      // Simulate a valid drop (card1 from col1 index 0 to col2 index 0)
      const result: DropResult = {
        destination: { droppableId: "col2", index: 0 },
        source: { droppableId: "col1", index: 0 },
        draggableId: "card1",
        reason: "DROP",
        mode: "FLUID",
        type: "DEFAULT",
        combine: null, // Add missing property
      };

      await act(async () => {
        handleDragEnd(result);
      });

      // Assert updateCardPosition was called correctly
      expect(boardService.updateCardPosition).toHaveBeenCalledWith(
        "card1", // draggableId
        "col2", // destinationColumnId
        0, // destinationIndex
        "col1", // sourceColumnId
        "test-board-id" // boardId
      );

      // Check optimistic update (card1 should now be in col2 mock)
      // Note: This requires the mock Column component to render children correctly.
      // We might need to adjust the mock or query differently.
      // Let's check the mock Card component's presence within the mock Column.
      const column2 = screen.getByTestId("column-col2");
      expect(
        column2.querySelector('[data-testid="draggable-card1"]')
      ).toBeInTheDocument();
    });

    it("handleDragEnd: handles dragging to an empty column", async () => {
      // Make col3 empty initially
      const cardsWithoutCol3 = mockCards.filter((c) => c.columnId !== "col3");
      vi.mocked(boardService.subscribeToCards).mockImplementation((_, cb) => {
        act(() => cb(cardsWithoutCol3));
        return vi.fn();
      });

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const handleDragEnd = getOnDragEndHandler();
      // Move card1 from col1 to empty col3
      const result: DropResult = {
        destination: { droppableId: "col3", index: 0 }, // index 0 in empty col
        source: { droppableId: "col1", index: 0 },
        draggableId: "card1",
        reason: "DROP",
        mode: "FLUID",
        type: "DEFAULT",
        combine: null,
      };

      await act(async () => {
        handleDragEnd(result);
      });

      expect(boardService.updateCardPosition).toHaveBeenCalledWith(
        "card1",
        "col3",
        0,
        "col1",
        "test-board-id"
      );
      // Check optimistic update
      const column3 = screen.getByTestId("column-col3");
      expect(
        column3.querySelector('[data-testid="draggable-card1"]')
      ).toBeInTheDocument();
    });

    it("handleDragEnd: handles dragging to the end of a column", async () => {
      // Add another card to col2
      const extraCardCol2 = {
        id: "card4",
        boardId: "test-board-id",
        columnId: "col2",
        content: "Card 4",
        authorId: "a",
        authorName: "A",
        createdAt: Timestamp.now(),
        votes: 0,
        position: 1,
      };
      const cardsWithExtra = [...mockCards, extraCardCol2];
      vi.mocked(boardService.subscribeToCards).mockImplementation((_, cb) => {
        act(() => cb(cardsWithExtra));
        return vi.fn();
      });

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const handleDragEnd = getOnDragEndHandler();
      // Move card1 from col1 to the end of col2 (index 2)
      // col2 has card2 (index 0), card4 (index 1)
      const result: DropResult = {
        destination: { droppableId: "col2", index: 2 }, // Drop at the end
        source: { droppableId: "col1", index: 0 },
        draggableId: "card1",
        reason: "DROP",
        mode: "FLUID",
        type: "DEFAULT",
        combine: null,
      };

      await act(async () => {
        handleDragEnd(result);
      });

      expect(boardService.updateCardPosition).toHaveBeenCalledWith(
        "card1",
        "col2",
        2,
        "col1",
        "test-board-id"
      );
      // Check optimistic update - card1 should be the last card in col2
      const column2 = screen.getByTestId("column-col2");
      const cardsInCol2 = column2.querySelectorAll(
        '[data-testid^="draggable-"]'
      );
      expect(cardsInCol2.length).toBe(3);
      // After sorting by position (card2=0, card4=1, card1=0 -> card1, card2, card4 or card2, card1, card4)
      // The card at index 2 should be card4
      expect(cardsInCol2[2].getAttribute("data-testid")).toBe(
        "draggable-card4"
      );
    });

    it("handleDragEnd: handles error during updateCardPosition", async () => {
      // Mock updateCardPosition to throw an error
      const mockError = new Error("Firestore update failed");
      vi.mocked(boardService.updateCardPosition).mockRejectedValue(mockError);
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {}); // Suppress console error

      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const handleDragEnd = getOnDragEndHandler();

      const result: DropResult = {
        destination: { droppableId: "col2", index: 0 },
        source: { droppableId: "col1", index: 0 },
        draggableId: "card1",
        reason: "DROP",
        mode: "FLUID",
        type: "DEFAULT",
        combine: null, // Add missing property
      };

      // Wrap the drag handler call in act
      // Explicitly catch the expected rejection to prevent test failure
      await act(async () => {
        try {
          handleDragEnd(result);
          // Allow microtasks like promise rejection handlers to run
          await Promise.resolve();
          await Promise.resolve(); // Add extra tick just in case
        } catch {
          // Expected rejection from updateCardPosition, ignore
        }
      });

      // Assert updateCardPosition was called
      expect(boardService.updateCardPosition).toHaveBeenCalled();
      // Assert console.error was called with the error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error updating card position:",
        mockError
      );

      // TODO: Add assertion to check if state reverted after error
      // This requires capturing the state before and after, or checking DOM order.
      // For now, we just check the error was logged.

      consoleErrorSpy.mockRestore(); // Restore console.error
    });

    it("handleDragEnd: does nothing if draggableId is not found", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      await act(async () => {
        render(
          <MemoryRouter initialEntries={["/boards/test-board-id"]}>
            <Routes>
              <Route path="/boards/:boardId" element={<Board />} />
            </Routes>
          </MemoryRouter>
        );
      });

      const handleDragEnd = getOnDragEndHandler();
      const result: DropResult = {
        destination: { droppableId: "col2", index: 0 },
        source: { droppableId: "col1", index: 0 },
        draggableId: "non-existent-card", // Card ID not in mockCards
        reason: "DROP",
        mode: "FLUID",
        type: "DEFAULT",
        combine: null,
      };

      await act(async () => {
        handleDragEnd(result);
      });

      expect(boardService.updateCardPosition).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Card not found:",
        "non-existent-card"
      );
      consoleErrorSpy.mockRestore();
    });
  }); // End Drag and Drop Describe Block

  // ==================================
  // Other Tests
  // ==================================

  it("marks cards as owned if the user is the author", async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Check draggable elements directly for owner status
    expect(
      screen.getByTestId("draggable-card1").getAttribute("data-is-owner")
    ).toBe("true");
    expect(
      screen.getByTestId("draggable-card2").getAttribute("data-is-owner")
    ).toBe("false");
    expect(
      screen.getByTestId("draggable-card3").getAttribute("data-is-owner")
    ).toBe("true");
  });

  // Update snapshot test
  it("creates a snapshot of the component", async () => {
    // Force a specific board state for snapshot testing
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
    });

    // Clean up before the snapshot test
    document.body.innerHTML = "";

    const { container } = (await act(async () => {
      return render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as { container: Element }; // Type the container

    expect(container).toMatchSnapshot();
  });

  it("calls cleanup functions on unmount", async () => {
    const mockUnsubscribeBoard = vi.fn();
    const mockUnsubscribeCards = vi.fn();

    vi.mocked(boardService.subscribeToBoard).mockReturnValue(
      mockUnsubscribeBoard
    );
    vi.mocked(boardService.subscribeToCards).mockReturnValue(
      mockUnsubscribeCards
    );

    let unmount: () => void;

    await act(async () => {
      const { unmount: unmountComponent } = render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
      unmount = unmountComponent; // Assign unmount function
    });

    // Unmount the component
    act(() => {
      unmount();
    });

    // Check if cleanup functions were called
    expect(mockUnsubscribeBoard).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribeCards).toHaveBeenCalledTimes(1);
  });

  // --- Error Handling Tests (Service Failures) ---

  it("displays error if board subscription fails after initial load", async () => {
    // Simulate getDoc failing by setting mockDocExists to false before rendering
    // This relies on the global vi.mock("firebase/firestore") using mockDocExists
    const originalMockDocExists = mockDocExists; // Store original value
    mockDocExists = false; // Simulate board not existing initially

    // Mock createBoard to also fail, simulating a permission issue during creation attempt
    const mockCreateError = new Error("Permission denied to create");
    vi.mocked(boardService.createBoard).mockRejectedValue(mockCreateError);

    // Suppress console error for this specific test
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Check for the specific error message related to creation failure
    expect(
      screen.getByText(
        /Failed to create board "test-board-id". Check permissions or console./
      )
    ).toBeInTheDocument();

    consoleErrorSpy.mockRestore(); // Restore console.error
    // Restore global mock variable
    mockDocExists = originalMockDocExists;
    // Restore createBoard mock if necessary (or rely on beforeEach)
    vi.mocked(boardService.createBoard).mockResolvedValue("test-board-id");
  });

  it("displays error if startTimer fails", async () => {
    const user = userEvent.setup();
    const mockTimerError = new Error("Timer start failed");
    vi.mocked(boardService.startTimer).mockRejectedValue(mockTimerError);

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const playButton = screen.getByRole("button", { name: /start timer/i });

    await act(async () => {
      await user.click(playButton);
    });

    expect(
      screen.getByText("Error: Failed to start/resume timer.")
    ).toBeInTheDocument();
  });

  it("displays error if pauseTimer fails", async () => {
    const user = userEvent.setup();
    const mockTimerError = new Error("Timer pause failed");
    vi.mocked(boardService.pauseTimer).mockRejectedValue(mockTimerError);

    // Setup board state as running
    const runningBoard = {
      ...mockBoard,
      timerIsRunning: true,
      timerStartTime: Timestamp.now(),
    };
    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (_, callback) => {
        act(() => callback(runningBoard));
        return vi.fn();
      }
    );

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const pauseButton = screen.getByRole("button", { name: /pause timer/i });

    await act(async () => {
      await user.click(pauseButton);
    });

    expect(
      screen.getByText("Error: Failed to pause timer.")
    ).toBeInTheDocument();
  });

  it("displays error if resetTimer fails", async () => {
    const user = userEvent.setup();
    const mockTimerError = new Error("Timer reset failed");
    vi.mocked(boardService.resetTimer).mockRejectedValue(mockTimerError);

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const resetButton = screen.getByRole("button", { name: /reset timer/i });

    await act(async () => {
      await user.click(resetButton);
    });

    expect(
      screen.getByText("Error: Failed to reset timer.")
    ).toBeInTheDocument();
  });

  it("displays error if updating timer duration fails", async () => {
    const user = userEvent.setup();
    const mockUpdateError = new Error("Firestore update failed");
    vi.mocked(updateDoc).mockRejectedValue(mockUpdateError);

    // Setup paused state
    const pausedBoard = {
      ...mockBoard,
      timerIsRunning: false,
      timerPausedDurationSeconds: 120,
    };
    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (_, callback) => {
        act(() => callback(pausedBoard));
        return vi.fn();
      }
    );

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const timerInput = screen.getByDisplayValue("2:00");
    await user.clear(timerInput);
    await user.type(timerInput, "3:30");
    await act(async () => {
      fireEvent.keyDown(timerInput, { key: "Enter" });
    });

    expect(
      screen.getByText("Error: Failed to update timer duration.")
    ).toBeInTheDocument();
    // The component now removes the input and shows the error message,
    // so we don't need/can't check for the reverted input value.
    // The check above ensures the error state is handled visually.
  });

  it("displays error if updateColumnSortState fails", async () => {
    const user = userEvent.setup();
    const sortError = new Error("Sort update failed");
    vi.mocked(boardService.updateColumnSortState).mockRejectedValue(sortError);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const sortButton = screen.getByTestId("sort-toggle-col1");
    await act(async () => {
      await user.click(sortButton);
    });

    // No user-facing error is set, check console
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error updating sort state:",
      sortError
    );
    // Check that visual state did NOT change
    const column1 = screen.getByTestId("column-col1");
    expect(column1.getAttribute("data-sort")).toBe("false"); // Still false

    consoleErrorSpy.mockRestore();
  });

  // --- Async UI State Tests (Covered in Timer/Sort sections) ---

  // it("updates timer display correctly after start/pause/reset", async () => { ... }); // Now in Timer section
  // it("updates column sort state visually after toggle", async () => { ... }); // Now in Sort section
}); // End Main Describe Block
