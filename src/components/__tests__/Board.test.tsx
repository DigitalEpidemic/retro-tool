import React from "react"; // Import React
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User as FirebaseUser } from "firebase/auth";
import { Timestamp, updateDoc } from "firebase/firestore";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DropResult } from "@hello-pangea/dnd"; // Import DropResult
import * as FirebaseContext from "../../contexts/FirebaseContext";
import * as boardService from "../../services/boardService";
import type {
  Board as BoardType,
  Card as CardType,
} from "../../services/firebase"; // Import types from firebase
import Board from "../Board";

// Create a mock document snapshot that implements the exists() method
const createMockDocSnap = (exists = true, data: Record<string, any> = {}) => ({
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
      children: (provided: any) => React.ReactNode; // Keep 'any' for mock simplicity
    }) => {
      // Call the children function with mock provided data
      return children({
        innerRef: vi.fn(),
        droppableProps: { "data-testid": "droppable" },
        placeholder: null,
      });
    },
    // Correctly define Draggable as a function component
    // Correctly define Draggable as a function component
    Draggable: ({
      children,
      draggableId,
    }: {
      children: (provided: any) => React.ReactNode; // Keep 'any' for mock simplicity
      draggableId: string;
    }) => {
      // Call the children function with mock provided data
      return children({
        innerRef: vi.fn(),
        draggableProps: { "data-testid": `draggable-${draggableId}` },
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
let mockDocData: Record<string, any> = { name: "Test Board" };

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
    provided: any; // Keep any for mock simplicity
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

  it("displays error when board is not found", async () => {
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

    expect(screen.getByText(/Error/)).toBeInTheDocument();
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

  it("handles timer controls correctly", async () => {
    const user = userEvent.setup();

    // First render
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Check for the drag-drop-context
    expect(screen.getAllByTestId("drag-drop-context")[0]).toBeInTheDocument();

    // Find the Play button by finding all SVG icons and selecting the play one
    const playButtonSVG = screen.getByText((_, element) => {
      return (
        element?.tagName.toLowerCase() === "svg" &&
        element?.classList.contains("lucide-play")
      );
    });

    const playButton = playButtonSVG.closest("button");
    expect(playButton).toBeInTheDocument();

    // Click the play button
    if (playButton) {
      await user.click(playButton);
      expect(boardService.startTimer).toHaveBeenCalledWith(
        "test-board-id",
        mockBoard
      );
    }

    // Update mock to simulate running timer
    const runningBoard = {
      ...mockBoard,
      timerIsRunning: true,
      timerStartTime: Timestamp.now(),
    };

    // Clean up and re-setup for the second render
    document.body.innerHTML = "";

    // Update the board to simulate timer started
    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (_, callback) => {
        act(() => {
          callback(runningBoard);
        });
        return vi.fn();
      }
    );

    // Rerender to get updated state
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Find the reset button by icon class
    const resetButtonSVG = screen.getByText((_, element) => {
      return (
        element?.tagName.toLowerCase() === "svg" &&
        element?.classList.contains("lucide-rotate-ccw")
      );
    });

    const resetButton = resetButtonSVG.closest("button");
    expect(resetButton).toBeInTheDocument();

    if (resetButton) {
      await user.click(resetButton);
      expect(boardService.resetTimer).toHaveBeenCalledWith(
        "test-board-id",
        300
      );
    }
  });

  it("handles editing timer duration when paused", async () => {
    const user = userEvent.setup();

    // Setup a paused timer state
    const pausedBoard = {
      ...mockBoard,
      timerIsRunning: false,
      timerPausedDurationSeconds: 120, // 2 minutes
    };

    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (_, callback) => {
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
    fireEvent.keyDown(timerInput, { key: "Enter" });

    // Verify that updateDoc was called with the correct timer values
    // 3:30 equals 210 seconds (3 minutes * 60 + 30 seconds)
    expect(vi.mocked(updateDoc)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        timerDurationSeconds: 210,
        timerPausedDurationSeconds: 210,
        timerIsRunning: false,
        timerStartTime: null,
      })
    );
  });

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
      true
    );
  });

  // --- Drag and Drop Tests ---

  // Helper to get the onDragEnd handler (now uses the captured variable)
  const getOnDragEndHandler = (): ((result: DropResult) => void) => {
    if (!capturedOnDragEnd) {
      throw new Error("onDragEnd handler was not captured by the mock");
    }
    return capturedOnDragEnd;
  };

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

  it("handleDragEnd: calls updateCardPosition on valid drop", async () => {
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

    consoleErrorSpy.mockRestore(); // Restore console.error
  });

  // --- End Drag and Drop Tests ---

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
    })) as any;

    expect(container).toMatchSnapshot();
  });

  // --- Error Handling Tests ---

  it("displays error if initial board subscription fails", async () => {
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

    const playButtonSVG = screen.getByText((_, element) => {
      return (
        element?.tagName.toLowerCase() === "svg" &&
        element?.classList.contains("lucide-play")
      );
    });
    const playButton = playButtonSVG.closest("button");

    await act(async () => {
      if (playButton) await user.click(playButton);
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

    const pauseButtonSVG = screen.getByText((_, element) => {
      return (
        element?.tagName.toLowerCase() === "svg" &&
        element?.classList.contains("lucide-pause")
      );
    });
    const pauseButton = pauseButtonSVG.closest("button");

    await act(async () => {
      if (pauseButton) await user.click(pauseButton);
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

    const resetButtonSVG = screen.getByText((_, element) => {
      return (
        element?.tagName.toLowerCase() === "svg" &&
        element?.classList.contains("lucide-rotate-ccw")
      );
    });
    const resetButton = resetButtonSVG.closest("button");

    await act(async () => {
      if (resetButton) await user.click(resetButton);
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
    // Check that input DID NOT revert, as per current component logic
    expect(timerInput).toHaveValue("3:30");
  });

  // --- Async UI State Tests ---

  it("updates timer display correctly after start/pause/reset", async () => {
    const user = userEvent.setup();
    // Use the full mockBoard type for the callback
    let boardCallback: (board: typeof mockBoard | null) => void;

    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (_, callback) => {
        boardCallback = callback; // Capture the callback
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

    // Initial state (paused/stopped)
    expect(screen.getByDisplayValue("5:00")).toBeInTheDocument(); // Default 300s

    // --- Start Timer ---
    const playButtonSVG = screen.getByText(
      (_, el) =>
        el?.tagName.toLowerCase() === "svg" &&
        el.classList.contains("lucide-play")
    );
    const playButton = playButtonSVG.closest("button");
    await act(async () => {
      if (playButton) await user.click(playButton);
      // Simulate Firestore update after startTimer resolves
      const runningBoard: typeof mockBoard = {
        ...mockBoard,
        timerIsRunning: true,
        timerStartTime: Timestamp.fromMillis(Date.now() - 10000),
        timerPausedDurationSeconds: null,
      };
      boardCallback(runningBoard);
    });

    // Check for running state display (e.g., 4:50)
    // Use findByText or waitFor because the update is async based on interval
    expect(await screen.findByText("4:50")).toBeInTheDocument();

    // --- Pause Timer ---
    const pauseButtonSVG = screen.getByText(
      (_, el) =>
        el?.tagName.toLowerCase() === "svg" &&
        el.classList.contains("lucide-pause")
    );
    const pauseButton = pauseButtonSVG.closest("button");
    await act(async () => {
      if (pauseButton) await user.click(pauseButton);
      // Simulate Firestore update after pauseTimer resolves
      const pausedBoard: typeof mockBoard = {
        ...mockBoard,
        timerIsRunning: false,
        timerPausedDurationSeconds: 290,
        timerStartTime: null,
      };
      boardCallback(pausedBoard);
    });

    // Check for paused state display (editable input)
    expect(screen.getByDisplayValue("4:50")).toBeInTheDocument();

    // --- Reset Timer ---
    const resetButtonSVG = screen.getByText(
      (_, el) =>
        el?.tagName.toLowerCase() === "svg" &&
        el.classList.contains("lucide-rotate-ccw")
    );
    const resetButton = resetButtonSVG.closest("button");
    await act(async () => {
      if (resetButton) await user.click(resetButton);
      // Simulate Firestore update after resetTimer resolves
      // Reset board state should match the initial mockBoard exactly
      boardCallback(mockBoard);
    });

    // Check for reset state display
    expect(screen.getByDisplayValue("5:00")).toBeInTheDocument();
  });

  it("updates column sort state visually after toggle", async () => {
    const user = userEvent.setup();
    let boardCallback: (board: typeof mockBoard | null) => void; // Use full type

    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (_, callback) => {
        boardCallback = callback;
        act(() => callback(mockBoard));
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

    const column1 = screen.getByTestId("column-col1");
    const sortButton = screen.getByTestId("sort-toggle-col1");

    // Initial state: not sorted by votes
    expect(column1.getAttribute("data-sort")).toBe("false");

    await act(async () => {
      await user.click(sortButton);
      // Simulate Firestore update after updateColumnSortState resolves
      const sortedBoard: typeof mockBoard = {
        ...mockBoard,
        columns: {
          ...mockBoard.columns,
          col1: { ...mockBoard.columns.col1, sortByVotes: true }, // Update the specific column
        },
      };
      boardCallback(sortedBoard);
    });

    // Check if the data-sort attribute updated
    expect(column1.getAttribute("data-sort")).toBe("true");
  });
});
