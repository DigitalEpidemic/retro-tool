import type { DropResult } from "@hello-pangea/dnd";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User as FirebaseUser } from "firebase/auth";
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
    subscribeToBoard: vi.fn(() => vi.fn()),
    subscribeToCards: vi.fn(() => vi.fn()),
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
  facilitatorId: "test-user-id",
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

describe("Timer Functionality", () => {
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
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

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
    expect(boardService.resetTimer).toHaveBeenCalledWith("test-board-id", 300);

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

    expect(boardService.resetTimer).toHaveBeenCalledWith("test-board-id", 210);
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

    expect(boardService.resetTimer).toHaveBeenCalledWith("test-board-id", 120);

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
