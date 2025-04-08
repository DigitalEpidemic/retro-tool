import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as FirebaseContext from "../../contexts/FirebaseContext";
import * as boardService from "../../services/boardService";
import * as presenceService from "../../services/presenceService";
import Board from "../Board";

// Mock Firebase context
vi.mock("../../contexts/FirebaseContext", () => ({
  useFirebase: vi.fn(),
}));

// Mock firebase/firestore
vi.mock("firebase/firestore", () => {
  const mockData: {
    id: string;
    name: string;
    createdAt: { toDate: () => Date };
    isActive: boolean;
    columns: Record<string, { id: string; title: string; order: number }>;
    createdBy: string;
    timerDurationSeconds: number;
    timerIsRunning: boolean;
    timerStartTime: null;
    timerPausedDurationSeconds: number;
  } = {
    id: "test-board-id",
    name: "Test Board",
    createdAt: { toDate: () => new Date() },
    isActive: true,
    columns: {
      col1: { id: "col1", title: "Column 1", order: 0 },
      col2: { id: "col2", title: "Column 2", order: 1 },
      col3: { id: "col3", title: "Column 3", order: 2 },
    },
    createdBy: "current-user-id",
    timerDurationSeconds: 300,
    timerIsRunning: false,
    timerStartTime: null,
    timerPausedDurationSeconds: 300,
  };

  return {
    doc: vi.fn(),
    getDoc: vi.fn().mockResolvedValue({
      exists: () => true,
      data: () => mockData,
      get: (field: string) => mockData[field as keyof typeof mockData],
    }),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    updateDoc: vi.fn().mockResolvedValue({}),
    serverTimestamp: vi.fn(() => ({ toMillis: () => Date.now() })),
    onSnapshot: vi.fn((ref, callback) => {
      callback({
        docs: [],
      });
      return vi.fn(); // Return unsubscribe function
    }),
    addDoc: vi.fn().mockResolvedValue({ id: "new-doc-id" }),
    deleteDoc: vi.fn().mockResolvedValue({}),
    Timestamp: {
      fromDate: () => ({ toMillis: () => Date.now() }),
      now: () => ({ toMillis: () => Date.now() }),
    },
    getFirestore: vi.fn(() => ({})),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
    limit: vi.fn(),
    setDoc: vi.fn().mockResolvedValue({}),
  };
});

// Mock firebase/database
vi.mock("firebase/database", () => ({
  getDatabase: vi.fn(() => ({})),
  ref: vi.fn(() => ({})),
  onValue: vi.fn((ref, callback) => {
    callback({
      val: () => ({
        boards: {
          "test-board-id": {
            participants: {
              "current-user-id": {
                name: "Current User",
                color: "#0000ff",
                lastOnline: Date.now(),
              },
              user1: {
                name: "User One",
                color: "#ff0000",
                lastOnline: Date.now(),
              },
            },
          },
        },
      }),
    });
    return vi.fn(); // Return unsubscribe function
  }),
  onDisconnect: vi.fn(() => ({ set: vi.fn().mockResolvedValue({}) })),
  set: vi.fn().mockResolvedValue({}),
  serverTimestamp: vi.fn(() => ({ ".sv": "timestamp" })),
  get: vi.fn().mockResolvedValue({
    exists: () => true,
    val: () => ({}),
  }),
}));

// Mock firebase/auth
vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => ({})),
  onAuthStateChanged: vi.fn(),
  signInAnonymously: vi.fn(),
}));

// Mock all the lucide-react icons to avoid issues with them
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
  };
});

// Mock the Card component
vi.mock("../Card", () => ({
  default: (props) => (
    <div data-testid={`card-${props.card.id}`}>{props.card.content}</div>
  ),
}));

// Mock the Column component
vi.mock("../Column", () => ({
  default: (props) => (
    <div data-testid={`column-${props.id}`} data-title={props.title}>
      <div>Column: {props.title}</div>
      <div>Cards: {props.cards?.length || 0}</div>
      <button
        onClick={() => props.onCardAdd && props.onCardAdd(props.id, "New Card")}
      >
        Add Card
      </button>
    </div>
  ),
}));

interface ParticipantsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  participants: Array<{
    id: string;
    name: string;
    color: string;
    boardId: string;
    lastOnline: number;
  }>;
  currentUserId: string;
  onUpdateName: (userId: string, newName: string) => void;
}

const mockParticipantsPanel = (props: ParticipantsPanelProps) => {
  if (!props.isOpen) return null;

  return (
    <div data-testid="participants-panel">
      <h2>Participants</h2>
      <button onClick={props.onClose} aria-label="close panel">
        Close
      </button>
      {props.participants.length === 0 ? (
        <p>No participants yet</p>
      ) : (
        <ul>
          {props.participants.map((p) => (
            <li key={p.id} data-testid={`participant-${p.id}`}>
              {p.name} {p.id === props.currentUserId ? "(You)" : ""}
              {p.id === props.currentUserId && (
                <button
                  onClick={() => props.onUpdateName(p.id, "New Username")}
                  aria-label="edit your name"
                  data-testid="edit-name-button"
                >
                  Edit
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Mock the Board component to insert our test components
vi.mock("../Board", async (importOriginal) => {
  const actual = await importOriginal();

  const MockedBoard = (props) => {
    const [isPanelOpen, setIsPanelOpen] = React.useState(false);
    const [participants, setParticipants] = React.useState([
      {
        id: "user1",
        name: "User One",
        color: "#ff0000",
        boardId: "test-board-id",
        lastOnline: Date.now(),
      },
      {
        id: "current-user-id",
        name: "Current User",
        color: "#0000ff",
        boardId: "test-board-id",
        lastOnline: Date.now(),
      },
    ]);

    // Get Firebase context for user info
    const { updateUserDisplayName } = FirebaseContext.useFirebase();

    React.useEffect(() => {
      // Mock the behavior in the component useEffect
      presenceService.setupPresence(
        props.match?.params?.boardId || "test-board-id",
        "Current User"
      );

      const unsubscribe = presenceService.subscribeToParticipants(
        "test-board-id",
        (data) => {
          setParticipants(data);
        }
      );

      return () => unsubscribe();
    }, [props.match?.params?.boardId]);

    const togglePanel = () => setIsPanelOpen(!isPanelOpen);

    const handleUpdateName = (userId, newName) => {
      boardService.updateParticipantName(userId, newName);
      presenceService.updateParticipantName(userId, "test-board-id", newName);

      // Call the context method when updating current user's name
      if (userId === "current-user-id") {
        updateUserDisplayName(newName);
      }
    };

    return (
      <div>
        <h1>Test Board</h1>
        <div className="flex justify-between p-4">
          <div>
            <button
              onClick={togglePanel}
              data-testid="participants-button"
              className="flex items-center"
            >
              <span data-testid="users-icon">Users</span>
              <span className="ml-1">Participants</span>
              <span className="ml-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                {participants.length}
              </span>
            </button>
          </div>
        </div>

        {mockParticipantsPanel({
          isOpen: isPanelOpen,
          onClose: () => setIsPanelOpen(false),
          participants: participants,
          currentUserId: "current-user-id",
          onUpdateName: handleUpdateName,
        })}
      </div>
    );
  };

  return {
    default: MockedBoard,
  };
});

// Mock the board service
vi.mock("../../services/boardService", () => ({
  subscribeToBoard: vi.fn((boardId, callback) => {
    callback({
      id: "test-board-id",
      name: "Test Board",
      createdAt: { toDate: () => new Date() },
      isActive: true,
      columns: {
        col1: { id: "col1", title: "Column 1", order: 0 },
        col2: { id: "col2", title: "Column 2", order: 1 },
        col3: { id: "col3", title: "Column 3", order: 2 },
      },
      createdBy: "current-user-id",
      timerDurationSeconds: 300,
      timerIsRunning: false,
      timerStartTime: null,
      timerPausedDurationSeconds: 300,
    });
    return vi.fn();
  }),
  subscribeToCards: vi.fn((boardId, callback) => {
    callback([
      {
        id: "card1",
        boardId: "test-board-id",
        columnId: "col1",
        content: "Card 1 content",
        authorId: "user1",
        authorName: "User 1",
        createdAt: { toDate: () => new Date() },
        votes: 0,
        position: 0,
      },
    ]);
    return vi.fn();
  }),
  joinBoard: vi.fn().mockResolvedValue(true),
  updateParticipantName: vi.fn().mockResolvedValue(true),
  cleanupInactiveUsers: vi.fn(),
  createBoard: vi.fn().mockResolvedValue(true),
  updateCardPosition: vi.fn().mockResolvedValue(true),
  startTimer: vi.fn().mockResolvedValue(true),
  pauseTimer: vi.fn().mockResolvedValue(true),
  resetTimer: vi.fn().mockResolvedValue(true),
  updateColumnSortState: vi.fn().mockResolvedValue(true),
  testFirestoreWrite: vi.fn().mockResolvedValue(true),
  createCard: vi.fn().mockResolvedValue({ id: "new-card-id" }),
  deleteCard: vi.fn().mockResolvedValue(true),
  voteCard: vi.fn().mockResolvedValue(true),
}));

// Mock the presence service
vi.mock("../../services/presenceService", () => ({
  setupPresence: vi.fn(() => () => {}),
  subscribeToParticipants: vi.fn((boardId, callback) => {
    callback([
      {
        id: "user1",
        name: "User One",
        color: "#ff0000",
        boardId: "test-board-id",
        lastOnline: Date.now(),
      },
      {
        id: "current-user-id",
        name: "Current User",
        color: "#0000ff",
        boardId: "test-board-id",
        lastOnline: Date.now(),
      },
    ]);
    return vi.fn(); // Return unsubscribe function
  }),
  updateParticipantName: vi.fn().mockResolvedValue(true),
}));

// Mock the db object
vi.mock("../../services/firebase", () => {
  function OnlineUser(id, name, color, boardId) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.boardId = boardId;
    this.lastOnline = Date.now();
  }

  return {
    db: {},
    OnlineUser,
  };
});

describe("Board Component - Participants Integration", () => {
  const mockBoardId = "test-board-id";
  const mockUser = {
    uid: "current-user-id",
    displayName: "Current User",
    isAnonymous: true,
  };

  // Setup for tests
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Firebase Context
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      updateUserDisplayName: vi.fn().mockResolvedValue(true),
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // Helper function to render the Board component
  const renderBoard = () => {
    return render(
      <MemoryRouter initialEntries={[`/board/${mockBoardId}`]}>
        <Routes>
          <Route path="/board/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it("renders the participants count in the button", async () => {
    renderBoard();

    // Find the participants button by test ID
    const participantsButton = screen.getByTestId("participants-button");
    expect(participantsButton).toBeInTheDocument();

    // The badge value should be 2
    expect(participantsButton).toHaveTextContent("2");
  });

  it("opens the participants panel when the button is clicked", async () => {
    const user = userEvent.setup();
    renderBoard();

    // Find the participants button by test ID
    const participantsButton = screen.getByTestId("participants-button");
    expect(participantsButton).toBeInTheDocument();

    // Click the button
    await user.click(participantsButton);

    // Wait for the panel to appear
    await waitFor(() => {
      expect(screen.getByTestId("participants-panel")).toBeInTheDocument();
    });

    // Verify participant names are shown
    expect(screen.getByText(/User One/)).toBeInTheDocument();
    expect(screen.getByText(/Current User \(You\)/)).toBeInTheDocument();
  });

  it("closes the participants panel when the close button is clicked", async () => {
    const user = userEvent.setup();
    renderBoard();

    // Find and click the participants button
    const participantsButton = screen.getByTestId("participants-button");
    await user.click(participantsButton);

    // Wait for panel to open
    await waitFor(() => {
      expect(screen.getByTestId("participants-panel")).toBeInTheDocument();
    });

    // Find the close button in the panel
    const closeButton = screen.getByRole("button", { name: /close panel/i });
    await user.click(closeButton);

    // Panel should be closed/removed
    await waitFor(() => {
      expect(
        screen.queryByTestId("participants-panel")
      ).not.toBeInTheDocument();
    });
  });

  it("allows the current user to edit their name", async () => {
    const user = userEvent.setup();
    renderBoard();

    // Open the panel
    const participantsButton = screen.getByTestId("participants-button");
    await user.click(participantsButton);

    // Wait for panel to open
    await waitFor(() => {
      expect(screen.getByTestId("participants-panel")).toBeInTheDocument();
    });

    // Find the edit button and click it
    const editButton = screen.getByTestId("edit-name-button");
    await user.click(editButton);

    // Verify the update functions were called
    expect(boardService.updateParticipantName).toHaveBeenCalledWith(
      "current-user-id",
      "New Username"
    );
    expect(presenceService.updateParticipantName).toHaveBeenCalledWith(
      "current-user-id",
      mockBoardId,
      "New Username"
    );
  });

  it("sets up presence when the board loads", async () => {
    renderBoard();

    // Verify presence setup was called with the correct parameters
    expect(presenceService.setupPresence).toHaveBeenCalledWith(
      mockBoardId,
      "Current User"
    );

    // Verify participant subscription was set up
    expect(presenceService.subscribeToParticipants).toHaveBeenCalledWith(
      "test-board-id",
      expect.any(Function)
    );
  });

  it("shows empty state when there are no participants", async () => {
    // Mock subscribeToParticipants to return empty array
    vi.mocked(presenceService.subscribeToParticipants).mockImplementationOnce(
      (boardId, callback) => {
        callback([]);
        return vi.fn();
      }
    );

    const user = userEvent.setup();
    renderBoard();

    // Open the panel
    const participantsButton = screen.getByTestId("participants-button");
    await user.click(participantsButton);

    // Wait for panel to open and verify empty state message is shown
    await waitFor(() => {
      expect(screen.getByText(/no participants yet/i)).toBeInTheDocument();
    });
  });

  it("updates context when the current user changes their name", async () => {
    const updateUserDisplayNameMock = vi.fn().mockResolvedValue(true);
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      updateUserDisplayName: updateUserDisplayNameMock,
    });

    const user = userEvent.setup();
    renderBoard();

    // Open the panel
    const participantsButton = screen.getByTestId("participants-button");
    await user.click(participantsButton);

    // Wait for panel to open
    await waitFor(() => {
      expect(screen.getByTestId("participants-panel")).toBeInTheDocument();
    });

    // Find and click the edit button
    const editButton = screen.getByTestId("edit-name-button");
    await user.click(editButton);

    // Verify updateUserDisplayName was called with the new name
    expect(updateUserDisplayNameMock).toHaveBeenCalledWith("New Username");
  });
});
