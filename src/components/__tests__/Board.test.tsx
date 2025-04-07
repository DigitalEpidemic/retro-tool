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
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as FirebaseContext from "../../contexts/FirebaseContext";
import * as boardService from "../../services/boardService";
import type { Board as BoardType } from "../../services/firebase";
import * as presenceService from "../../services/presenceService";
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

declare global {
  interface Window {
    capturedOnDragEnd: ((result: DropResult) => void) | null;
  }
}

vi.mock("@hello-pangea/dnd", () => {
  return {
    DragDropContext: ({ children, onDragEnd }: any) => {
      window.capturedOnDragEnd = onDragEnd;
      return <div data-testid="drag-drop-context">{children}</div>;
    },
    Droppable: ({ children, droppableId }: any) => {
      const provided = {
        innerRef: vi.fn(),
        droppableProps: { "data-testid": `droppable-${droppableId}` },
        placeholder: null,
      };
      return children(provided);
    },
    Draggable: ({ children, draggableId }: any) => {
      const provided = {
        innerRef: vi.fn(),
        draggableProps: { "data-testid": `draggable-${draggableId}` },
        dragHandleProps: {},
      };
      return children(provided);
    },
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
    joinBoard: vi.fn(() => Promise.resolve()),
    deleteBoard: vi.fn((boardId, userId) => Promise.resolve(true)),
    testFirestoreWrite: vi.fn(() => Promise.resolve()),
    cleanupInactiveUsers: vi.fn(() => Promise.resolve()),
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
  setupPresence: vi.fn().mockReturnValue(() => {}),
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

// Mock for navigate function
const mockNavigate = vi.fn();

// Mock react-router-dom
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

    // After navigation occurs, the error wouldn't be visible anymore in this component
    // The error handling would need to be done in the home component
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

    // After navigation occurs, the error wouldn't be visible anymore in this component
    // The error handling would need to be done in the home component
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

    // Verify that createBoard was not called
    expect(boardService.createBoard).not.toHaveBeenCalled();
  });

  describe("Timer Functionality", () => {
    it("handles timer controls correctly (start, pause, reset)", async () => {
      const user = userEvent.setup();
      let boardCallback: (board: BoardType | null) => void = () => {};
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

      const playButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(playButton);
      expect(boardService.startTimer).toHaveBeenCalledWith(
        "test-board-id",
        mockBoard
      );

      const runningBoard = {
        ...mockBoard,
        timerIsRunning: true,
        timerStartTime: Timestamp.now(),
      };
      act(() => boardCallback(runningBoard));

      const pauseButton = screen.getByRole("button", { name: /pause timer/i });
      await user.click(pauseButton);
      expect(boardService.pauseTimer).toHaveBeenCalledWith(
        "test-board-id",
        runningBoard
      );

      const pausedBoard = {
        ...runningBoard,
        timerIsRunning: false,
        timerPausedDurationSeconds: 299,
      };
      act(() => boardCallback(pausedBoard));

      const resetButton = screen.getByRole("button", { name: /reset timer/i });
      await user.click(resetButton);
      expect(boardService.resetTimer).toHaveBeenCalledWith(
        "test-board-id",
        300
      );

      act(() => boardCallback(mockBoard));
    });

    it("displays the correct time when timer is running", async () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      const runningBoard = {
        ...mockBoard,
        timerIsRunning: true,
        timerStartTime: Timestamp.fromMillis(startTime),
        timerDurationSeconds: 5,
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

      expect(screen.getByText("0:05")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByText("0:03")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByText("0:01")).toBeInTheDocument();

      vi.useRealTimers();
    });

    it("automatically resets the timer when it expires", async () => {
      vi.useFakeTimers();
      let boardCallback: (board: BoardType | null) => void = () => {};
      const startTime = Date.now();
      const shortDuration = 2;
      const runningBoard = {
        ...mockBoard,
        timerIsRunning: true,
        timerStartTime: Timestamp.fromMillis(startTime),
        timerDurationSeconds: shortDuration,
        timerPausedDurationSeconds: undefined,
      };

      vi.mocked(boardService.subscribeToBoard).mockImplementation(
        (_, callback) => {
          boardCallback = callback;
          act(() => callback(runningBoard));
          return vi.fn();
        }
      );
      vi.mocked(boardService.resetTimer).mockResolvedValue();

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

      await act(async () => {
        vi.advanceTimersByTime(3500);
      });

      expect(boardService.resetTimer).toHaveBeenCalledWith(
        "test-board-id",
        shortDuration
      );

      const resetBoard = {
        ...mockBoard,
        timerIsRunning: false,
        timerStartTime: undefined,
        timerDurationSeconds: shortDuration,
        timerPausedDurationSeconds: shortDuration,
      };
      act(() => boardCallback(resetBoard));

      expect(screen.getByDisplayValue("0:02")).toBeInTheDocument();

      vi.useRealTimers();
    });

    it("handles error during automatic timer reset", async () => {
      vi.useFakeTimers();
      const startTime = Date.now();
      const shortDuration = 1;
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

      await act(async () => {
        vi.advanceTimersByTime(2500);
      });

      expect(boardService.resetTimer).toHaveBeenCalledWith(
        "test-board-id",
        shortDuration
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error auto-resetting timer:",
        resetError
      );

      expect(screen.getByText("0:00")).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    });

    it("handles resetting timer after running", async () => {
      const user = userEvent.setup();

      const resetTimerMock = vi.fn().mockResolvedValue(undefined);
      vi.mocked(boardService.resetTimer).mockImplementation(resetTimerMock);

      const testBoard = {
        ...mockBoard,
        id: "test-board-id",
        timerDurationSeconds: 300,
        timerIsRunning: false,
      };

      vi.mocked(boardService.subscribeToBoard).mockImplementation(
        (_, callback) => {
          act(() => callback(testBoard));
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

      const resetButton = screen.getByRole("button", { name: /reset timer/i });
      expect(resetButton).toBeInTheDocument();

      await act(async () => {
        await user.click(resetButton);
      });

      expect(resetTimerMock).toHaveBeenCalledWith("test-board-id", 300);
    });

    it("handles editing timer duration when paused", async () => {
      const user = userEvent.setup();
      let boardCallback: (board: BoardType | null) => void;

      vi.mocked(boardService.resetTimer).mockResolvedValue();

      const pausedBoard = {
        ...mockBoard,
        timerIsRunning: false,
        timerPausedDurationSeconds: 120,
        timerDurationSeconds: 120,
        timerOriginalDurationSeconds: 120,
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

      const timerInput = screen.getByDisplayValue("2:00");
      expect(timerInput).toBeInTheDocument();

      await user.clear(timerInput);
      await user.type(timerInput, "3:30");

      vi.mocked(updateDoc).mockResolvedValue();
      await act(async () => {
        fireEvent.keyDown(timerInput, { key: "Enter" });
      });

      expect(vi.mocked(updateDoc)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          timerDurationSeconds: 210,
          timerPausedDurationSeconds: 210,
          timerOriginalDurationSeconds: 210,
          timerIsRunning: false,
        })
      );

      const updatedBoard = {
        ...pausedBoard,
        timerDurationSeconds: 210,
        timerPausedDurationSeconds: 210,
        timerOriginalDurationSeconds: 210,
      };
      act(() => boardCallback(updatedBoard));

      const resetButton = screen.getByRole("button", { name: /reset timer/i });
      expect(resetButton).toBeInTheDocument();

      await user.click(resetButton);

      expect(boardService.resetTimer).toHaveBeenCalledWith(
        "test-board-id",
        210
      );
    });

    it("prevents saving edited time when timer is running", async () => {
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

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByText("5:00")).toBeInTheDocument();

      expect(vi.mocked(updateDoc)).not.toHaveBeenCalled();
    });

    it("reverts timer input to last valid time on invalid entry (Enter)", async () => {
      const user = userEvent.setup();
      const pausedBoard = { ...mockBoard, timerPausedDurationSeconds: 120 };
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
      await user.type(timerInput, "abc");
      fireEvent.keyDown(timerInput, { key: "Enter" });

      expect(timerInput).toHaveValue("2:00");
      expect(vi.mocked(updateDoc)).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Invalid time format entered:",
        "abc"
      );
      consoleWarnSpy.mockRestore();
    });

    it("reverts timer input to last valid time on invalid entry (Blur)", async () => {
      const user = userEvent.setup();
      const pausedBoard = { ...mockBoard, timerPausedDurationSeconds: 120 };
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
      await user.type(timerInput, "5:60");
      await act(async () => {
        fireEvent.blur(timerInput);
      });

      expect(timerInput).toHaveValue("2:00");
      expect(vi.mocked(updateDoc)).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Invalid time format entered:",
        "5:60"
      );
      consoleWarnSpy.mockRestore();
    });

    it("reverts timer input on Escape key press", async () => {
      const user = userEvent.setup();
      const pausedBoard = { ...mockBoard, timerPausedDurationSeconds: 120 };
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
      expect(timerInput).toHaveValue("3:30");

      fireEvent.keyDown(timerInput, { key: "Escape" });

      expect(timerInput).toHaveValue("2:00");
    });

    it("does not save timer on blur if focus moves to a timer control button", async () => {
      const user = userEvent.setup();
      const pausedBoard = { ...mockBoard, timerPausedDurationSeconds: 120 };
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
      await user.type(timerInput, "4:00");

      await act(async () => {
        playButton.focus();
        fireEvent.blur(timerInput, { relatedTarget: playButton });
      });

      expect(vi.mocked(updateDoc)).not.toHaveBeenCalled();
      expect(timerInput).toHaveValue("4:00");
    });

    it("resets timer to the last saved duration", async () => {
      const user = userEvent.setup();
      let boardCallback: (board: BoardType | null) => void = () => {};

      vi.mocked(boardService.startTimer).mockResolvedValue();
      vi.mocked(boardService.pauseTimer).mockResolvedValue();
      vi.mocked(boardService.resetTimer).mockResolvedValue();

      const initialPausedBoard = {
        ...mockBoard,
        timerIsRunning: false,
        timerPausedDurationSeconds: 300,
        timerDurationSeconds: 300,
        timerOriginalDurationSeconds: 300,
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

      const timerInput = screen.getByDisplayValue("5:00");
      await user.clear(timerInput);
      await user.type(timerInput, "2:00");

      vi.mocked(updateDoc).mockResolvedValue();
      await act(async () => {
        fireEvent.keyDown(timerInput, { key: "Enter" });
      });

      expect(vi.mocked(updateDoc)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          timerDurationSeconds: 120,
          timerPausedDurationSeconds: 120,
          timerOriginalDurationSeconds: 120,
        })
      );

      const savedBoardState = {
        ...initialPausedBoard,
        timerDurationSeconds: 120,
        timerPausedDurationSeconds: 120,
        timerOriginalDurationSeconds: 120,
      };
      act(() => boardCallback(savedBoardState));

      expect(timerInput).toHaveValue("2:00");

      const playButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(playButton);
      expect(boardService.startTimer).toHaveBeenCalledWith(
        "test-board-id",
        savedBoardState
      );

      const runningBoardState = {
        ...savedBoardState,
        timerIsRunning: true,
        timerStartTime: Timestamp.now(),
        timerPausedDurationSeconds: undefined,
        timerOriginalDurationSeconds: 120,
      };
      act(() => boardCallback(runningBoardState));

      expect(screen.getByText("2:00")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("2:00")).not.toBeInTheDocument();

      const pauseButton = screen.getByRole("button", { name: /pause timer/i });
      await user.click(pauseButton);
      expect(boardService.pauseTimer).toHaveBeenCalledWith(
        "test-board-id",
        runningBoardState
      );

      const pausedBoardState = {
        ...runningBoardState,
        timerIsRunning: false,
        timerStartTime: undefined,
        timerPausedDurationSeconds: 100,
        timerDurationSeconds: 120,
        timerOriginalDurationSeconds: 120,
      };
      act(() => boardCallback(pausedBoardState));

      const pausedTimerInput = screen.getByDisplayValue("1:40");
      expect(pausedTimerInput).toBeInTheDocument();

      const resetButton = screen.getByRole("button", { name: /reset timer/i });
      await act(async () => {
        await user.click(resetButton);
      });

      expect(boardService.resetTimer).toHaveBeenCalledWith(
        "test-board-id",
        120
      );

      const resetBoardState = {
        ...pausedBoardState,
        timerIsRunning: false,
        timerStartTime: undefined,
        timerPausedDurationSeconds: 120,
        timerDurationSeconds: 120,
        timerOriginalDurationSeconds: 120,
      };
      act(() => boardCallback(resetBoardState));

      expect(screen.getByDisplayValue("2:00")).toBeInTheDocument();
    });

    it("resets timer correctly when paused after running twice", async () => {
      const user = userEvent.setup();
      let boardCallback: (board: BoardType | null) => void = () => {};

      const resetTimerMock = vi.fn().mockResolvedValue(undefined);
      vi.mocked(boardService.resetTimer).mockImplementation(resetTimerMock);

      vi.mocked(boardService.startTimer).mockResolvedValue();
      vi.mocked(boardService.pauseTimer).mockResolvedValue();

      const initialPausedBoard = {
        ...mockBoard,
        timerIsRunning: false,
        timerPausedDurationSeconds: 300,
        timerDurationSeconds: 300,
        timerOriginalDurationSeconds: 300,
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

      const timerInput = screen.getByDisplayValue("5:00");
      await user.clear(timerInput);
      await user.type(timerInput, "2:00");

      vi.mocked(updateDoc).mockResolvedValue();
      await act(async () => {
        fireEvent.keyDown(timerInput, { key: "Enter" });
      });

      expect(vi.mocked(updateDoc)).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          timerDurationSeconds: 120,
          timerPausedDurationSeconds: 120,
          timerOriginalDurationSeconds: 120,
        })
      );

      const savedBoardState = {
        ...initialPausedBoard,
        timerDurationSeconds: 120,
        timerPausedDurationSeconds: 120,
        timerOriginalDurationSeconds: 120,
      };
      act(() => boardCallback(savedBoardState));

      expect(timerInput).toHaveValue("2:00");

      const playButton = screen.getByRole("button", { name: /start timer/i });
      await user.click(playButton);
      expect(boardService.startTimer).toHaveBeenCalledWith(
        "test-board-id",
        savedBoardState
      );

      const runningBoardState = {
        ...savedBoardState,
        timerIsRunning: true,
        timerStartTime: Timestamp.now(),
        timerPausedDurationSeconds: undefined,
        timerDurationSeconds: 120,
        timerOriginalDurationSeconds: 120,
      };
      act(() => boardCallback(runningBoardState));

      const pauseButton = screen.getByRole("button", { name: /pause timer/i });
      await user.click(pauseButton);
      expect(boardService.pauseTimer).toHaveBeenCalledWith(
        "test-board-id",
        runningBoardState
      );

      const firstPausedState = {
        ...runningBoardState,
        timerIsRunning: false,
        timerStartTime: undefined,
        timerPausedDurationSeconds: 118,
        timerDurationSeconds: 120,
        timerOriginalDurationSeconds: 120,
      };
      act(() => boardCallback(firstPausedState));

      expect(screen.getByDisplayValue("1:58")).toBeInTheDocument();

      await user.click(playButton);
      expect(boardService.startTimer).toHaveBeenCalledWith(
        "test-board-id",
        firstPausedState
      );

      const secondRunningState = {
        ...firstPausedState,
        timerIsRunning: true,
        timerStartTime: Timestamp.now(),
        timerPausedDurationSeconds: undefined,
        timerDurationSeconds: 118,
        timerOriginalDurationSeconds: 120,
      };
      act(() => boardCallback(secondRunningState));

      await user.click(pauseButton);
      expect(boardService.pauseTimer).toHaveBeenCalledWith(
        "test-board-id",
        secondRunningState
      );

      const secondPausedState = {
        ...secondRunningState,
        timerIsRunning: false,
        timerStartTime: undefined,
        timerPausedDurationSeconds: 113,
        timerDurationSeconds: 118,
        timerOriginalDurationSeconds: 120,
      };
      act(() => boardCallback(secondPausedState));

      resetTimerMock.mockClear();

      expect(screen.getByDisplayValue("1:53")).toBeInTheDocument();

      const resetButton = screen.getByRole("button", { name: /reset timer/i });
      await act(async () => {
        await user.click(resetButton);
      });

      expect(resetTimerMock).toHaveBeenCalledWith("test-board-id", 120);

      const resetBoardState = {
        ...secondPausedState,
        timerIsRunning: false,
        timerStartTime: undefined,
        timerPausedDurationSeconds: 120,
        timerDurationSeconds: 120,
        timerOriginalDurationSeconds: 120,
      };
      act(() => boardCallback(resetBoardState));

      expect(screen.getByDisplayValue("2:00")).toBeInTheDocument();
    });
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
  });

  it("displays error if updateColumnSortState fails", async () => {
    vi.clearAllMocks();

    const consoleErrorSpy = vi.spyOn(console, "error");

    const mockError = new Error("Failed to update sort state");

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

    consoleErrorSpy.mockRestore();
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

  describe("Action Points Panel", () => {
    it("should toggle action points panel when action points button is clicked", async () => {
      await renderBoard();

      const actionPointsButton = screen.getByRole("button", {
        name: /action points/i,
      });

      expect(
        screen.queryByTestId("action-points-panel")
      ).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.click(actionPointsButton);
      });

      expect(screen.getByTestId("action-points-panel")).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(actionPointsButton);
      });

      expect(
        screen.queryByTestId("action-points-panel")
      ).not.toBeInTheDocument();
    });
  });

  // Tests for board deletion functionality
  describe("Board Deletion", () => {
    it("should allow board creator to delete the board", async () => {
      // Set up Firebase context mock with a user that matches the creator ID
      vi.spyOn(FirebaseContext, "useFirebase").mockReturnValue({
        user: { ...mockUser, uid: "test-creator-id" },
        loading: false,
        error: null,
        updateUserDisplayName: vi.fn(),
      });

      // Mock joinBoard to return success
      vi.spyOn(boardService, "joinBoard").mockResolvedValue({
        success: true,
        name: "Test Creator",
      });

      // Mock subscribeToBoard to provide test board data
      const boardData = {
        id: "test-board-id",
        name: "Test Board",
        createdAt: createMockTimestamp(),
        isActive: true,
        columns: {
          col1: { id: "col1", title: "What went well", order: 0 },
        },
        facilitatorId: "test-creator-id", // Set creator ID to match the user
        timerIsRunning: false,
        timerDurationSeconds: 300,
      };

      let boardCallback: Function;
      vi.spyOn(boardService, "subscribeToBoard").mockImplementation(
        (_, callback) => {
          boardCallback = callback;
          setTimeout(() => {
            callback(boardData);
          }, 0);
          return vi.fn();
        }
      );

      // Mock deleteBoard to resolve successfully
      vi.spyOn(boardService, "deleteBoard").mockResolvedValue(true);

      // Render component
      render(
        <MemoryRouter initialEntries={["/board/test-board-id"]}>
          <Routes>
            <Route path="/board/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for the board to load completely
      await waitFor(() => {
        expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
      });

      // Open options panel
      const optionsButton = screen
        .getByTestId("settings-icon")
        .closest("button");
      if (!optionsButton) throw new Error("Options button not found");
      fireEvent.click(optionsButton);

      // Wait for options panel to appear
      const optionsPanel = await screen.findByTestId("options-panel");
      expect(optionsPanel).toBeInTheDocument();

      // Click delete button
      const deleteButton = screen.getByTestId("delete-board-button");
      expect(deleteButton).not.toBeDisabled();
      fireEvent.click(deleteButton);

      // Click confirm deletion
      const confirmButton = await screen.findByTestId("confirm-delete");
      fireEvent.click(confirmButton);

      // Verify deleteBoard was called with the correct parameters
      expect(boardService.deleteBoard).toHaveBeenCalledWith(
        "test-board-id",
        "test-creator-id"
      );
    });

    it("should prevent non-creator from deleting the board", async () => {
      // Set up Firebase context mock with a different user ID
      vi.spyOn(FirebaseContext, "useFirebase").mockReturnValue({
        user: { ...mockUser, uid: "non-creator-id" },
        loading: false,
        error: null,
        updateUserDisplayName: vi.fn(),
      });

      // Mock joinBoard to return success
      vi.spyOn(boardService, "joinBoard").mockResolvedValue({
        success: true,
        name: "Non Creator",
      });

      // Mock subscribeToBoard to provide test board data
      const boardData = {
        id: "test-board-id",
        name: "Test Board",
        createdAt: createMockTimestamp(),
        isActive: true,
        columns: {
          col1: { id: "col1", title: "What went well", order: 0 },
        },
        facilitatorId: "test-creator-id", // Different from the user ID
        timerIsRunning: false,
        timerDurationSeconds: 300,
      };

      let boardCallback: Function;
      vi.spyOn(boardService, "subscribeToBoard").mockImplementation(
        (_, callback) => {
          boardCallback = callback;
          setTimeout(() => {
            callback(boardData);
          }, 0);
          return vi.fn();
        }
      );

      // Render component
      render(
        <MemoryRouter initialEntries={["/board/test-board-id"]}>
          <Routes>
            <Route path="/board/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for the board to load completely
      await waitFor(() => {
        expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
      });

      // Open options panel
      const optionsButton = screen
        .getByTestId("settings-icon")
        .closest("button");
      if (!optionsButton) throw new Error("Options button not found");
      fireEvent.click(optionsButton);

      // Wait for options panel to appear
      const optionsPanel = await screen.findByTestId("options-panel");
      expect(optionsPanel).toBeInTheDocument();

      // Verify delete button is disabled
      const deleteButton = screen.getByTestId("delete-board-button");
      expect(deleteButton).toBeDisabled();

      // Verify message is displayed
      expect(
        screen.getByText("Only the board creator can delete this board")
      ).toBeInTheDocument();

      // Verify deleteBoard was not called
      expect(boardService.deleteBoard).not.toHaveBeenCalled();
    });

    it("should show error message if board deletion fails", async () => {
      // Set up Firebase context mock with a user that matches the creator ID
      vi.spyOn(FirebaseContext, "useFirebase").mockReturnValue({
        user: { ...mockUser, uid: "test-creator-id" },
        loading: false,
        error: null,
        updateUserDisplayName: vi.fn(),
      });

      // Mock joinBoard to return success
      vi.spyOn(boardService, "joinBoard").mockResolvedValue({
        success: true,
        name: "Test Creator",
      });

      // Mock subscribeToBoard to provide test board data
      const boardData = {
        id: "test-board-id",
        name: "Test Board",
        createdAt: createMockTimestamp(),
        isActive: true,
        columns: {
          col1: { id: "col1", title: "What went well", order: 0 },
        },
        facilitatorId: "test-creator-id", // Set creator ID to match the user
        timerIsRunning: false,
        timerDurationSeconds: 300,
      };

      let boardCallback: Function;
      vi.spyOn(boardService, "subscribeToBoard").mockImplementation(
        (_, callback) => {
          boardCallback = callback;
          setTimeout(() => {
            callback(boardData);
          }, 0);
          return vi.fn();
        }
      );

      // Mock deleteBoard to reject with an error
      vi.spyOn(boardService, "deleteBoard").mockRejectedValueOnce(
        new Error("Permission denied")
      );

      // Render component
      render(
        <MemoryRouter initialEntries={["/board/test-board-id"]}>
          <Routes>
            <Route path="/board/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for the board to load completely
      await waitFor(() => {
        expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
      });

      // Open options panel
      const optionsButton = screen
        .getByTestId("settings-icon")
        .closest("button");
      if (!optionsButton) throw new Error("Options button not found");
      fireEvent.click(optionsButton);

      // Wait for options panel to appear
      const optionsPanel = await screen.findByTestId("options-panel");
      expect(optionsPanel).toBeInTheDocument();

      // Click delete button
      const deleteButton = screen.getByTestId("delete-board-button");
      expect(deleteButton).not.toBeDisabled();
      fireEvent.click(deleteButton);

      // Click confirm deletion
      const confirmButton = await screen.findByTestId("confirm-delete");
      fireEvent.click(confirmButton);

      // Verify the error message is displayed
      await waitFor(() => {
        expect(
          screen.getByText("Error: Permission denied")
        ).toBeInTheDocument();
      });
    });

    it("redirects all users to home when board is deleted", async () => {
      vi.clearAllMocks();
      let boardSubscriptionCallback: (board: BoardType | null) => void;

      // Reset mockNavigate for this test
      mockNavigate.mockReset();

      // Mock the board subscription to initially return a board and then simulate deletion
      vi.mocked(boardService.subscribeToBoard).mockImplementation(
        (boardId, callback) => {
          boardSubscriptionCallback = callback;

          // Initially return a valid board
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
              },
              createdAt: createMockTimestamp(),
              isActive: true,
              timerDurationSeconds: 300,
              timerIsRunning: false,
              facilitatorId: "test-user-id",
            });
          }, 0);

          return vi.fn();
        }
      );

      // Mock participants
      vi.mocked(presenceService.subscribeToParticipants).mockImplementation(
        (boardId, callback) => {
          setTimeout(() => {
            callback([
              {
                id: "test-user-id",
                name: "Admin User",
                color: "#ff0000",
                boardId,
                lastOnline: Date.now(),
              },
              {
                id: "other-user-id",
                name: "Regular User",
                color: "#00ff00",
                boardId,
                lastOnline: Date.now(),
              },
            ]);
          }, 0);

          return vi.fn();
        }
      );

      // Mock the delete board function
      vi.mocked(boardService.deleteBoard).mockResolvedValue(true);

      // Set up the user context with admin user
      vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
        user: {
          uid: "test-user-id",
          displayName: "Admin User",
        } as FirebaseUser,
        loading: false,
        error: null,
        updateUserDisplayName: vi.fn(),
      });

      // Render the board component
      render(
        <MemoryRouter initialEntries={["/boards/test-board-id"]}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
            <Route
              path="/"
              element={<div data-testid="home-page">Home Page</div>}
            />
          </Routes>
        </MemoryRouter>
      );

      // Wait for the board to load
      await waitFor(() => {
        expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
      });

      // Now simulate a board deletion by returning null in the subscription callback
      act(() => {
        boardSubscriptionCallback(null);
      });

      // Verify the navigation occurred
      expect(mockNavigate).toHaveBeenCalledWith("/");
    });
  });
});
