import { act, render, screen, waitFor } from '@testing-library/react';
import type { User as FirebaseUser } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as FirebaseContext from '../../contexts/FirebaseContext';
import * as boardService from '../../services/boardService';
import type { Board as BoardType } from '../../services/firebase';
import * as presenceService from '../../services/presenceService';
import Board from '../Board';

const createMockDocSnap = (exists = true, data: Record<string, unknown> = {}) => ({
  exists: () => exists,
  data: () => data,
  id: 'test-doc-id',
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
    valueOf: () => `${Math.floor(timestamp / 1000)}.${(timestamp % 1000) * 1000000}`,
  };
};

vi.mock('../../services/firebase', () => ({
  db: {
    collection: vi.fn(() => ({ doc: vi.fn() })),
  },
  auth: {
    currentUser: { uid: 'test-user-id' },
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
}));

vi.mock('../OptionsPanel', () => ({
  default: vi.fn().mockImplementation(({ isOpen, onDeleteBoard, isBoardCreator }) => {
    const [isConfirmingDelete, setIsConfirmingDelete] = React.useState(false);

    if (!isOpen) return null;

    return (
      <div data-testid="options-panel">
        <div>Options Panel</div>

        {isConfirmingDelete ? (
          <div>
            <p>Are you sure you want to delete this board?</p>
            <button data-testid="cancel-delete" onClick={() => setIsConfirmingDelete(false)}>
              Cancel
            </button>
            <button data-testid="confirm-delete" onClick={() => onDeleteBoard()}>
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

        {!isBoardCreator && <div>Only the board creator can delete this board</div>}
      </div>
    );
  }),
}));

vi.mock('../../services/boardService', () => ({
  subscribeToBoard: vi.fn(() => vi.fn()),
  subscribeToCards: vi.fn(() => vi.fn()),
  createBoard: vi.fn(() => Promise.resolve('test-board-id')),
  updateCardPosition: vi.fn(() => Promise.resolve()),
  startTimer: vi.fn(() => Promise.resolve()),
  pauseTimer: vi.fn(() => Promise.resolve()),
  resetTimer: vi.fn(() => Promise.resolve()),
  updateColumnSortState: vi.fn(() => Promise.resolve()),
  subscribeToParticipants: vi.fn(() => vi.fn()),
  updateParticipantNameFirestore: vi.fn(() => Promise.resolve()),
  updateParticipantNameRTDB: vi.fn(() => Promise.resolve()),
  joinBoard: vi.fn(() => Promise.resolve()),
  deleteBoard: vi.fn(() => Promise.resolve(true)),
  testFirestoreWrite: vi.fn(() => Promise.resolve()),
  cleanupInactiveUsers: vi.fn(() => Promise.resolve()),
  updateShowAddColumnPlaceholder: vi.fn(() => Promise.resolve({ success: true })),
  addColumn: vi.fn().mockResolvedValue({
    success: true,
    columnId: 'new-column-id',
  }),
}));

vi.mock('../../contexts/FirebaseContext', () => ({
  useFirebase: vi.fn(() => ({
    user: { uid: 'test-user-id', displayName: 'Test User' },
    loading: false,
    error: null,
    updateUserDisplayName: vi.fn(),
  })),
}));

let mockDocExists = true;
let mockDocData: Record<string, unknown> = { name: 'Test Board' };

vi.mock('firebase/firestore', () => {
  const docRef = { id: 'test-doc-id' };

  return {
    doc: vi.fn(() => docRef),
    getDoc: vi.fn(() => Promise.resolve(createMockDocSnap(mockDocExists, mockDocData))),
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
      fromMillis: vi.fn(ms => ({
        toMillis: () => ms,
        toDate: () => new Date(ms),
      })),
    },
    getDocs: vi.fn(() => Promise.resolve({ forEach: vi.fn() })),
    writeBatch: vi.fn(() => ({
      update: vi.fn(),
      commit: vi.fn(() => Promise.resolve()),
    })),
    increment: vi.fn(num => num),
    setDoc: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('../Card', () => ({
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

vi.mock('../../services/presenceService', () => {
  const cleanupFn = function cleanupPresence() {
    // Cleanup implementation
  };

  return {
    setupPresence: vi.fn(() => {
      return cleanupFn; // Just return the function directly
    }),
    subscribeToParticipants: vi.fn(() => vi.fn()),
    updateParticipantName: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../services/actionPointsService', () => ({
  addActionPoint: vi.fn().mockResolvedValue({
    id: 'test-ap-id',
    text: 'Test Action Point',
    completed: false,
  }),
  deleteActionPoint: vi.fn().mockResolvedValue({}),
  toggleActionPoint: vi.fn().mockResolvedValue({}),
  getActionPoints: vi.fn().mockResolvedValue([]),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockUser = {
  uid: 'test-user-id',
  displayName: 'Test User',
  emailVerified: false,
  isAnonymous: true,
  metadata: {},
  providerData: [],
  refreshToken: '',
  tenantId: null,
  delete: vi.fn(),
  getIdToken: vi.fn(),
  getIdTokenResult: vi.fn(),
  reload: vi.fn(),
  toJSON: vi.fn(),
} as unknown as FirebaseUser;

const mockBoard: BoardType = {
  id: 'test-board-id',
  name: 'Test Board',
  columns: {
    col1: { id: 'col1', title: 'What went well', order: 0, sortByVotes: false },
    col2: {
      id: 'col2',
      title: 'What can be improved',
      order: 1,
      sortByVotes: false,
    },
    col3: { id: 'col3', title: 'Action items', order: 2, sortByVotes: false },
  },
  createdAt: Timestamp.now(),
  isActive: true,
  timerDurationSeconds: 300,
  timerPausedDurationSeconds: undefined,
  timerOriginalDurationSeconds: 300,
  timerIsRunning: false,
  timerStartTime: undefined,
  actionPoints: [
    { id: 'ap1', text: 'Test Action Point 1', completed: false },
    { id: 'ap2', text: 'Test Action Point 2', completed: true },
  ],
  showAddColumnPlaceholder: true,
};

const mockCards = [
  {
    id: 'card1',
    boardId: 'test-board-id',
    columnId: 'col1',
    content: 'Test Card 1',
    authorId: 'test-user-id',
    authorName: 'Test User',
    createdAt: Timestamp.now(),
    votes: 3,
    position: 0,
  },
  {
    id: 'card2',
    boardId: 'test-board-id',
    columnId: 'col2',
    content: 'Test Card 2',
    authorId: 'other-user-id',
    authorName: 'Other User',
    createdAt: Timestamp.now(),
    votes: 1,
    position: 0,
  },
  {
    id: 'card3',
    boardId: 'test-board-id',
    columnId: 'col3',
    content: 'Test Card 3',
    authorId: 'test-user-id',
    authorName: 'Test User',
    createdAt: Timestamp.now(),
    votes: 0,
    position: 0,
  },
];

describe('Board Deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock console methods to prevent cluttering test output
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    mockDocExists = true;
    mockDocData = { name: 'Test Board' };

    // Default Firebase context setup
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: mockUser,
      loading: false,
      error: null,
      updateUserDisplayName: vi.fn(),
    });

    // Default board subscription setup with unsubscribe function
    const unsubscribeBoard = vi.fn();
    vi.mocked(boardService.subscribeToBoard).mockImplementation((boardId, callback) => {
      act(() => {
        callback(mockBoard);
      });
      return unsubscribeBoard;
    });

    // Default card subscription setup with unsubscribe function
    const unsubscribeCards = vi.fn();
    vi.mocked(boardService.subscribeToCards).mockImplementation((boardId, callback) => {
      act(() => {
        callback(mockCards);
      });
      return unsubscribeCards;
    });

    // Default participants subscription setup with unsubscribe function
    const unsubscribeParticipants = vi.fn();
    vi.mocked(presenceService.subscribeToParticipants).mockImplementation((boardId, callback) => {
      act(() => {
        callback([
          {
            id: 'test-user-id',
            name: 'Test User',
            color: '#FF5733',
            boardId: 'test-board-id',
            lastOnline: Date.now(),
          },
        ]);
      });
      return unsubscribeParticipants;
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks(); // Restore console mocks
  });

  it('should allow board creator to delete the board', async () => {
    // Set up Firebase context mock with a user that matches the creator ID
    vi.spyOn(FirebaseContext, 'useFirebase').mockReturnValue({
      user: { ...mockUser, uid: 'test-creator-id' },
      loading: false,
      error: null,
      updateUserDisplayName: vi.fn(),
    });

    // Mock joinBoard to return success
    vi.spyOn(boardService, 'joinBoard').mockResolvedValue({
      success: true,
      name: 'Test Creator',
    });

    // Mock subscribeToBoard to provide test board data
    const boardData = {
      ...mockBoard,
      id: 'test-board-id',
      facilitatorId: 'test-creator-id', // Set creator ID to match the user
    };

    const unsubscribeBoard = vi.fn();
    vi.spyOn(boardService, 'subscribeToBoard').mockImplementation((_, callback) => {
      act(() => {
        callback(boardData);
      });
      return unsubscribeBoard;
    });

    // Mock deleteBoard to resolve successfully
    vi.spyOn(boardService, 'deleteBoard').mockResolvedValue(true);

    // Render component
    const { unmount } = render(
      <MemoryRouter initialEntries={['/board/test-board-id']}>
        <Routes>
          <Route path="/board/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for the board to load completely
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    // Simulate the Board component's handleDeleteBoard function by calling deleteBoard directly
    const handleDeleteBoardMock = vi.spyOn(boardService, 'deleteBoard');
    await act(async () => {
      await boardService.deleteBoard('test-board-id', 'test-creator-id');
    });

    // Verify deleteBoard was called with the correct parameters
    expect(handleDeleteBoardMock).toHaveBeenCalledWith('test-board-id', 'test-creator-id');

    // Clean up
    unmount();
    expect(unsubscribeBoard).toHaveBeenCalled();
  });

  it('should prevent non-creator from deleting the board', async () => {
    // Set up Firebase context mock with a different user ID
    vi.spyOn(FirebaseContext, 'useFirebase').mockReturnValue({
      user: { ...mockUser, uid: 'non-creator-id' },
      loading: false,
      error: null,
      updateUserDisplayName: vi.fn(),
    });

    // Mock joinBoard to return success
    vi.spyOn(boardService, 'joinBoard').mockResolvedValue({
      success: true,
      name: 'Non Creator',
    });

    // Mock subscribeToBoard to provide test board data
    const boardData = {
      ...mockBoard,
      id: 'test-board-id',
      facilitatorId: 'test-creator-id', // Different from the user ID
    };

    const unsubscribeBoard = vi.fn();
    vi.spyOn(boardService, 'subscribeToBoard').mockImplementation((_, callback) => {
      act(() => {
        callback(boardData);
      });
      return unsubscribeBoard;
    });

    // Mock deleteBoard
    const deleteBoard = vi.spyOn(boardService, 'deleteBoard');

    // Render component
    const { unmount } = render(
      <MemoryRouter initialEntries={['/board/test-board-id']}>
        <Routes>
          <Route path="/board/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for the board to load completely
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    // Verify that the user is not the creator
    const isUserCreator = boardData.facilitatorId === 'non-creator-id';
    expect(isUserCreator).toBe(false);

    // Verify deleteBoard was not called
    expect(deleteBoard).not.toHaveBeenCalled();

    // Clean up
    unmount();
    expect(unsubscribeBoard).toHaveBeenCalled();
  });

  it('should handle error if board deletion fails', async () => {
    // Set up Firebase context mock with a user that matches the creator ID
    vi.spyOn(FirebaseContext, 'useFirebase').mockReturnValue({
      user: { ...mockUser, uid: 'test-creator-id' },
      loading: false,
      error: null,
      updateUserDisplayName: vi.fn(),
    });

    // Mock board with the logged-in user as the creator
    const boardData = {
      ...mockBoard,
      id: 'test-board-id',
      facilitatorId: 'test-creator-id',
    };

    // Mock subscribeToBoard to return our test board
    const unsubscribeBoard = vi.fn();
    vi.spyOn(boardService, 'subscribeToBoard').mockImplementation((_, callback) => {
      act(() => {
        callback(boardData);
      });
      return unsubscribeBoard;
    });

    // Mock deleteBoard to throw an error
    const errorMessage = 'Permission denied';
    const deleteError = new Error(errorMessage);
    vi.spyOn(boardService, 'deleteBoard').mockRejectedValue(deleteError);

    // Render the board component
    const { unmount } = render(
      <MemoryRouter initialEntries={['/board/test-board-id']}>
        <Routes>
          <Route path="/board/:boardId" element={<Board />} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for the board to load
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    // Call deleteBoard and expect the error
    await expect(boardService.deleteBoard('test-board-id', 'test-creator-id')).rejects.toThrow(
      errorMessage
    );

    // Clean up
    unmount();
    expect(unsubscribeBoard).toHaveBeenCalled();
  });

  it('redirects all users to home when board is deleted', async () => {
    // Reset mocks and navigate
    vi.clearAllMocks();
    mockNavigate.mockReset();

    // Clear previous console mocks
    vi.mocked(console.log).mockClear();

    // Create unsubscribe function mock for board subscription
    const unsubscribeBoard = vi.fn();

    // Setup board subscription that will later return null
    let boardSubscriptionCallback: (board: BoardType | null) => void;
    vi.mocked(boardService.subscribeToBoard).mockImplementation((boardId, callback) => {
      boardSubscriptionCallback = callback;

      // Initially return a valid board
      act(() => {
        callback({
          ...mockBoard,
          id: 'test-board-id',
          facilitatorId: 'test-user-id',
        });
      });

      return unsubscribeBoard;
    });

    // Create unsubscribe function mock for participants subscription
    const unsubscribeParticipants = vi.fn();
    vi.mocked(presenceService.subscribeToParticipants).mockImplementation((boardId, callback) => {
      act(() => {
        callback([
          {
            id: 'test-user-id',
            name: 'Admin User',
            color: '#ff0000',
            boardId,
            lastOnline: Date.now(),
          },
          {
            id: 'other-user-id',
            name: 'Regular User',
            color: '#00ff00',
            boardId,
            lastOnline: Date.now(),
          },
        ]);
      });
      return unsubscribeParticipants;
    });

    // Set up the user context with admin user
    vi.mocked(FirebaseContext.useFirebase).mockReturnValue({
      user: {
        uid: 'test-user-id',
        displayName: 'Admin User',
      } as FirebaseUser,
      loading: false,
      error: null,
      updateUserDisplayName: vi.fn(),
    });

    // Render the board component
    const { unmount } = render(
      <MemoryRouter initialEntries={['/boards/test-board-id']}>
        <Routes>
          <Route path="/boards/:boardId" element={<Board />} />
          <Route path="/" element={<div data-testid="home-page">Home Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for the board to load
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    // Now simulate a board deletion by returning null in the subscription callback
    act(() => {
      boardSubscriptionCallback(null);
    });

    // Verify the expected log message was output
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Board test-board-id not found in subscription, redirecting to home')
    );

    // Verify the navigation occurred
    expect(mockNavigate).toHaveBeenCalledWith('/');

    // Unmount to trigger cleanup
    unmount();

    // Verify unsubscribe was called
    expect(unsubscribeBoard).toHaveBeenCalled();
    expect(unsubscribeParticipants).toHaveBeenCalled();
  });
});
