import {
  DatabaseReference,
  DataSnapshot,
  get,
  off,
  onDisconnect,
  onValue,
  ref,
  set,
} from 'firebase/database';
import { doc, DocumentReference, DocumentSnapshot, getDoc, deleteDoc, collection, query, where, getDocs, writeBatch, updateDoc, serverTimestamp } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi, Mock } from 'vitest';
import { auth, rtdb } from '../firebase';
import { setupPresence, subscribeToParticipants, updateParticipantName, cleanupInactiveBoards } from '../presenceService';

// Mock firebase/database
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  onDisconnect: vi.fn(),
  set: vi.fn(),
  off: vi.fn(),
  get: vi.fn(),
  serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
  query: vi.fn(),
  orderByChild: vi.fn(),
  equalTo: vi.fn(),
}));

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'MOCK_FIRESTORE_TIMESTAMP'),
}));

// Mock firebase.ts
vi.mock('../firebase', () => ({
  auth: {
    currentUser: { uid: 'user-123' },
  },
  rtdb: {},
  db: {},
}));

describe('presenceService', () => {
  const mockBoardId = 'test-board-id';
  const mockUserId = 'user-123';
  const mockDisplayName = 'Test User';
  const mockStatusRef = {} as DatabaseReference;
  const mockBoardRef = {} as DatabaseReference;
  const mockBoardParticipantsRef = {} as DatabaseReference;
  const mockBoardLastActiveRef = {} as DatabaseReference;
  const mockUserRef = {} as DocumentReference;
  const mockUserSnap = {
    exists: vi.fn(() => true),
    data: vi.fn(() => ({ color: '#ff0000' })),
  } as unknown as DocumentSnapshot;
  const mockOnDisconnect = {
    set: vi.fn(),
    remove: vi.fn(),
    cancel: vi.fn(),
  };
  const mockUnsubscribe = vi.fn();
  const mockSnapshot = {
    exists: () => true,
    val: () => ({
      id: mockUserId,
      name: mockDisplayName,
      color: '#ff0000',
      boardId: mockBoardId,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock to handle the boardsSnapshot for cleanupInactiveBoards
    (get as unknown as Mock).mockImplementation((path: any) => {
      if (path === mockBoardRef) {
        return Promise.resolve(mockSnapshot);
      }
      // For cleanupInactiveBoards, return empty boards
      return Promise.resolve({
        exists: () => false, // No boards to check
      });
    });

    // Set up common mocks
    (ref as unknown as Mock).mockImplementation((db: any, path: string) => {
      if (path === `status/${mockUserId}`) {
        return mockStatusRef;
      } else if (path === `boards/${mockBoardId}/participants/${mockUserId}`) {
        return mockBoardRef;
      } else if (path === `boards/${mockBoardId}/participants`) {
        return mockBoardParticipantsRef;
      } else if (path === `boards/${mockBoardId}/lastActive`) {
        return mockBoardLastActiveRef;
      }
      return {};
    });

    (doc as unknown as Mock).mockReturnValue(mockUserRef);
    (getDoc as unknown as Mock).mockResolvedValue(mockUserSnap);
    (onDisconnect as unknown as Mock).mockReturnValue(mockOnDisconnect);
    (onValue as unknown as Mock).mockImplementation((ref, callback) => {
      callback({
        exists: () => true,
        forEach: (cb: (snap: any) => void) => {
          cb({
            val: () => ({
              id: mockUserId,
              name: mockDisplayName,
              color: '#ff0000',
              boardId: mockBoardId,
            }),
          });
        },
      });
      return mockUnsubscribe;
    });
    
    // Mock updateDoc
    (updateDoc as unknown as Mock).mockResolvedValue(undefined);
  });

  describe('setupPresence', () => {
    it('should set up presence tracking for a user', async () => {
      // Call the function
      const cleanup = await setupPresence(mockBoardId, mockDisplayName);

      // Verify refs were created correctly
      expect(ref).toHaveBeenCalledWith(rtdb, `status/${mockUserId}`);
      expect(ref).toHaveBeenCalledWith(rtdb, `boards/${mockBoardId}/participants/${mockUserId}`);
      expect(ref).toHaveBeenCalledWith(rtdb, `boards/${mockBoardId}/lastActive`);

      // Verify Firestore doc was called to get the user's color
      expect(doc).toHaveBeenCalled();
      expect(getDoc).toHaveBeenCalled();
      
      // Verify the user's boardId is updated in Firestore when joining a board
      expect(updateDoc).toHaveBeenCalledWith(mockUserRef, {
        boardId: mockBoardId,
        lastActive: 'MOCK_FIRESTORE_TIMESTAMP',
      });

      // Verify onDisconnect was set up - now 3 calls with the lastActive ref
      expect(onDisconnect).toHaveBeenCalledWith(mockStatusRef);
      expect(onDisconnect).toHaveBeenCalledWith(mockBoardRef);
      expect(onDisconnect).toHaveBeenCalledWith(mockBoardLastActiveRef);
      expect(mockOnDisconnect.set).toHaveBeenCalledWith({
        online: false,
        lastChanged: 'MOCK_TIMESTAMP',
      });
      expect(mockOnDisconnect.remove).toHaveBeenCalled();

      // Verify user data was set
      expect(set).toHaveBeenCalledWith(mockStatusRef, {
        online: true,
        lastChanged: 'MOCK_TIMESTAMP',
      });
      expect(set).toHaveBeenCalledWith(
        mockBoardRef,
        expect.objectContaining({
          id: mockUserId,
          name: mockDisplayName,
          color: '#ff0000', // Should use the color from Firestore
          boardId: mockBoardId,
          lastOnline: expect.any(Number),
        })
      );
      expect(set).toHaveBeenCalledWith(mockBoardLastActiveRef, 'MOCK_TIMESTAMP');

      // Verify cleanup function
      expect(typeof cleanup).toBe('function');

      // Call cleanup function
      cleanup();

      // Verify cleanup actions - now 3 calls with the lastActive ref
      expect(mockOnDisconnect.cancel).toHaveBeenCalledTimes(3);
      expect(set).toHaveBeenCalledWith(mockStatusRef, {
        online: false,
        lastChanged: 'MOCK_TIMESTAMP',
      });
      expect(set).toHaveBeenCalledWith(mockBoardRef, null);
      expect(set).toHaveBeenCalledWith(mockBoardLastActiveRef, 'MOCK_TIMESTAMP');
      
      // Verify that updateDoc is called to update the user's boardId to null in Firestore
      expect(updateDoc).toHaveBeenCalledWith(mockUserRef, {
        boardId: null,
        lastActive: 'MOCK_FIRESTORE_TIMESTAMP',
      });
    });
    
    it('should handle errors when updating the boardId in Firestore', async () => {
      // Spy on console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      
      // Mock updateDoc to throw an error on first call
      (updateDoc as unknown as Mock).mockRejectedValueOnce(new Error('Test error'));
      
      // Call the function - it should continue despite the error
      await setupPresence(mockBoardId, mockDisplayName);
      
      // Verify updateDoc was called
      expect(updateDoc).toHaveBeenCalledWith(mockUserRef, {
        boardId: mockBoardId,
        lastActive: 'MOCK_FIRESTORE_TIMESTAMP',
      });
      
      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error updating user boardId in Firestore:',
        expect.any(Error)
      );
      
      // Verify other operations still proceeded
      expect(set).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });

    it('should use generated color when Firestore has no color', async () => {
      // Mock Firestore to return no color
      (mockUserSnap.data as Mock).mockReturnValueOnce({});

      const cleanup = await setupPresence(mockBoardId, mockDisplayName);

      // Verify user data was set with a generated color (any string)
      expect(set).toHaveBeenCalledWith(
        mockBoardRef,
        expect.objectContaining({
          id: mockUserId,
          name: mockDisplayName,
          color: expect.any(String), // Should be a generated color
          boardId: mockBoardId,
          lastOnline: expect.any(Number),
        })
      );

      // Call cleanup to verify boardId is set to null
      cleanup();
      expect(updateDoc).toHaveBeenCalledWith(mockUserRef, {
        boardId: null,
        lastActive: 'MOCK_FIRESTORE_TIMESTAMP',
      });
    });

    it('should return empty cleanup function when no user is authenticated', async () => {
      // Spy on console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      // Temporarily replace auth.currentUser with null
      const originalCurrentUser = auth.currentUser;
      (auth as { currentUser: { uid: string } | null }).currentUser = null;

      // Call the function
      const cleanup = await setupPresence(mockBoardId, mockDisplayName);

      // Verify no refs or listeners were created
      expect(ref).not.toHaveBeenCalled();
      expect(onDisconnect).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();

      // Verify console.error was called with the correct message
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Cannot setup presence without an authenticated user'
      );

      // Verify cleanup is a no-op function
      expect(typeof cleanup).toBe('function');
      cleanup(); // Should not throw
      
      // Verify updateDoc was not called
      expect(updateDoc).not.toHaveBeenCalled();

      // Restore auth.currentUser
      (auth as { currentUser: { uid: string } | null }).currentUser = originalCurrentUser;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('subscribeToParticipants', () => {
    it('should subscribe to participants for a board', () => {
      const callback = vi.fn();
      const unsubscribe = subscribeToParticipants(mockBoardId, callback);

      // Verify ref was created correctly
      expect(ref).toHaveBeenCalledWith(rtdb, `boards/${mockBoardId}/participants`);

      // Verify onValue was called with the correct ref and a callback
      expect(onValue).toHaveBeenCalledWith(mockBoardParticipantsRef, expect.any(Function));

      // Verify callback was called with participants data
      expect(callback).toHaveBeenCalledWith([
        {
          id: mockUserId,
          name: mockDisplayName,
          color: '#ff0000',
          boardId: mockBoardId,
        },
      ]);

      // Verify unsubscribe function was returned
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle empty participants list', () => {
      // Mock onValue to simulate no participants
      (onValue as unknown as Mock).mockImplementationOnce((ref, callback) => {
        callback({
          exists: () => false,
        });
        return mockUnsubscribe;
      });

      const callback = vi.fn();
      subscribeToParticipants(mockBoardId, callback);

      // Verify callback was called with empty array
      expect(callback).toHaveBeenCalledWith([]);
    });
  });

  describe('updateParticipantName', () => {
    it('should update a participant name', async () => {
      // Mock the snapshot for get
      (get as unknown as Mock).mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          id: mockUserId,
          name: 'Old Name',
          color: '#ff0000',
          boardId: mockBoardId,
        }),
      });

      await updateParticipantName(mockUserId, mockBoardId, 'New Name');

      // Verify ref was created correctly
      expect(ref).toHaveBeenCalledWith(rtdb, `boards/${mockBoardId}/participants/${mockUserId}`);

      // Verify get was called
      expect(get).toHaveBeenCalled();

      // Verify set was called with updated data
      expect(set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: mockUserId,
          name: 'New Name',
          color: '#ff0000',
          boardId: mockBoardId,
        })
      );
    });

    it('should not update if new name is empty', async () => {
      await updateParticipantName(mockUserId, mockBoardId, '');

      // Verify set was not called
      expect(set).not.toHaveBeenCalled();

      await updateParticipantName(mockUserId, mockBoardId, '   ');

      // Verify set was not called
      expect(set).not.toHaveBeenCalled();
    });
  });

  describe('cleanupInactiveBoards', () => {
    const mockBoardsRef = {} as DatabaseReference;
    const mockBoardsSnapshot = {
      exists: vi.fn(() => true),
      forEach: vi.fn(),
    } as unknown as DataSnapshot;
    
    const mockBoardSnapshot = {
      key: 'inactive-board-id',
      child: vi.fn((path: string) => {
        if (path === 'participants') {
          return {
            exists: (): boolean => false,
            size: 0,
          };
        } else if (path === 'lastActive') {
          return {
            exists: (): boolean => true,
            val: () => Date.now() - 120000, // 2 minutes ago
          };
        }
        return { exists: (): boolean => false };
      }),
    } as unknown as DataSnapshot;
    
    const mockBoardWithParticipantsSnapshot = {
      key: 'active-board-id',
      child: vi.fn((path: string) => {
        if (path === 'participants') {
          return {
            exists: (): boolean => true,
            size: 2,
          };
        }
        return { exists: (): boolean => false };
      }),
    } as unknown as DataSnapshot;
    
    const mockBoardRef = {} as DocumentReference;
    const mockBoardSnap = {
      exists: vi.fn(() => true),
    } as unknown as DocumentSnapshot;
    
    const mockCardsQuery = {};
    const mockCardsSnapshot = {
      size: 2,
      docs: [
        { ref: { id: 'card1' } },
        { ref: { id: 'card2' } },
      ],
    };
    
    const mockBatch = {
      delete: vi.fn(),
      commit: vi.fn(),
    };

    beforeEach(() => {
      (ref as unknown as Mock).mockImplementation((db: any, path: string) => {
        if (path === 'boards') {
          return mockBoardsRef;
        }
        return {};
      });
      
      (get as unknown as Mock).mockResolvedValue(mockBoardsSnapshot);
      
      (mockBoardsSnapshot.forEach as Mock).mockImplementation((callback: (snapshot: DataSnapshot) => void) => {
        callback(mockBoardSnapshot);
        callback(mockBoardWithParticipantsSnapshot);
      });
      
      (doc as unknown as Mock).mockReturnValue(mockBoardRef);
      (getDoc as unknown as Mock).mockResolvedValue(mockBoardSnap);
      
      (collection as unknown as Mock).mockReturnValue({});
      (query as unknown as Mock).mockReturnValue(mockCardsQuery);
      (where as unknown as Mock).mockReturnValue({});
      (getDocs as unknown as Mock).mockResolvedValue(mockCardsSnapshot);
      
      (writeBatch as unknown as Mock).mockReturnValue(mockBatch);
      (mockBatch.commit as Mock).mockResolvedValue(undefined);
      
      (deleteDoc as unknown as Mock).mockResolvedValue(undefined);
    });

    it('should identify and delete inactive boards', async () => {
      await cleanupInactiveBoards();
      
      // Verify it fetched all boards
      expect(ref).toHaveBeenCalledWith(rtdb, 'boards');
      expect(get).toHaveBeenCalledWith(mockBoardsRef);
      
      // Verify it checked each board for participants
      expect(mockBoardsSnapshot.forEach).toHaveBeenCalled();
      
      // Verify it checked Firestore for the board
      expect(doc).toHaveBeenCalledWith(expect.anything(), 'boards', 'inactive-board-id');
      expect(getDoc).toHaveBeenCalled();
      
      // Verify it queried for cards
      expect(collection).toHaveBeenCalledWith(expect.anything(), 'cards');
      expect(query).toHaveBeenCalled();
      expect(where).toHaveBeenCalledWith('boardId', '==', 'inactive-board-id');
      expect(getDocs).toHaveBeenCalled();
      
      // Verify it deleted the cards using a batch
      expect(writeBatch).toHaveBeenCalled();
      expect(mockBatch.delete).toHaveBeenCalledTimes(2);
      expect(mockBatch.commit).toHaveBeenCalled();
      
      // Verify it deleted the board
      expect(deleteDoc).toHaveBeenCalledWith(mockBoardRef);
      
      // Verify it cleaned up RTDB
      expect(set).toHaveBeenCalledWith(expect.anything(), null);
    });

    it('should update lastActive for boards with participants', async () => {
      await cleanupInactiveBoards();
      
      // Verify it updated the lastActive timestamp for boards with participants
      expect(set).toHaveBeenCalledWith(expect.anything(), 'MOCK_TIMESTAMP');
    });
  });
});
