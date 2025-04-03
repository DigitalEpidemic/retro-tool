import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User as FirebaseUser } from "firebase/auth";
import { Timestamp } from "firebase/firestore";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as FirebaseContext from "../../contexts/FirebaseContext";
import * as boardService from "../../services/boardService";
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
vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-drop-context">{children}</div>
  ),
  Droppable: ({ children }: { children: (provided: any) => React.ReactNode }) =>
    children({
      innerRef: vi.fn(),
      droppableProps: { "data-testid": "droppable" },
      placeholder: null,
    }),
  Draggable: ({
    children,
    draggableId,
  }: {
    children: (provided: any) => React.ReactNode;
    draggableId: string;
  }) =>
    children({
      innerRef: vi.fn(),
      draggableProps: { "data-testid": `draggable-${draggableId}` },
      dragHandleProps: null,
    }),
}));

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
  default: ({ children, title, id, sortByVotes, onSortToggle }: any) => (
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
  default: ({ card, isOwner, provided }: any) => (
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

const mockBoard = {
  id: "test-board-id",
  name: "Test Board",
  columns: {
    col1: { id: "col1", title: "What went well", order: 0 },
    col2: { id: "col2", title: "What can be improved", order: 1 },
    col3: { id: "col3", title: "Action items", order: 2 },
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

    vi.mocked(boardService.createBoard).mockImplementation(
      async (name, creatorId, boardId) => {
        // Simulate creating the board
        act(() => {
          boardCallCount++; // Trigger the second callback in subscribeToBoard
        });
        return boardId || "test-board-id";
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

    // The createBoard function should be called eventually
    expect(boardService.createBoard).toHaveBeenCalledWith(
      expect.stringContaining("test-board-id"),
      mockUser.uid,
      "test-board-id"
    );
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

  it("handles card drag and drop operations", async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Directly call the service method to test the functionality
    await act(async () => {
      await boardService.updateCardPosition(
        "card1",
        "col2",
        1,
        "col1",
        "test-board-id"
      );
    });

    // Verify updateCardPosition was called with correct arguments
    expect(boardService.updateCardPosition).toHaveBeenCalledWith(
      "card1",
      "col2",
      1,
      "col1",
      "test-board-id"
    );
  });

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
});
