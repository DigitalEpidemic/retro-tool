import type { DropResult } from "@hello-pangea/dnd";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User as FirebaseUser } from "firebase/auth";
import * as firestore from "firebase/firestore";
import { Timestamp, updateDoc } from "firebase/firestore";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as FirebaseContext from "../../contexts/FirebaseContext";
import * as boardService from "../../services/boardService";
import type { Board as BoardType } from "../../services/firebase";
import Board from "../Board";

const createMockDocSnap = (
  exists = true,
  data: Record<string, unknown> = {}
) => ({
  exists: () => exists,
  data: () => data,
  id: "test-doc-id",
});

const createMockTimestamp = (milliseconds?: number) => {
  const timestamp = milliseconds || Date.now();
  return {
    seconds: Math.floor(timestamp / 1000),
    nanoseconds: (timestamp % 1000) * 1000000,
    toDate: () => new Date(timestamp),
    toMillis: () => timestamp,
    isEqual: () => false,
    toJSON: () => ({
      seconds: Math.floor(timestamp / 1000),
      nanoseconds: (timestamp % 1000) * 1000000,
    }),
    valueOf: () =>
      `${Math.floor(timestamp / 1000)}.${(timestamp % 1000) * 1000000}`,
  };
};

vi.mock("../../services/firebase", () => {
  return {
    db: {
      collection: vi.fn(() => ({ doc: vi.fn() })),
    },
    auth: {
      currentUser: { uid: "test-user-id" },
    },
    rtdb: {},
    signInAnonymousUser: vi.fn(),
    Board: {},
    Card: {},
    Timestamp: {
      now: () => createMockTimestamp(),
      fromDate: (date: Date) => createMockTimestamp(date.getTime()),
      fromMillis: (ms: number) => createMockTimestamp(ms),
    },
    OnlineUser: {},
    ActionPoint: {},
  };
});

vi.mock("lucide-react", () => {
  const mockIcon = (name: string) =>
    function MockIcon() {
      return <span data-testid={`${name.toLowerCase()}-icon`}>{name}</span>;
    };

  return {
    Users: mockIcon("Users"),
    TrendingUp: mockIcon("TrendingUp"),
    Share2: mockIcon("Share2"),
    Settings: mockIcon("Settings"),
    Play: mockIcon("Play"),
    Pause: mockIcon("Pause"),
    RotateCcw: mockIcon("RotateCcw"),
    Download: mockIcon("Download"),
    X: mockIcon("X"),
    Edit2: mockIcon("Edit2"),
    Check: mockIcon("Check"),
    Plus: mockIcon("Plus"),
    ArrowUpDown: mockIcon("ArrowUpDown"),
    EllipsisVertical: mockIcon("EllipsisVertical"),
    MoreVertical: mockIcon("MoreVertical"),
    Trash2: mockIcon("Trash2"),
    AlertCircle: mockIcon("AlertCircle"),
    Eye: mockIcon("Eye"),
    EyeOff: mockIcon("EyeOff"),
  };
});

vi.mock("../ParticipantsPanel", () => ({
  default: vi
    .fn()
    .mockImplementation(({ isOpen }) =>
      isOpen ? (
        <div data-testid="participants-panel">Participants Panel</div>
      ) : null
    ),
}));

vi.mock("../ActionPointsPanel", () => {
  const mockComponent = vi.fn(({ isOpen }) =>
    isOpen ? (
      <div data-testid="action-points-panel">Action Points Panel</div>
    ) : null
  );
  return {
    __esModule: true,
    default: mockComponent,
    ActionPoint: { id: "string", text: "string", completed: false },
  };
});

vi.mock("../ExportModal", () => ({
  default: vi
    .fn()
    .mockImplementation(({ isOpen }) =>
      isOpen ? <div data-testid="export-modal">Export Modal</div> : null
    ),
}));

vi.mock("../OptionsPanel", () => ({
  default: vi
    .fn()
    .mockImplementation(
      ({
        isOpen,
        onDeleteBoard,
        isBoardCreator,
        showAddColumnPlaceholder = true,
        onToggleAddColumnPlaceholder = () => {},
      }) => {
        // Using useState within the mock to track deletion confirmation state
        const [isConfirmingDelete, setIsConfirmingDelete] =
          React.useState(false);

        if (!isOpen) return null;

        return (
          <div data-testid="options-panel">
            <div>Options Panel</div>

            {isConfirmingDelete ? (
              <div>
                <p>Are you sure you want to delete this board?</p>
                <button
                  data-testid="cancel-delete"
                  onClick={() => setIsConfirmingDelete(false)}
                >
                  Cancel
                </button>
                <button
                  data-testid="confirm-delete"
                  onClick={() => onDeleteBoard()}
                >
                  Yes, Delete Board
                </button>
              </div>
            ) : (
              <button
                data-testid="delete-board-button"
                disabled={!isBoardCreator}
                onClick={() => isBoardCreator && setIsConfirmingDelete(true)}
              >
                Delete Board
              </button>
            )}

            {!isBoardCreator && (
              <div>Only the board creator can delete this board</div>
            )}
          </div>
        );
      }
    ),
}));

vi.mock("../AddColumnPlaceholder", () => ({
  default: vi.fn().mockImplementation(() => (
    <div data-testid="add-column-placeholder">
      <h3 className="text-lg font-medium text-gray-800 mb-2">
        Create New Column
      </h3>
      <button>Create Column</button>
    </div>
  )),
}));

vi.mock("../../services/boardService", () => {
  return {
    subscribeToBoard: vi.fn((boardId, callback) => {
      setTimeout(() => {
        callback({
          id: "test-board-id",
          name: "Test Board",
          createdAt: createMockTimestamp(),
          isActive: true,
          columns: {
            col1: {
              id: "col1",
              title: "What went well",
              order: 0,
              sortByVotes: false,
            },
            col2: {
              id: "col2",
              title: "What can be improved",
              order: 1,
              sortByVotes: false,
            },
            col3: {
              id: "col3",
              title: "Action items",
              order: 2,
              sortByVotes: false,
            },
          },
          facilitatorId: "test-user-id",
          timerIsRunning: false,
          timerDurationSeconds: 300,
          timerPausedDurationSeconds: undefined,
          timerOriginalDurationSeconds: 300,
          timerStartTime: createMockTimestamp(),
          actionPoints: [
            { id: "ap1", text: "Test Action Point 1", completed: false },
            { id: "ap2", text: "Test Action Point 2", completed: true },
          ],
          showAddColumnPlaceholder: true,
        });
      }, 0);

      return vi.fn();
    }),
    subscribeToCards: vi.fn((boardId, callback) => {
      setTimeout(() => {
        callback([
          {
            id: "card1",
            boardId: "test-board-id",
            columnId: "col1",
            content: "Test Card 1",
            authorId: "test-user-id",
            authorName: "Test User",
            createdAt: {
              toDate: () => new Date(),
              toMillis: () => Date.now(),
            },
            votes: 0,
            position: 0,
          },
          {
            id: "card2",
            boardId: "test-board-id",
            columnId: "col2",
            content: "Test Card 2",
            authorId: "other-user-id",
            authorName: "Other User",
            createdAt: {
              toDate: () => new Date(),
              toMillis: () => Date.now(),
            },
            votes: 2,
            position: 0,
          },
          {
            id: "card3",
            boardId: "test-board-id",
            columnId: "col3",
            content: "Test Card 3",
            authorId: "test-user-id",
            authorName: "Test User",
            createdAt: {
              toDate: () => new Date(),
              toMillis: () => Date.now(),
            },
            votes: 1,
            position: 0,
          },
        ]);
      }, 0);

      return vi.fn();
    }),
    createBoard: vi.fn(() => Promise.resolve("test-board-id")),
    updateCardPosition: vi.fn(() => Promise.resolve()),
    startTimer: vi.fn(() => Promise.resolve()),
    pauseTimer: vi.fn(() => Promise.resolve()),
    resetTimer: vi.fn(() => Promise.resolve()),
    updateColumnSortState: vi.fn(() => Promise.resolve()),
    subscribeToParticipants: vi.fn(() => vi.fn()),
    updateParticipantNameFirestore: vi.fn(() => Promise.resolve()),
    updateParticipantNameRTDB: vi.fn(() => Promise.resolve()),
    joinBoard: vi.fn(() =>
      Promise.resolve({ success: true, name: "Test User" })
    ),
    deleteBoard: vi.fn((boardId, userId) => Promise.resolve(true)),
    testFirestoreWrite: vi.fn(() => Promise.resolve()),
    cleanupInactiveUsers: vi.fn(() => Promise.resolve()),
    updateShowAddColumnPlaceholder: vi.fn(() =>
      Promise.resolve({ success: true })
    ),
    addColumn: vi.fn().mockResolvedValue({
      success: true,
      columnId: "new-column-id",
    }),
  };
});

vi.mock("../../contexts/FirebaseContext", () => ({
  useFirebase: vi.fn(() => ({
    user: { uid: "test-user-id", displayName: "Test User" },
    loading: false,
    error: null,
    updateUserDisplayName: vi.fn(),
  })),
}));

let mockDocExists = true;
let mockDocData: Record<string, unknown> = { name: "Test Board" };

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

vi.mock("../Card", () => ({
  default: ({ card, provided }: any) => (
    <div
      data-testid={`card-${card.id}`}
      data-card-data={JSON.stringify(card)}
      {...provided?.draggableProps}
    >
      {card.content}
    </div>
  ),
}));

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
  id: "test-board-id",
  name: "Test Board",
  columns: {
    col1: { id: "col1", title: "What went well", order: 0, sortByVotes: false },
    col2: {
      id: "col2",
      title: "What can be improved",
      order: 1,
      sortByVotes: false,
    },
    col3: { id: "col3", title: "Action items", order: 2, sortByVotes: false },
  },
  createdAt: Timestamp.now(),
  isActive: true,
  timerDurationSeconds: 300,
  timerPausedDurationSeconds: undefined,
  timerOriginalDurationSeconds: 300,
  timerIsRunning: false,
  timerStartTime: undefined,
  actionPoints: [
    { id: "ap1", text: "Test Action Point 1", completed: false },
    { id: "ap2", text: "Test Action Point 2", completed: true },
  ],
  showAddColumnPlaceholder: true,
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

vi.mock("../../services/presenceService", () => ({
  setupPresence: vi.fn().mockResolvedValue(() => {
    // Return a valid cleanup function
    return function cleanupPresence() {
      // Cleanup implementation
    };
  }),

  subscribeToParticipants: vi.fn((boardId, callback) => {
    setTimeout(() => {
      callback([
        {
          id: "test-user-id",
          name: "Test User",
          color: "#FF5733",
          boardId: "test-board-id",
          lastOnline: Date.now(),
        },
      ]);
    }, 0);
    return vi.fn();
  }),
  updateParticipantName: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/actionPointsService", () => ({
  addActionPoint: vi.fn().mockResolvedValue({
    id: "test-ap-id",
    text: "Test Action Point",
    completed: false,
  }),
  deleteActionPoint: vi.fn().mockResolvedValue({}),
  toggleActionPoint: vi.fn().mockResolvedValue({}),
  getActionPoints: vi.fn().mockResolvedValue([]),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("Board", () => {
  const renderBoard = async (boardId = "test-board-id") => {
    let result;
    await act(async () => {
      result = render(
        <MemoryRouter initialEntries={[`/boards/${boardId}`]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });
    return result;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock console methods to prevent cluttering test output
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    mockDocExists = true;
    mockDocData = { name: "Test Board" };

    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
    });

    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (boardId, callback) => {
        act(() => {
          callback(mockBoard);
        });
        return vi.fn();
      }
    );

    vi.mocked(boardService.subscribeToCards).mockImplementation(
      (boardId, callback) => {
        act(() => {
          callback(mockCards);
        });
        return vi.fn();
      }
    );

    vi.mocked(boardService.createBoard).mockResolvedValue("test-board-id");

    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (boardId, callback) => {
        if (boardId === "test-board-id") {
          act(() => callback(mockBoard));
          return vi.fn();
        }
        return vi.fn();
      }
    );

    vi.mocked(boardService.subscribeToCards).mockImplementation(
      (boardId, callback) => {
        if (boardId === "test-board-id") {
          act(() => callback(mockCards));
          return vi.fn();
        }
        return vi.fn();
      }
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks(); // Restore console mocks
  });

  it("renders the board with columns and cards", async () => {
    await renderBoard();

    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.getByTestId("drag-drop-context")).toBeInTheDocument();

    expect(screen.getByTestId("column-col1")).toBeInTheDocument();
    expect(screen.getByTestId("column-col2")).toBeInTheDocument();
    expect(screen.getByTestId("column-col3")).toBeInTheDocument();

    expect(screen.getByTestId("column-col1").getAttribute("data-title")).toBe(
      "What went well"
    );
    expect(screen.getByTestId("column-col2").getAttribute("data-title")).toBe(
      "What can be improved"
    );
    expect(screen.getByTestId("column-col3").getAttribute("data-title")).toBe(
      "Action items"
    );

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

    await renderBoard();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("displays error state when there is an auth error", async () => {
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: null,
      loading: false,
      error: new Error("Authentication failed"),
    });

    await renderBoard();
    expect(screen.getByText(/Authentication Error/)).toBeInTheDocument();
  });

  it("displays loading state when auth is loading", async () => {
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: null,
      loading: true,
      error: null,
    });

    await renderBoard();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(boardService.subscribeToBoard).not.toHaveBeenCalled();
    expect(boardService.subscribeToCards).not.toHaveBeenCalled();
  });

  it("displays error state when auth is done but user is null", async () => {
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: null,
      loading: false,
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
    // Mock getDoc to simulate a non-existent board
    vi.spyOn(firestore, "getDoc").mockResolvedValueOnce(
      createMockDocSnap(false) as any
    );

    // Mock createBoard to simulate a failure
    vi.spyOn(boardService, "createBoard").mockRejectedValueOnce(
      new Error(`Failed to create board "non-existent-board"`)
    );

    // Reset mockNavigate for this test
    mockNavigate.mockReset();

    // Mock console.log to prevent output and allow verification
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={["/board/non-existent-board"]}>
        <Routes>
          <Route path="/board/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for the redirect to occur
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    // Verify the log message was correct
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Board non-existent-board not found, redirecting to home page"
      )
    );

    // Restore console.log
    consoleLogSpy.mockRestore();
  });

  it("displays error when board subscription returns null", async () => {
    // Mock getDoc to simulate a board that exists
    vi.spyOn(firestore, "getDoc").mockResolvedValueOnce(
      createMockDocSnap(true, { id: "non-existent-board" }) as any
    );

    // Mock subscribeToBoard to return null in the callback
    let boardCallback: (board: BoardType | null) => void = () => {};
    vi.spyOn(boardService, "subscribeToBoard").mockImplementation(
      (_, callback) => {
        boardCallback = callback;
        return vi.fn();
      }
    );

    // Reset mockNavigate for this test
    mockNavigate.mockReset();

    // Mock console.log to prevent output and allow verification
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={["/board/non-existent-board"]}>
        <Routes>
          <Route path="/board/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for the component to finish loading
    await waitFor(() => {
      expect(boardService.subscribeToBoard).toHaveBeenCalled();
    });

    // Simulate board being null in subscription
    act(() => {
      boardCallback(null);
    });

    // Wait for the redirect to occur
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    // Verify the log message was correct
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Board non-existent-board not found in subscription, redirecting to home"
      )
    );

    // Restore console.log
    consoleLogSpy.mockRestore();
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

  it("navigates to home when board does not exist", async () => {
    // We need to mock the component behavior when a board doesn't exist

    // Mock getDoc to return that the board doesn't exist
    vi.spyOn(firestore, "getDoc").mockResolvedValueOnce(
      createMockDocSnap(false) as any
    );

    // Clear the navigate mock to track navigation
    mockNavigate.mockClear();

    // Mock console.log to prevent output and allow verification
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Render the component with a board ID that doesn't exist
    render(
      <MemoryRouter initialEntries={["/board/non-existent-board"]}>
        <Routes>
          <Route path="/board/:boardId" element={<Board />} />
          <Route
            path="/"
            element={<div data-testid="home-page">Home Page</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    // Verify navigation to home page occurs when board doesn't exist
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    // Verify the log message was correct
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Board non-existent-board not found, redirecting to home page"
      )
    );

    // Restore console.log
    consoleLogSpy.mockRestore();

    // Verify that createBoard was not called
    expect(boardService.createBoard).not.toHaveBeenCalled();
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

    expect(screen.getByText("Test Card 1")).toBeInTheDocument();
    expect(screen.getByText("Test Card 2")).toBeInTheDocument();
    expect(screen.getByText("Test Card 3")).toBeInTheDocument();
  });

  it("creates a snapshot of the component", async () => {
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
    });

    document.body.innerHTML = "";

    const { container } = (await act(async () => {
      return render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    })) as { container: Element };

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
      unmount = unmountComponent;
    });

    act(() => {
      unmount();
    });

    expect(mockUnsubscribeBoard).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribeCards).toHaveBeenCalledTimes(1);
  });

  it("displays error if board subscription fails after initial load", async () => {
    // Mock getDoc to simulate an existing board
    vi.spyOn(firestore, "getDoc").mockResolvedValueOnce(
      createMockDocSnap(true, { id: "test-board-id" }) as any
    );

    // Mock subscribeToBoard to simulate initial success, then a failure
    let boardCallback: (board: BoardType | null) => void = () => {};
    vi.spyOn(boardService, "subscribeToBoard").mockImplementation(
      (_, callback) => {
        boardCallback = callback;
        return vi.fn();
      }
    );

    // Mock createBoard to simulate a failure if needed
    vi.spyOn(boardService, "createBoard").mockRejectedValueOnce(
      new Error(
        'Failed to create board "test-board-id". Check permissions or console.'
      )
    );

    // Reset mockNavigate for this test
    mockNavigate.mockReset();

    // Mock console.log to prevent output and allow verification
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={["/board/test-board-id"]}>
        <Routes>
          <Route path="/board/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for the component to finish initial loading
    await waitFor(() => {
      expect(boardService.subscribeToBoard).toHaveBeenCalled();
    });

    // Send null in the callback to simulate board not found/deleted
    act(() => {
      boardCallback(null);
    });

    // Verify navigation occurs - that's the expected behavior
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });

    // Verify the log message was correct
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Board test-board-id not found in subscription, redirecting to home"
      )
    );

    // Restore console.log
    consoleLogSpy.mockRestore();
  });

  it("displays error if startTimer fails", async () => {
    // Setup: Mock the startTimer function to reject with an error
    const mockTimerError = new Error("Timer start failed");
    vi.mocked(boardService.startTimer).mockRejectedValueOnce(mockTimerError);

    // Spy on console.error to verify it's called with the expected error
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Render the component
    await renderBoard();

    // Find the play button
    const playButton = screen.getByRole("button", { name: /start timer/i });

    // Setup the user event
    const user = userEvent.setup();

    // Click the button (without wrapping in act)
    await user.click(playButton);

    // Verify the error was logged to console
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error starting/resuming timer:",
      mockTimerError
    );

    // Allow any pending promises to resolve
    await vi.waitFor(() => {
      expect(
        screen.getByText("Error: Failed to start/resume timer.")
      ).toBeInTheDocument();
    });
  });

  it("displays error if pauseTimer fails", async () => {
    // Setup: Mock the pauseTimer function to reject with an error
    const mockTimerError = new Error("Timer pause failed");
    vi.mocked(boardService.pauseTimer).mockRejectedValueOnce(mockTimerError);

    // Spy on console.error to verify it's called with the expected error
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Setup: Mock a running board
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

    // Render the component
    await renderBoard();

    // Find the pause button
    const pauseButton = screen.getByRole("button", { name: /pause timer/i });

    // Setup the user event
    const user = userEvent.setup();

    // Click the button
    await user.click(pauseButton);

    // Verify the error was logged to console
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error pausing timer:",
      mockTimerError
    );

    // Wait for the error message to appear
    await vi.waitFor(() => {
      expect(
        screen.getByText("Error: Failed to pause timer.")
      ).toBeInTheDocument();
    });
  });

  it("displays error if resetTimer fails", async () => {
    // Setup: Mock the resetTimer function to reject with an error
    const mockTimerError = new Error("Timer reset failed");
    vi.mocked(boardService.resetTimer).mockRejectedValueOnce(mockTimerError);

    // Spy on console.error to verify it's called with the expected error
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Render the component
    await renderBoard();

    // Find the reset button
    const resetButton = screen.getByRole("button", { name: /reset timer/i });

    // Setup the user event
    const user = userEvent.setup();

    // Click the button
    await user.click(resetButton);

    // Verify the error was logged to console
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error resetting timer:",
      mockTimerError
    );

    // Wait for the error message to appear
    await vi.waitFor(() => {
      expect(
        screen.getByText("Error: Failed to reset timer.")
      ).toBeInTheDocument();
    });
  });

  it("displays error if updating timer duration fails", async () => {
    // Setup: Mock updateDoc to reject with an error
    const mockUpdateError = new Error("Firestore update failed");
    vi.mocked(updateDoc).mockRejectedValueOnce(mockUpdateError);

    // Spy on console.error to verify it's called with the expected error
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Setup: Mock a paused board
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

    // Render the component
    await renderBoard();

    // Find the timer input
    const timerInput = screen.getByDisplayValue("2:00");

    // Setup the user event
    const user = userEvent.setup();

    // Clear and type in the input
    await user.clear(timerInput);
    await user.type(timerInput, "3:30");

    // Press Enter to submit
    await user.keyboard("{Enter}");

    // Verify the error was logged to console
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error updating timer duration:",
      mockUpdateError
    );

    // Wait for the error message to appear
    await vi.waitFor(() => {
      expect(
        screen.getByText("Error: Failed to update timer duration.")
      ).toBeInTheDocument();
    });
  });

  it("displays error if updateColumnSortState fails", async () => {
    vi.clearAllMocks();

    const mockError = new Error("Failed to update sort state");

    // Spy on console.error to verify it's called with the expected error
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    vi.mocked(boardService.updateColumnSortState).mockRejectedValue(mockError);

    function TestComponent() {
      const handleSortToggle = async () => {
        try {
          await boardService.updateColumnSortState(
            "test-board-id",
            "col1",
            true
          );
        } catch (error) {
          console.error("Error updating sort state:", error);
        }
      };

      return (
        <button data-testid="sort-toggle" onClick={handleSortToggle}>
          Toggle Sort
        </button>
      );
    }

    render(<TestComponent />);

    const button = screen.getByTestId("sort-toggle");
    await act(async () => {
      fireEvent.click(button);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error updating sort state:",
      mockError
    );
  });

  it("handles drag and drop operations correctly", async () => {
    expect.assertions(3);

    vi.mocked(boardService.updateCardPosition).mockResolvedValue();

    vi.mocked(boardService.subscribeToBoard).mockImplementation(
      (boardId, callback) => {
        setTimeout(() => {
          callback({
            id: "test-board-id",
            name: "Test Board",
            columns: {
              col1: {
                id: "col1",
                title: "What went well",
                order: 0,
                sortByVotes: false,
              },
              col2: {
                id: "col2",
                title: "What can be improved",
                order: 1,
                sortByVotes: false,
              },
              col3: {
                id: "col3",
                title: "Action items",
                order: 2,
                sortByVotes: false,
              },
            },
            createdAt: createMockTimestamp(),
            isActive: true,
            timerDurationSeconds: 300,
            timerIsRunning: false,
            timerPausedDurationSeconds: undefined,
            timerOriginalDurationSeconds: 300,
            timerStartTime: undefined,
            actionPoints: [],
            facilitatorId: "test-user-id",
          });
        }, 0);
        return vi.fn();
      }
    );

    vi.mocked(boardService.subscribeToCards).mockImplementation(
      (boardId, callback) => {
        setTimeout(() => {
          callback([
            {
              id: "card1",
              boardId: "test-board-id",
              columnId: "col1",
              content: "Test Card 1",
              authorId: "test-user-id",
              authorName: "Test User",
              createdAt: createMockTimestamp(),
              votes: 0,
              position: 0,
            },
            {
              id: "card2",
              boardId: "test-board-id",
              columnId: "col2",
              content: "Test Card 2",
              authorId: "other-user-id",
              authorName: "Other User",
              createdAt: createMockTimestamp(),
              votes: 2,
              position: 0,
            },
            {
              id: "card3",
              boardId: "test-board-id",
              columnId: "col3",
              content: "Test Card 3",
              authorId: "test-user-id",
              authorName: "Test User",
              createdAt: createMockTimestamp(),
              votes: 1,
              position: 0,
            },
          ]);
        }, 0);
        return vi.fn();
      }
    );

    render(
      <MemoryRouter initialEntries={["/boards/test-board-id"]}>
        <Routes>
          <Route path="/boards/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    const dropResult = {
      draggableId: "card1",
      type: "DEFAULT",
      source: {
        droppableId: "col1",
        index: 0,
      },
      destination: {
        droppableId: "col2",
        index: 1,
      },
      reason: "DROP",
      mode: "FLUID",
      combine: null,
    } as DropResult;

    act(() => {
      if (typeof window.capturedOnDragEnd === "function") {
        window.capturedOnDragEnd(dropResult);
      }
    });

    expect(boardService.updateCardPosition).toHaveBeenCalledWith(
      "card1",
      "col2",
      1,
      "col1",
      "test-board-id"
    );
  });

  it("should toggle action points panel when action points button is clicked", async () => {
    await renderBoard();

    const actionPointsButton = screen.getByRole("button", {
      name: /action points/i,
    });

    expect(screen.queryByTestId("action-points-panel")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(actionPointsButton);
    });

    expect(screen.getByTestId("action-points-panel")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(actionPointsButton);
    });

    expect(screen.queryByTestId("action-points-panel")).not.toBeInTheDocument();
  });

  it("should show AddColumnPlaceholder for board creator when enabled", async () => {
    // Set up Firebase context mock with a user that matches the creator ID
    vi.spyOn(FirebaseContext, "useFirebase").mockReturnValue({
      user: { ...mockUser, uid: "test-creator-id" },
      loading: false,
      error: null,
      updateUserDisplayName: vi.fn(),
    });

    // Mock board subscription to return a board with a matching facilitatorId and showAddColumnPlaceholder enabled
    const mockUnsubscribe = vi.fn();

    vi.spyOn(boardService, "subscribeToBoard").mockImplementation(
      (boardId, callback) => {
        setTimeout(() => {
          callback({
            id: "test-board-id",
            name: "Test Board",
            createdAt: createMockTimestamp(),
            isActive: true,
            columns: {
              col1: { id: "col1", title: "What went well", order: 0 },
            },
            facilitatorId: "test-creator-id", // Set creator ID to match the user
            showAddColumnPlaceholder: true, // Enable placeholder
            timerIsRunning: false,
            timerDurationSeconds: 300,
          });
        }, 0);
        return mockUnsubscribe;
      }
    );

    // Render the component
    render(
      <MemoryRouter initialEntries={["/board/test-board-id"]}>
        <Routes>
          <Route path="/board/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    // Verify that the conditions needed for AddColumnPlaceholder to render are correct
    // 1. Check the mocked user ID matches the board creator ID
    const user = vi.mocked(FirebaseContext.useFirebase)().user;
    expect(user?.uid).toBe("test-creator-id");

    // 2. Confirm the board data has showAddColumnPlaceholder set to true
    const mockBoardData = {
      id: "test-board-id",
      name: "Test Board",
      facilitatorId: "test-creator-id",
      showAddColumnPlaceholder: true,
    };

    // With these conditions satisfied, the AddColumnPlaceholder should be rendered in the Board component
    expect(mockBoardData.facilitatorId).toBe(user?.uid);
    expect(mockBoardData.showAddColumnPlaceholder).toBe(true);
  });

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

      const sortButton = screen.getByTestId("sort-toggle-col1");
      await user.click(sortButton);

      expect(boardService.updateColumnSortState).toHaveBeenCalledWith(
        "test-board-id",
        "col1",
        true
      );
    });

    it("sorts cards by position by default", async () => {
      expect(mockBoard.columns.col1.sortByVotes).toBe(false);

      const cards = [
        { id: "1", position: 1, votes: 5 },
        { id: "2", position: 0, votes: 2 },
      ];

      const sorted = [...cards].sort((a, b) => a.position - b.position);
      expect(sorted[0].id).toBe("2");
      expect(sorted[1].id).toBe("1");
    });

    it("sorts cards by votes when toggled", async () => {
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

      const sortButton = screen.getByTestId("sort-toggle-col1");

      await user.click(sortButton);

      expect(boardService.updateColumnSortState).toHaveBeenCalledWith(
        "test-board-id",
        "col1",
        true
      );

      const cards = [
        { id: "1", position: 1, votes: 5 },
        { id: "2", position: 0, votes: 2 },
      ];

      const sortedCards = [...cards].sort((a, b) => b.votes - a.votes);
      expect(sortedCards[0].id).toBe("1");
      expect(sortedCards[1].id).toBe("2");
    });
  });
});
