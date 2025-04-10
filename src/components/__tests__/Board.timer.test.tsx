import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { User as FirebaseUser } from 'firebase/auth';
import { Timestamp, updateDoc } from 'firebase/firestore';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFirebase } from '../../contexts/useFirebase';
import * as boardService from '../../services/boardService';
import type { Board as BoardType } from '../../services/firebase';
import Board from '../Board';

const createMockDocSnap = (exists = true, data: Record<string, unknown> = {}) => ({
  exists: () => exists,
  data: () => data,
  id: 'test-doc-id',
});

const createMockTimestamp = (milliseconds?: number) => {
  const timestamp = milliseconds ?? Date.now();
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

vi.mock('../../services/firebase', () => {
  return {
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
  };
});

vi.mock('../../services/boardService', () => {
  return {
    subscribeToBoard: vi.fn(() => vi.fn()),
    subscribeToCards: vi.fn(() => vi.fn()),
    startTimer: vi.fn(() => Promise.resolve()),
    pauseTimer: vi.fn(() => Promise.resolve()),
    resetTimer: vi.fn(() => Promise.resolve()),
    joinBoard: vi.fn(() => Promise.resolve({ success: true, name: 'Test User' })),
  };
});

vi.mock('../../contexts/useFirebase', () => ({
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
  facilitatorId: 'test-user-id',
};

vi.mock('../../services/presenceService', () => {
  const cleanupFn = function cleanupPresence() {
    // Cleanup implementation
  };

  return {
    setupPresence: vi.fn(() => {
      return cleanupFn; // Just return the function directly
    }),
    subscribeToParticipants: vi.fn((_boardId, callback) => {
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
      return vi.fn();
    }),
    updateParticipantName: vi.fn().mockResolvedValue(undefined),
  };
});

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('Timer Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDocExists = true;
    mockDocData = { name: 'Test Board' };

    // Mock console methods to prevent cluttering test output
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.mocked(useFirebase).mockReturnValue({
      user: {} as FirebaseUser,
      loading: false,
      error: null,
    });

    vi.mocked(boardService.subscribeToBoard).mockImplementation((_boardId, callback) => {
      act(() => {
        callback(mockBoard);
      });
      return vi.fn();
    });

    vi.mocked(boardService.subscribeToCards).mockImplementation((_boardId, callback) => {
      act(() => {
        callback([]);
      });
      return vi.fn();
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks(); // Restore console mocks
  });

  it('handles timer controls correctly (start, pause, reset)', async () => {
    const user = userEvent.setup();
    let boardCallback: (board: BoardType | null) => void = () => {};
    vi.mocked(boardService.subscribeToBoard).mockImplementation((_, callback) => {
      boardCallback = callback;
      act(() => callback(mockBoard));
      return vi.fn();
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const playButton = screen.getByRole('button', { name: /start timer/i });
    await user.click(playButton);
    expect(boardService.startTimer).toHaveBeenCalledWith('test-board-id', mockBoard);

    const runningBoard = {
      ...mockBoard,
      timerIsRunning: true,
      timerStartTime: Timestamp.now(),
    };
    act(() => boardCallback(runningBoard));

    const pauseButton = screen.getByRole('button', { name: /pause timer/i });
    await user.click(pauseButton);
    expect(boardService.pauseTimer).toHaveBeenCalledWith('test-board-id', runningBoard);

    const pausedBoard = {
      ...runningBoard,
      timerIsRunning: false,
      timerPausedDurationSeconds: 299,
    };
    act(() => boardCallback(pausedBoard));

    // Clear reset timer mock to ensure we can check it's called
    vi.mocked(boardService.resetTimer).mockClear();
    
    const resetButton = screen.getByRole('button', { name: /reset timer/i });
    await act(async () => {
      await user.click(resetButton);
    });
    
    // Verify resetTimer was called with the right parameters
    expect(boardService.resetTimer).toHaveBeenCalledWith('test-board-id', 300);

    act(() => boardCallback(mockBoard));
  });

  it('displays the correct time when timer is running', async () => {
    vi.useFakeTimers();
    const startTime = Date.now();
    const runningBoard = {
      ...mockBoard,
      timerIsRunning: true,
      timerStartTime: Timestamp.fromMillis(startTime),
      timerDurationSeconds: 5,
    };

    vi.mocked(boardService.subscribeToBoard).mockImplementation((_, callback) => {
      act(() => callback(runningBoard));
      return vi.fn();
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.getByText('0:05')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('0:03')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('0:01')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('automatically resets the timer when it expires', async () => {
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

    vi.mocked(boardService.subscribeToBoard).mockImplementation((_, callback) => {
      boardCallback = callback;
      act(() => callback(runningBoard));
      return vi.fn();
    });
    vi.mocked(boardService.resetTimer).mockClear();
    vi.mocked(boardService.resetTimer).mockResolvedValue();

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // Verify timer is showing 0:02
    expect(screen.getByText('0:02')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3500);
    });

    expect(boardService.resetTimer).toHaveBeenCalledWith('test-board-id', shortDuration);

    const resetBoard = {
      ...mockBoard,
      timerIsRunning: false,
      timerStartTime: undefined,
      timerDurationSeconds: shortDuration,
      timerPausedDurationSeconds: shortDuration,
    };
    act(() => boardCallback(resetBoard));

    // After reset, we should see the span showing 0:02
    expect(screen.getByText('0:02')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('handles error during automatic timer reset', async () => {
    vi.useFakeTimers();
    const startTime = Date.now();
    const shortDuration = 1;
    const runningBoard = {
      ...mockBoard,
      timerIsRunning: true,
      timerStartTime: Timestamp.fromMillis(startTime),
      timerDurationSeconds: shortDuration,
    };
    const resetError = new Error('Failed to auto-reset');
    vi.mocked(boardService.resetTimer).mockRejectedValue(resetError);

    vi.mocked(boardService.subscribeToBoard).mockImplementation((_, callback) => {
      act(() => callback(runningBoard));
      return vi.fn();
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });

    expect(boardService.resetTimer).toHaveBeenCalledWith('test-board-id', shortDuration);
    expect(vi.mocked(console.error)).toHaveBeenCalledWith(
      'Error auto-resetting timer:',
      resetError
    );

    expect(screen.getByText('0:00')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('handles resetting timer after running', async () => {
    const user = userEvent.setup();

    // Clear the mock and create a new one
    vi.mocked(boardService.resetTimer).mockClear();
    const resetTimerMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(boardService.resetTimer).mockImplementation(resetTimerMock);

    const testBoard = {
      ...mockBoard,
      id: 'test-board-id',
      timerDurationSeconds: 300,
      timerIsRunning: false,
    };

    vi.mocked(boardService.subscribeToBoard).mockImplementation((_, callback) => {
      act(() => callback(testBoard));
      return vi.fn();
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const resetButton = screen.getByRole('button', { name: /reset timer/i });
    expect(resetButton).toBeInTheDocument();

    await act(async () => {
      await user.click(resetButton);
    });

    expect(resetTimerMock).toHaveBeenCalledWith('test-board-id', 300);
  });

  it('handles editing timer duration when paused', async () => {
    const user = userEvent.setup();
    let boardCallback: (board: BoardType | null) => void;

    // Clear the mock first
    vi.mocked(boardService.resetTimer).mockClear();
    vi.mocked(boardService.resetTimer).mockResolvedValue();

    const pausedBoard = {
      ...mockBoard,
      timerIsRunning: false,
      timerPausedDurationSeconds: 120,
      timerDurationSeconds: 120,
      timerOriginalDurationSeconds: 120,
    };

    vi.mocked(boardService.subscribeToBoard).mockImplementation((_, callback) => {
      boardCallback = callback;
      act(() => {
        callback(pausedBoard);
      });
      return vi.fn();
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // First, check that the display shows the time
    const timerDisplay = screen.getByText('2:00');
    expect(timerDisplay).toBeInTheDocument();
    expect(timerDisplay.tagName).toBe('SPAN');

    // Click on the timer to make it editable
    await user.click(timerDisplay);

    // Now we should have an input
    const timerInput = screen.getByDisplayValue('2:00');
    expect(timerInput).toBeInTheDocument();
    expect(timerInput.tagName).toBe('INPUT');

    await user.clear(timerInput);
    await user.type(timerInput, '3:30');

    vi.mocked(updateDoc).mockResolvedValue();
    await act(async () => {
      fireEvent.keyDown(timerInput, { key: 'Enter' });
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

    // After updating, timer should be in display mode with the new value
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('3:30')).toBeInTheDocument();

    // Make sure resetTimer mock is cleared
    vi.mocked(boardService.resetTimer).mockClear();
    
    const resetButton = screen.getByRole('button', { name: /reset timer/i });
    expect(resetButton).toBeInTheDocument();

    await act(async () => {
      await user.click(resetButton);
    });

    expect(boardService.resetTimer).toHaveBeenCalledWith('test-board-id', 210);
  });

  it('prevents saving edited time when timer is running', async () => {
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
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const timerDisplay = screen.getByText('5:00');
    expect(timerDisplay).toBeInTheDocument();
    expect(timerDisplay.tagName).toBe('SPAN'); // Ensure it's not an input

    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled();
  });

  it('reverts timer input to last valid time on invalid entry (Enter)', async () => {
    const user = userEvent.setup();
    const pausedBoard = { ...mockBoard, timerPausedDurationSeconds: 120 };
    vi.mocked(boardService.subscribeToBoard).mockImplementation((_, cb) => {
      act(() => cb(pausedBoard));
      return vi.fn();
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // First click on the timer to make it editable
    const timerDisplay = screen.getByText('2:00');
    await user.click(timerDisplay);
    
    const timerInput = screen.getByDisplayValue('2:00');
    await user.clear(timerInput);
    await user.type(timerInput, 'abc');
    fireEvent.keyDown(timerInput, { key: 'Enter' });

    // After Enter, it should go back to span mode with the last valid value
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('2:00')).toBeInTheDocument();
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled();
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith('Invalid time format entered:', 'abc');
  });

  it('reverts timer input to last valid time on invalid entry (Blur)', async () => {
    const user = userEvent.setup();
    const pausedBoard = { ...mockBoard, timerPausedDurationSeconds: 120 };
    vi.mocked(boardService.subscribeToBoard).mockImplementation((_, cb) => {
      act(() => cb(pausedBoard));
      return vi.fn();
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // First click on the timer to make it editable
    const timerDisplay = screen.getByText('2:00');
    await user.click(timerDisplay);

    const timerInput = screen.getByDisplayValue('2:00');
    await user.clear(timerInput);
    await user.type(timerInput, '5:60');
    await act(async () => {
      fireEvent.blur(timerInput);
    });

    // After blur, it should go back to span mode with the last valid value
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('2:00')).toBeInTheDocument();
    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled();
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith('Invalid time format entered:', '5:60');
  });

  it('reverts timer input on Escape key press', async () => {
    const user = userEvent.setup();
    const pausedBoard = { ...mockBoard, timerPausedDurationSeconds: 120 };
    vi.mocked(boardService.subscribeToBoard).mockImplementation((_, cb) => {
      act(() => cb(pausedBoard));
      return vi.fn();
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // First click on the timer to make it editable
    const timerDisplay = screen.getByText('2:00');
    await user.click(timerDisplay);

    const timerInput = screen.getByDisplayValue('2:00');
    await user.clear(timerInput);
    await user.type(timerInput, '3:30');
    expect(timerInput).toHaveValue('3:30');

    fireEvent.keyDown(timerInput, { key: 'Escape' });

    // After Escape, it should go back to span mode with the last valid value
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('2:00')).toBeInTheDocument();
  });

  it('does not save timer on blur if focus moves to a timer control button', async () => {
    const user = userEvent.setup();
    const pausedBoard = { ...mockBoard, timerPausedDurationSeconds: 120 };
    vi.mocked(boardService.subscribeToBoard).mockImplementation((_, cb) => {
      act(() => cb(pausedBoard));
      return vi.fn();
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // First click on the timer to make it editable
    const timerDisplay = screen.getByText('2:00');
    await user.click(timerDisplay);

    const timerInput = screen.getByDisplayValue('2:00');
    const playButton = screen.getByRole('button', { name: /start timer/i });

    await user.clear(timerInput);
    await user.type(timerInput, '4:00');

    // Create a proper FocusEvent with relatedTarget
    await act(async () => {
      const focusEvent = new FocusEvent('blur', {
        bubbles: true,
        cancelable: true,
        relatedTarget: playButton
      });
      timerInput.dispatchEvent(focusEvent);
    });

    expect(vi.mocked(updateDoc)).not.toHaveBeenCalled();
    
    // The input should still be visible, not turning back to span yet
    expect(timerInput).toBeInTheDocument();
  });

  it('resets timer to the last saved duration', async () => {
    const user = userEvent.setup();
    let boardCallback: (board: BoardType | null) => void = () => {};

    // Clear the mocks
    vi.mocked(boardService.startTimer).mockClear();
    vi.mocked(boardService.pauseTimer).mockClear();
    vi.mocked(boardService.resetTimer).mockClear();
    
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

    vi.mocked(boardService.subscribeToBoard).mockImplementation((_, callback) => {
      boardCallback = callback;
      act(() => callback(initialPausedBoard));
      return vi.fn();
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // First click on the timer to make it editable
    const timerDisplay = screen.getByText('5:00');
    await user.click(timerDisplay);

    const timerInput = screen.getByDisplayValue('5:00');
    await user.clear(timerInput);
    await user.type(timerInput, '2:00');

    vi.mocked(updateDoc).mockResolvedValue();
    await act(async () => {
      fireEvent.keyDown(timerInput, { key: 'Enter' });
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

    // Timer should now be in display mode with the new value
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('2:00')).toBeInTheDocument();

    const playButton = screen.getByRole('button', { name: /start timer/i });
    await user.click(playButton);
    expect(boardService.startTimer).toHaveBeenCalledWith('test-board-id', savedBoardState);

    const runningBoardState = {
      ...savedBoardState,
      timerIsRunning: true,
      timerStartTime: Timestamp.now(),
      timerPausedDurationSeconds: undefined,
      timerOriginalDurationSeconds: 120,
    };
    act(() => boardCallback(runningBoardState));

    // Timer should be displaying time without edit mode
    expect(screen.getByText('2:00')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    const pauseButton = screen.getByRole('button', { name: /pause timer/i });
    await user.click(pauseButton);
    expect(boardService.pauseTimer).toHaveBeenCalledWith('test-board-id', runningBoardState);

    const pausedBoardState = {
      ...runningBoardState,
      timerIsRunning: false,
      timerStartTime: undefined,
      timerPausedDurationSeconds: 100,
      timerDurationSeconds: 120,
      timerOriginalDurationSeconds: 120,
    };
    act(() => boardCallback(pausedBoardState));

    // Timer should be in display mode with the paused value
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('1:40')).toBeInTheDocument();

    // Clear resetTimer mock
    vi.mocked(boardService.resetTimer).mockClear();
    
    const resetButton = screen.getByRole('button', { name: /reset timer/i });
    await act(async () => {
      await user.click(resetButton);
    });

    expect(boardService.resetTimer).toHaveBeenCalledWith('test-board-id', 120);

    const resetBoardState = {
      ...pausedBoardState,
      timerIsRunning: false,
      timerStartTime: undefined,
      timerPausedDurationSeconds: 120,
      timerDurationSeconds: 120,
      timerOriginalDurationSeconds: 120,
    };
    act(() => boardCallback(resetBoardState));

    // After reset, timer should be in display mode with the reset value
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('2:00')).toBeInTheDocument();
  });

  it('resets timer correctly when paused after running twice', async () => {
    const user = userEvent.setup();
    let boardCallback: (board: BoardType | null) => void = () => {};

    // Clear mocks
    vi.mocked(boardService.resetTimer).mockClear();
    const resetTimerMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(boardService.resetTimer).mockImplementation(resetTimerMock);

    vi.mocked(boardService.startTimer).mockClear();
    vi.mocked(boardService.pauseTimer).mockClear();
    vi.mocked(boardService.startTimer).mockResolvedValue();
    vi.mocked(boardService.pauseTimer).mockResolvedValue();

    const initialPausedBoard = {
      ...mockBoard,
      timerIsRunning: false,
      timerPausedDurationSeconds: 300,
      timerDurationSeconds: 300,
      timerOriginalDurationSeconds: 300,
    };

    vi.mocked(boardService.subscribeToBoard).mockImplementation((_, callback) => {
      boardCallback = callback;
      act(() => callback(initialPausedBoard));
      return vi.fn();
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/boards/test-board-id']}>
          <Routes>
            <Route path="/boards/:boardId" element={<Board />} />
          </Routes>
        </MemoryRouter>
      );
    });

    // First click on the timer to make it editable
    const timerDisplay = screen.getByText('5:00');
    await user.click(timerDisplay);

    const timerInput = screen.getByDisplayValue('5:00');
    await user.clear(timerInput);
    await user.type(timerInput, '2:00');

    vi.mocked(updateDoc).mockResolvedValue();
    await act(async () => {
      fireEvent.keyDown(timerInput, { key: 'Enter' });
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

    // Timer should be in display mode with the new value
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('2:00')).toBeInTheDocument();

    const playButton = screen.getByRole('button', { name: /start timer/i });
    await user.click(playButton);
    expect(boardService.startTimer).toHaveBeenCalledWith('test-board-id', savedBoardState);

    const runningBoardState = {
      ...savedBoardState,
      timerIsRunning: true,
      timerStartTime: Timestamp.now(),
      timerPausedDurationSeconds: undefined,
      timerDurationSeconds: 120,
      timerOriginalDurationSeconds: 120,
    };
    act(() => boardCallback(runningBoardState));

    const pauseButton = screen.getByRole('button', { name: /pause timer/i });
    await user.click(pauseButton);
    expect(boardService.pauseTimer).toHaveBeenCalledWith('test-board-id', runningBoardState);

    const firstPausedState = {
      ...runningBoardState,
      timerIsRunning: false,
      timerStartTime: undefined,
      timerPausedDurationSeconds: 118,
      timerDurationSeconds: 120,
      timerOriginalDurationSeconds: 120,
    };
    act(() => boardCallback(firstPausedState));

    // Timer should be in display mode with the paused value
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('1:58')).toBeInTheDocument();

    await user.click(playButton);
    expect(boardService.startTimer).toHaveBeenCalledWith('test-board-id', firstPausedState);

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
    expect(boardService.pauseTimer).toHaveBeenCalledWith('test-board-id', secondRunningState);

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

    // Timer should be in display mode with the new paused value
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('1:53')).toBeInTheDocument();

    const resetButton = screen.getByRole('button', { name: /reset timer/i });
    await act(async () => {
      await user.click(resetButton);
    });

    expect(resetTimerMock).toHaveBeenCalledWith('test-board-id', 120);

    const resetBoardState = {
      ...secondPausedState,
      timerIsRunning: false,
      timerStartTime: undefined,
      timerPausedDurationSeconds: 120,
      timerDurationSeconds: 120,
      timerOriginalDurationSeconds: 120,
    };
    act(() => boardCallback(resetBoardState));

    // After reset, timer should be in display mode with the reset value
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('2:00')).toBeInTheDocument();
  });
});
