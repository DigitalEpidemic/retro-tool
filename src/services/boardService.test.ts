import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import * as boardService from './boardService';
import { Board, Card } from './firebase';

// Mock Firebase
vi.mock('./firebase', () => ({
  db: {},
  Board: class {},
  Card: class {}
}));

// Mock Firestore
const mockDoc = vi.fn(() => ({}));
const mockCollection = vi.fn(() => ({}));
const mockAddDoc = vi.fn(() => Promise.resolve({ id: 'mock-doc-id' }));
const mockSetDoc = vi.fn(() => Promise.resolve());
const mockUpdateDoc = vi.fn(() => Promise.resolve());
const mockDeleteDoc = vi.fn(() => Promise.resolve());
const mockQuery = vi.fn(() => ({}));
const mockWhere = vi.fn(() => ({}));
const mockServerTimestamp = vi.fn(() => ({ toMillis: () => Date.now() }));
const mockIncrement = vi.fn((val) => ({ __increment: val }));
const mockOnSnapshot = vi.fn();
const mockGetDocs = vi.fn();
const mockWriteBatch = vi.fn();

vi.mock('firebase/firestore', () => {
  return {
    doc: (...args: any[]) => mockDoc(...args),
    collection: (...args: any[]) => mockCollection(...args),
    addDoc: (...args: any[]) => mockAddDoc(...args),
    setDoc: (...args: any[]) => mockSetDoc(...args),
    updateDoc: (...args: any[]) => mockUpdateDoc(...args),
    deleteDoc: (...args: any[]) => mockDeleteDoc(...args),
    query: (...args: any[]) => mockQuery(...args),
    where: (...args: any[]) => mockWhere(...args),
    onSnapshot: (...args: any[]) => mockOnSnapshot(...args),
    getDocs: (...args: any[]) => mockGetDocs(...args),
    writeBatch: (...args: any[]) => mockWriteBatch(...args),
    serverTimestamp: () => mockServerTimestamp(),
    increment: (val: number) => mockIncrement(val),
    Timestamp: {
      now: () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0, toMillis: () => Date.now() }),
      fromMillis: (ms: number) => ({ 
        seconds: Math.floor(ms / 1000), 
        nanoseconds: (ms % 1000) * 1000000,
        toMillis: () => ms
      })
    }
  };
});

describe('boardService', () => {
  let onSnapshotCallback: Function;
  let batchUpdateMock: any;
  
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
      delete: vi.fn()
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
          columns: expect.any(Object)
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
      await boardService.createBoard('Test Board');
      
      const boardData = mockAddDoc.mock.calls[0][1];
      
      expect(boardData.columns).toEqual({
        col1: { id: 'col1', title: 'What went well', order: 0 },
        col2: { id: 'col2', title: 'What can be improved', order: 1 },
        col3: { id: 'col3', title: 'Action items', order: 2 }
      });
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
        columns: {}
      };
      
      boardService.subscribeToBoard(boardId, callback);
      
      // Trigger the onSnapshot callback with mock doc
      onSnapshotCallback({
        id: boardId,
        data: () => boardData,
        exists: () => true
      });
      
      expect(callback).toHaveBeenCalledWith({
        id: boardId,
        ...boardData
      });
    });

    it('should call callback with null when document does not exist', () => {
      const boardId = 'nonexistent-board';
      const callback = vi.fn();
      
      boardService.subscribeToBoard(boardId, callback);
      
      // Trigger the onSnapshot callback with non-existent doc
      onSnapshotCallback({
        exists: () => false
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
            position: 3000
          })
        },
        {
          id: 'card1',
          data: () => ({
            content: 'Card 1',
            boardId,
            columnId: 'col1',
            position: 1000
          })
        },
        {
          id: 'card2',
          data: () => ({
            content: 'Card 2',
            boardId,
            columnId: 'col1',
            position: 2000
          })
        }
      ];
      
      // Trigger the onSnapshot callback
      onSnapshotCallback({
        forEach: (fn: (doc: any) => void) => cardsData.forEach(fn)
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
          votes: 0
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
          authorName: 'Anonymous'
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
        { id: 'card1', columnId, position: 1000, boardId },
        { id: cardId, columnId, position: 2000, boardId },
        { id: 'card3', columnId, position: 3000, boardId },
        { id: 'card4', columnId, position: 4000, boardId }
      ];
      
      mockGetDocs.mockResolvedValueOnce({
        forEach: (fn: (doc: any) => void) => {
          cards.forEach(card => {
            fn({
              id: card.id,
              data: () => card
            });
          });
        }
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
        { id: 'card1', columnId: sourceColumnId, position: 1000, boardId },
        { id: cardId, columnId: sourceColumnId, position: 2000, boardId },
        { id: 'card3', columnId: sourceColumnId, position: 3000, boardId },
        { id: 'card4', columnId: destColumnId, position: 1000, boardId },
        { id: 'card5', columnId: destColumnId, position: 2000, boardId }
      ];
      
      mockGetDocs.mockResolvedValueOnce({
        forEach: (fn: (doc: any) => void) => {
          cards.forEach(card => {
            fn({
              id: card.id,
              data: () => card
            });
          });
        }
      });
      
      await boardService.updateCardPosition(cardId, destColumnId, newIndex, sourceColumnId, boardId);
      
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
        { id: 'card1', columnId, position: 1000, boardId },
        { id: 'card2', columnId, position: 2000, boardId }
      ];
      
      mockGetDocs.mockResolvedValueOnce({
        forEach: (fn: (doc: any) => void) => {
          cards.forEach(card => {
            fn({
              id: card.id,
              data: () => card
            });
          });
        }
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
        votes: 5
      };
      
      await boardService.updateCard(cardId, updates);
      
      expect(mockDoc).toHaveBeenCalledWith({}, 'cards', cardId);
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        {},
        updates
      );
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
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        {},
        { votes: { __increment: 1 } }
      );
    });

    it('should decrement votes when voting down', async () => {
      const cardId = 'card-id';
      
      await boardService.voteForCard(cardId, 'down');
      
      expect(mockDoc).toHaveBeenCalledWith({}, 'cards', cardId);
      expect(mockIncrement).toHaveBeenCalledWith(-1);
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        {},
        { votes: { __increment: -1 } }
      );
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
          timerOriginalDurationSeconds: 300
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
        timerIsRunning: false
      } as Board;
      
      await boardService.startTimer(boardId, currentBoardData);
      
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        {},
        {
          timerIsRunning: true,
          timerStartTime: expect.anything(),
          timerDurationSeconds: 120, // Should use paused duration
          timerPausedDurationSeconds: null,
          timerOriginalDurationSeconds: 300
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
          toMillis: () => startTime.getTime()
        },
        timerDurationSeconds: 300, // 5 minutes
        timerOriginalDurationSeconds: 300
      } as unknown as Board;
      
      await boardService.pauseTimer(boardId, currentBoardData);
      
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          timerIsRunning: false,
          timerPausedDurationSeconds: expect.any(Number), // Should be around 270 seconds
          timerStartTime: null,
          timerOriginalDurationSeconds: 300
        })
      );
      
      // Get the actual value sent to Firestore
      const updateArgs = mockUpdateDoc.mock.calls[0][1];
      expect(updateArgs.timerPausedDurationSeconds).toBeGreaterThanOrEqual(269);
      expect(updateArgs.timerPausedDurationSeconds).toBeLessThanOrEqual(271);
    });

    it('should handle invalid timer state gracefully', async () => {
      const boardId = 'board-id';
      const invalidBoardData = {
        id: boardId,
        name: 'Test Board',
        timerIsRunning: false // Not running
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
          timerOriginalDurationSeconds: initialDuration
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
          timerOriginalDurationSeconds: 300
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
          [`columns.${columnId}.sortByVotes`]: sortByVotes
        }
      );
    });
  });
});
