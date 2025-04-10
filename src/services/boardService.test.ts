import { Timestamp } from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import * as boardService from './boardService';
import { Board } from './firebase';

interface MockDoc {
  id?: string;
  data?: () => { [key: string]: unknown };
  exists?: () => boolean;
  forEach?: (fn: (doc: CardDoc) => void) => void;
}

interface BatchUpdate {
  update: ReturnType<typeof vi.fn>;
  commit: () => Promise<void>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

interface TimerUpdate {
  timerPausedDurationSeconds: number;
}

type CardDoc = {
  id: string;
  ref?: { id: string };
  data: () => { content: string; boardId: string; columnId: string; position: number };
};

interface DeleteBoardData {
  facilitatorId: string;
  name: string;
}

interface BoardSnapshot {
  exists: ReturnType<typeof vi.fn>;
  data: ReturnType<typeof vi.fn>;
}

// Mock Firebase
vi.mock('./firebase', () => ({
  db: {},
  Board: class {},
  Card: class {},
}));

// Mock Firestore
const mockDoc = vi.fn(() => ({}));
const mockCollection = vi.fn(() => ({}));
const mockAddDoc = vi.fn().mockImplementation(() => Promise.resolve({ id: 'mock-doc-id' }));
const mockSetDoc = vi.fn(() => Promise.resolve());
const mockUpdateDoc = vi.fn(() => Promise.resolve()) as Mock<
  (ref: unknown, data: TimerUpdate) => Promise<void>
>;
const mockDeleteDoc = vi.fn(() => Promise.resolve());
const mockQuery = vi.fn(() => ({}));
const mockWhere = vi.fn(() => ({}));
const mockServerTimestamp = vi.fn(() => ({ toMillis: () => Date.now() }));
const mockIncrement = vi.fn(val => ({ __increment: val }));
const mockOnSnapshot = vi.fn();
const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();
const mockWriteBatch = vi.fn();

vi.mock('firebase/firestore', () => {
  return {
    doc: (...args: Parameters<typeof mockDoc>) => mockDoc(...args),
    collection: (...args: Parameters<typeof mockCollection>) => mockCollection(...args),
    addDoc: (...args: Parameters<typeof mockAddDoc>) => mockAddDoc(...args),
    setDoc: (...args: Parameters<typeof mockSetDoc>) => mockSetDoc(...args),
    updateDoc: (...args: Parameters<typeof mockUpdateDoc>) => mockUpdateDoc(...args),
    deleteDoc: (...args: Parameters<typeof mockDeleteDoc>) => mockDeleteDoc(...args),
    query: (...args: Parameters<typeof mockQuery>) => mockQuery(...args),
    where: (...args: Parameters<typeof mockWhere>) => mockWhere(...args),
    onSnapshot: (...args: Parameters<typeof mockOnSnapshot>) => mockOnSnapshot(...args),
    getDocs: (...args: Parameters<typeof mockGetDocs>) => mockGetDocs(...args),
    getDoc: (...args: Parameters<typeof mockGetDoc>) => mockGetDoc(...args),
    writeBatch: (...args: Parameters<typeof mockWriteBatch>) => mockWriteBatch(...args),
    serverTimestamp: () => mockServerTimestamp(),
    increment: (val: number) => mockIncrement(val),
    Timestamp: {
      now: () => ({
        seconds: Math.floor(Date.now() / 1000),
        nanoseconds: 0,
        toMillis: () => Date.now(),
      }),
      fromMillis: (ms: number) => ({
        seconds: Math.floor(ms / 1000),
        nanoseconds: (ms % 1000) * 1000000,
        toMillis: () => ms,
      }),
    },
  };
});

describe('boardService', () => {
  let onSnapshotCallback: (doc: MockDoc) => void;
  let batchUpdateMock: BatchUpdate;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up mocks
    mockOnSnapshot.mockImplementation((_, callback) => {
      onSnapshotCallback = callback;
      return vi.fn(); // Unsubscribe function
    });

    batchUpdateMock = {
      update: vi.fn(),
      commit: vi.fn(() => Promise.resolve()),
      set: vi.fn(),
      delete: vi.fn(),
    };

    mockWriteBatch.mockReturnValue(batchUpdateMock);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createBoard', () => {
    it('should create a board with auto-generated ID when no ID is provided', async () => {
      const result = await boardService.createBoard('Test Board', 'user1');

      expect(mockAddDoc).toHaveBeenCalledTimes(1);
      expect(mockAddDoc).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          name: 'Test Board',
          facilitatorId: 'user1',
          isActive: true,
          columns: expect.any(Object),
        })
      );
      expect(result).toBe('mock-doc-id');
    });

    it('should create a board with specific ID when provided', async () => {
      const specificBoardId = 'specific-board-id';

      const result = await boardService.createBoard('Test Board', 'user1', specificBoardId);

      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockDoc).toHaveBeenCalledWith({}, 'boards', specificBoardId);
      expect(result).toBe(specificBoardId);
    });

    it('should create a board with default columns', async () => {
      // Instead of accessing mock.calls directly, set up expectations
      mockAddDoc.mockImplementation((ref, data) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { columns } = data;
        // This will be checked by the expect statements below
        return Promise.resolve({ id: 'mock-doc-id' });
      });
      
      await boardService.createBoard('Test Board');
      
      // Test that mockAddDoc was called with correct columns data
      expect(mockAddDoc).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          columns: {
            col1: { id: 'col1', title: 'What went well', order: 0 },
            col2: { id: 'col2', title: 'What can be improved', order: 1 },
            col3: { id: 'col3', title: 'Action items', order: 2 },
          }
        })
      );
    });
  });

  describe('subscribeToBoard', () => {
    it('should set up a subscription to board updates', () => {
      const boardId = 'board-id';
      const callback = vi.fn();

      const unsubscribe = boardService.subscribeToBoard(boardId, callback);

      expect(mockDoc).toHaveBeenCalledWith({}, 'boards', boardId);
      expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call callback with board data when document exists', () => {
      const boardId = 'board-id';
      const callback = vi.fn();
      const boardData = {
        name: 'Test Board',
        createdAt: Timestamp.now(),
        isActive: true,
        columns: {},
      };

      boardService.subscribeToBoard(boardId, callback);

      // Trigger the onSnapshot callback with mock doc
      onSnapshotCallback({
        id: boardId,
        data: () => boardData,
        exists: () => true,
      });

      expect(callback).toHaveBeenCalledWith({
        id: boardId,
        ...boardData,
      });
    });

    it('should call callback with null when document does not exist', () => {
      const boardId = 'nonexistent-board';
      const callback = vi.fn();

      boardService.subscribeToBoard(boardId, callback);

      // Trigger the onSnapshot callback with non-existent doc
      onSnapshotCallback({
        exists: () => false,
      });

      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  describe('subscribeToCards', () => {
    it('should set up a subscription to cards for a specific board', () => {
      const boardId = 'board-id';
      const callback = vi.fn();

      const unsubscribe = boardService.subscribeToCards(boardId, callback);

      expect(mockCollection).toHaveBeenCalledWith({}, 'cards');
      expect(mockWhere).toHaveBeenCalledWith('boardId', '==', boardId);
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call callback with cards data sorted by position', () => {
      const boardId = 'board-id';
      const callback = vi.fn();

      boardService.subscribeToCards(boardId, callback);

      // Create unsorted cards data
      const cardsData = [
        {
          id: 'card3',
          data: () => ({
            content: 'Card 3',
            boardId,
            columnId: 'col1',
            position: 3000,
          }),
        },
        {
          id: 'card1',
          data: () => ({
            content: 'Card 1',
            boardId,
            columnId: 'col1',
            position: 1000,
          }),
        },
        {
          id: 'card2',
          data: () => ({
            content: 'Card 2',
            boardId,
            columnId: 'col1',
            position: 2000,
          }),
        },
      ];

      // Trigger the onSnapshot callback
      onSnapshotCallback({
        forEach: (fn: (doc: CardDoc) => void) => cardsData.forEach(fn),
      });

      expect(callback).toHaveBeenCalledTimes(1);

      // Check that cards are sorted by position
      const callbackCards = callback.mock.calls[0][0];
      expect(callbackCards).toHaveLength(3);
      expect(callbackCards[0].id).toBe('card1');
      expect(callbackCards[1].id).toBe('card2');
      expect(callbackCards[2].id).toBe('card3');
    });
  });

  describe('addCard', () => {
    it('should add a card to a column with correct data', async () => {
      const boardId = 'board-id';
      const columnId = 'col1';
      const content = 'Card content';
      const authorId = 'user1';
      const authorName = 'User One';

      await boardService.addCard(boardId, columnId, content, authorId, authorName);

      expect(mockCollection).toHaveBeenCalledWith({}, 'cards');
      expect(mockAddDoc).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          boardId,
          columnId,
          content,
          authorId,
          authorName,
          votes: 0,
        })
      );
    });

    it('should use "Anonymous" as default author name if not provided', async () => {
      const boardId = 'board-id';
      const columnId = 'col1';
      const content = 'Card content';
      const authorId = 'user1';

      await boardService.addCard(boardId, columnId, content, authorId);

      expect(mockAddDoc).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          authorName: 'Anonymous',
        })
      );
    });
  });

  describe('updateCardPosition', () => {
    it('should handle card movement within the same column', async () => {
      const boardId = 'board-id';
      const cardId = 'card-id';
      const columnId = 'col1';
      const newIndex = 2;

      // Mock cards in the column
      const cards = [
        { id: 'card1', columnId, position: 1000, boardId, content: '' },
        { id: cardId, columnId, position: 2000, boardId, content: '' },
        { id: 'card3', columnId, position: 3000, boardId, content: '' },
        { id: 'card4', columnId, position: 4000, boardId, content: '' },
      ];

      mockGetDocs.mockResolvedValueOnce({
        forEach: (fn: (doc: CardDoc) => void) => {
          cards.forEach(card => {
            fn({
              id: card.id,
              data: () => card,
            });
          });
        },
      });

      await boardService.updateCardPosition(cardId, columnId, newIndex, columnId, boardId);

      // Should query for all cards in the board
      expect(mockQuery).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalledWith('boardId', '==', boardId);
      expect(mockGetDocs).toHaveBeenCalledTimes(1);

      // Should create a batch
      expect(mockWriteBatch).toHaveBeenCalledTimes(1);

      // Should update positions for cards
      expect(batchUpdateMock.update).toHaveBeenCalled();
      expect(batchUpdateMock.commit).toHaveBeenCalledTimes(1);
    });

    it('should handle card movement between different columns', async () => {
      const boardId = 'board-id';
      const cardId = 'card-id';
      const sourceColumnId = 'col1';
      const destColumnId = 'col2';
      const newIndex = 1;

      // Mock cards in both columns
      const cards = [
        { id: 'card1', columnId: sourceColumnId, position: 1000, boardId, content: '' },
        { id: cardId, columnId: sourceColumnId, position: 2000, boardId, content: '' },
        { id: 'card3', columnId: sourceColumnId, position: 3000, boardId, content: '' },
        { id: 'card4', columnId: destColumnId, position: 1000, boardId, content: '' },
        { id: 'card5', columnId: destColumnId, position: 2000, boardId, content: '' },
      ];

      mockGetDocs.mockResolvedValueOnce({
        forEach: (fn: (doc: CardDoc) => void) => {
          cards.forEach(card => {
            fn({
              id: card.id,
              data: () => card,
            });
          });
        },
      });

      await boardService.updateCardPosition(
        cardId,
        destColumnId,
        newIndex,
        sourceColumnId,
        boardId
      );

      // Should query for all cards in the board
      expect(mockQuery).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalledWith('boardId', '==', boardId);
      expect(mockGetDocs).toHaveBeenCalledTimes(1);

      // Should update column ID for the moved card and positions
      expect(batchUpdateMock.update).toHaveBeenCalledWith(
        {}, // mock doc ref
        expect.objectContaining({ columnId: destColumnId })
      );
      expect(batchUpdateMock.commit).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully', async () => {
      const boardId = 'board-id';
      const cardId = 'card-id';
      const columnId = 'col1';
      const newIndex = 1;

      // Mock getDocs to throw an error
      const error = new Error('Firestore error');
      mockGetDocs.mockRejectedValueOnce(error);

      // Spy on console.error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await boardService.updateCardPosition(cardId, columnId, newIndex, columnId, boardId);

      // Should log the error
      expect(consoleSpy).toHaveBeenCalledWith('Error updating card positions:', error);
      consoleSpy.mockRestore();
    });

    it('should handle case where moved card is not found', async () => {
      const boardId = 'board-id';
      const cardId = 'nonexistent-card';
      const columnId = 'col1';
      const newIndex = 1;

      // Mock cards without the target card
      const cards = [
        { id: 'card1', columnId, position: 1000, boardId, content: '' },
        { id: 'card2', columnId, position: 2000, boardId, content: '' },
      ];

      mockGetDocs.mockResolvedValueOnce({
        forEach: (fn: (doc: CardDoc) => void) => {
          cards.forEach(card => {
            fn({
              id: card.id,
              data: () => card,
            });
          });
        },
      });

      // Spy on console.error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await boardService.updateCardPosition(cardId, columnId, newIndex, columnId, boardId);

      // Should log the error about card not found
      expect(consoleSpy).toHaveBeenCalledWith(`Card with ID ${cardId} not found`);
      consoleSpy.mockRestore();
    });
  });

  describe('updateCard', () => {
    it('should update a card with the specified changes', async () => {
      const cardId = 'card-id';
      const updates = {
        content: 'Updated content',
        votes: 5,
      };

      await boardService.updateCard(cardId, updates);

      expect(mockDoc).toHaveBeenCalledWith({}, 'cards', cardId);
      expect(mockUpdateDoc).toHaveBeenCalledWith({}, updates);
    });
  });

  describe('deleteCard', () => {
    it('should delete a card by ID', async () => {
      const cardId = 'card-id';

      await boardService.deleteCard(cardId);

      expect(mockDoc).toHaveBeenCalledWith({}, 'cards', cardId);
      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    });
  });

  describe('voteForCard', () => {
    it('should increment votes when voting up', async () => {
      const cardId = 'card-id';

      await boardService.voteForCard(cardId, 'up');

      expect(mockDoc).toHaveBeenCalledWith({}, 'cards', cardId);
      expect(mockIncrement).toHaveBeenCalledWith(1);
      expect(mockUpdateDoc).toHaveBeenCalledWith({}, { votes: { __increment: 1 } });
    });

    it('should decrement votes when voting down', async () => {
      const cardId = 'card-id';

      await boardService.voteForCard(cardId, 'down');

      expect(mockDoc).toHaveBeenCalledWith({}, 'cards', cardId);
      expect(mockIncrement).toHaveBeenCalledWith(-1);
      expect(mockUpdateDoc).toHaveBeenCalledWith({}, { votes: { __increment: -1 } });
    });
  });

  describe('startTimer', () => {
    it('should start a new timer with default duration if none exists', async () => {
      const boardId = 'board-id';

      await boardService.startTimer(boardId, null);

      expect(mockDoc).toHaveBeenCalledWith({}, 'boards', boardId);
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        {},
        {
          timerIsRunning: true,
          timerStartTime: expect.anything(),
          timerDurationSeconds: 300,
          timerPausedDurationSeconds: null,
          timerOriginalDurationSeconds: 300,
        }
      );
    });

    it('should resume a paused timer with remaining time', async () => {
      const boardId = 'board-id';
      const currentBoardData = {
        id: boardId,
        name: 'Test Board',
        timerPausedDurationSeconds: 120, // 2 minutes remaining
        timerDurationSeconds: 300,
        timerOriginalDurationSeconds: 300,
        timerIsRunning: false,
      } as Board;

      await boardService.startTimer(boardId, currentBoardData);

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        {},
        {
          timerIsRunning: true,
          timerStartTime: expect.anything(),
          timerDurationSeconds: 120, // Should use paused duration
          timerPausedDurationSeconds: null,
          timerOriginalDurationSeconds: 300,
        }
      );
    });
  });

  describe('pauseTimer', () => {
    it('should pause a running timer and calculate remaining time', async () => {
      const boardId = 'board-id';
      const startTime = new Date(Date.now() - 30000); // Started 30 seconds ago
      const currentBoardData = {
        id: boardId,
        name: 'Test Board',
        timerIsRunning: true,
        timerStartTime: {
          toMillis: () => startTime.getTime(),
        },
        timerDurationSeconds: 300, // 5 minutes
        timerOriginalDurationSeconds: 300,
      } as unknown as Board;

      await boardService.pauseTimer(boardId, currentBoardData);

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          timerIsRunning: false,
          timerPausedDurationSeconds: expect.any(Number), // Should be around 270 seconds
          timerStartTime: null,
          timerOriginalDurationSeconds: 300,
        })
      );

      // Get the actual value sent to Firestore
      const updateArgs = mockUpdateDoc.mock.calls[0]?.[1];
      expect(updateArgs).toBeDefined();
      expect(updateArgs?.timerPausedDurationSeconds).toBeGreaterThanOrEqual(269);
      expect(updateArgs?.timerPausedDurationSeconds).toBeLessThanOrEqual(271);
    });

    it('should handle invalid timer state gracefully', async () => {
      const boardId = 'board-id';
      const invalidBoardData = {
        id: boardId,
        name: 'Test Board',
        timerIsRunning: false, // Not running
      } as Board;

      // Spy on console.warn
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await boardService.pauseTimer(boardId, invalidBoardData);

      // Should not update the board
      expect(mockUpdateDoc).not.toHaveBeenCalled();

      // Should log a warning
      expect(consoleSpy).toHaveBeenCalledWith(
        'Timer cannot be paused, invalid state:',
        invalidBoardData
      );

      consoleSpy.mockRestore();
    });
  });

  describe('resetTimer', () => {
    it('should reset timer to initial state with specified duration', async () => {
      const boardId = 'board-id';
      const initialDuration = 600; // 10 minutes

      await boardService.resetTimer(boardId, initialDuration);

      expect(mockDoc).toHaveBeenCalledWith({}, 'boards', boardId);
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        {},
        {
          timerIsRunning: false,
          timerStartTime: null,
          timerPausedDurationSeconds: initialDuration,
          timerDurationSeconds: initialDuration,
          timerOriginalDurationSeconds: initialDuration,
        }
      );
    });

    it('should use default duration (300s) if not specified', async () => {
      const boardId = 'board-id';

      await boardService.resetTimer(boardId);

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          timerDurationSeconds: 300,
          timerPausedDurationSeconds: 300,
          timerOriginalDurationSeconds: 300,
        })
      );
    });
  });

  describe('updateColumnSortState', () => {
    it('should update column sort state in Firestore', async () => {
      const boardId = 'board-id';
      const columnId = 'col1';
      const sortByVotes = true;

      await boardService.updateColumnSortState(boardId, columnId, sortByVotes);

      expect(mockDoc).toHaveBeenCalledWith({}, 'boards', boardId);
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        {},
        {
          [`columns.${columnId}.sortByVotes`]: sortByVotes,
        }
      );
    });
  });

  describe('deleteBoard', () => {
    let mockBoardData: DeleteBoardData;
    let mockBoardSnap: BoardSnapshot;

    beforeEach(() => {
      mockBoardData = {
        facilitatorId: 'test-user-id',
        name: 'Test Board',
      };

      mockBoardSnap = {
        exists: vi.fn(() => true),
        data: vi.fn(() => mockBoardData),
      };

      mockDoc.mockReturnValue({ id: 'board-id' });
      mockGetDocs.mockImplementation(() => {
        return Promise.resolve({
          size: 2,
          docs: [
            { id: 'card1', ref: { id: 'card1' } },
            { id: 'card2', ref: { id: 'card2' } },
          ],
          forEach: (fn: (doc: CardDoc) => void) => {
            fn({
              id: 'card1',
              ref: { id: 'card1' },
              data: () => ({ content: '', boardId: '', columnId: '', position: 0 }),
            });
            fn({
              id: 'card2',
              ref: { id: 'card2' },
              data: () => ({ content: '', boardId: '', columnId: '', position: 0 }),
            });
          },
        });
      });
    });

    it('should delete a board when user is the facilitator', async () => {
      // Mock getDoc to return a board with the test user as facilitator
      mockGetDoc.mockResolvedValueOnce(mockBoardSnap);

      const result = await boardService.deleteBoard('board-id', 'test-user-id');

      // Check that the board document was checked
      expect(mockDoc).toHaveBeenCalledWith({}, 'boards', 'board-id');
      expect(mockGetDoc).toHaveBeenCalled();

      // Check that the board was deleted
      expect(mockDeleteDoc).toHaveBeenCalled();

      // Check that cards were queried and batch deleted
      expect(mockQuery).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalledWith('boardId', '==', 'board-id');
      expect(mockGetDocs).toHaveBeenCalled();
      expect(mockWriteBatch).toHaveBeenCalled();
      expect(batchUpdateMock.delete).toHaveBeenCalled();
      expect(batchUpdateMock.commit).toHaveBeenCalled();

      // Check that user records were updated
      expect(batchUpdateMock.update).toHaveBeenCalled();

      // Check function returned true on success
      expect(result).toBe(true);
    });

    it('should throw an error when board does not exist', async () => {
      // Mock getDoc to return a non-existent board
      mockBoardSnap.exists.mockReturnValue(false);
      mockGetDoc.mockResolvedValueOnce(mockBoardSnap);

      // Spy on console.error to suppress the error message
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(boardService.deleteBoard('nonexistent-board', 'test-user-id')).rejects.toThrow(
        'Board with ID nonexistent-board not found'
      );

      // Board shouldn't be deleted if it doesn't exist
      expect(mockDeleteDoc).not.toHaveBeenCalled();

      // Verify error was properly logged
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error deleting board:',
        expect.objectContaining({
          message: 'Board with ID nonexistent-board not found',
        })
      );

      // Restore the console spy
      consoleSpy.mockRestore();
    });

    it('should throw an error when user is not the facilitator', async () => {
      // Mock getDoc to return a board with a different facilitator
      mockBoardData.facilitatorId = 'different-user-id';
      mockGetDoc.mockResolvedValueOnce(mockBoardSnap);

      // Spy on console.error to suppress the error message
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(boardService.deleteBoard('board-id', 'test-user-id')).rejects.toThrow(
        'Only the board creator can delete the board'
      );

      // Board shouldn't be deleted if user is not the facilitator
      expect(mockDeleteDoc).not.toHaveBeenCalled();

      // Verify error was properly logged
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error deleting board:',
        expect.objectContaining({
          message: 'Only the board creator can delete the board',
        })
      );

      // Restore the console spy
      consoleSpy.mockRestore();
    });

    it('should handle errors during deletion', async () => {
      // Mock getDoc to return a valid board
      mockGetDoc.mockResolvedValueOnce(mockBoardSnap);

      // But make deleteDoc fail
      const dbError = new Error('Database error');
      mockDeleteDoc.mockRejectedValueOnce(dbError);

      // Spy on console.error to verify and suppress the error message
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First check that it throws the correct error
      await expect(boardService.deleteBoard('board-id', 'test-user-id')).rejects.toThrow(
        'Database error'
      );

      // Then verify the error message was logged properly
      expect(consoleSpy).toHaveBeenCalledWith('Error deleting board:', dbError);

      // Restore the original console.error
      consoleSpy.mockRestore();
    });
  });
});
