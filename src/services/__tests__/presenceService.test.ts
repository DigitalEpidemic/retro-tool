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
import { doc, DocumentReference, DocumentSnapshot, getDoc } from 'firebase/firestore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, rtdb } from '../firebase';
import { setupPresence, subscribeToParticipants, updateParticipantName } from '../presenceService';

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
}));

// Mock firebase services
vi.mock('../firebase', () => ({
  auth: {
    currentUser: {
      uid: 'test-user-id',
    },
  } as { currentUser: { uid: string } | null },
  rtdb: {},
  db: {},
}));

describe('presenceService', () => {
  const mockBoardId = 'test-board-id';
  const mockDisplayName = 'Test User';
  const mockUserId = 'test-user-id';

  const mockStatusRef = { key: 'status/test-user-id' } as unknown as DatabaseReference;
  const mockBoardRef = {
    key: 'boards/test-board-id/participants/test-user-id',
  } as unknown as DatabaseReference;
  const mockOnDisconnect = {
    set: vi.fn().mockReturnThis(),
    remove: vi.fn().mockReturnThis(),
    cancel: vi.fn().mockReturnThis(),
  };
  const mockDocRef = { id: 'test-user-id' } as unknown as DocumentReference;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the get function with unknown cast first
    (get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: () => true,
      val: () => ({
        id: 'test-user-id',
        name: 'Old Name',
        color: '#ff0000',
        boardId: 'test-board-id',
        lastOnline: 123456789,
      }),
    } as unknown as DataSnapshot);

    // Mock Firestore doc and getDoc
    (doc as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockDocRef);
    (getDoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      exists: () => true,
      data: () => ({
        color: '#ff0000',
        name: 'Test User',
      }),
    } as unknown as DocumentSnapshot);

    // Setup the mocks for each test
    (ref as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_db: unknown, path: string) => {
        if (path?.includes('status')) return mockStatusRef;
        if (path?.includes('participants')) return mockBoardRef;
        return { key: 'unknown-path' } as unknown as DatabaseReference;
      }
    );

    (onDisconnect as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockOnDisconnect);
    (set as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  describe('setupPresence', () => {
    it('should set up presence tracking for a user', async () => {
      // Call the function
      const cleanup = await setupPresence(mockBoardId, mockDisplayName);

      // Verify refs were created correctly
      expect(ref).toHaveBeenCalledWith(rtdb, `status/${mockUserId}`);
      expect(ref).toHaveBeenCalledWith(rtdb, `boards/${mockBoardId}/participants/${mockUserId}`);

      // Verify Firestore doc was called to get the user's color
      expect(doc).toHaveBeenCalled();
      expect(getDoc).toHaveBeenCalled();

      // Verify onDisconnect was set up
      expect(onDisconnect).toHaveBeenCalledWith(mockStatusRef);
      expect(onDisconnect).toHaveBeenCalledWith(mockBoardRef);
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

      // Verify cleanup function
      expect(typeof cleanup).toBe('function');

      // Call cleanup function
      cleanup();

      // Verify cleanup actions
      expect(mockOnDisconnect.cancel).toHaveBeenCalledTimes(2);
      expect(set).toHaveBeenCalledWith(mockStatusRef, {
        online: false,
        lastChanged: 'MOCK_TIMESTAMP',
      });
      expect(set).toHaveBeenCalledWith(mockBoardRef, null);
    });

    it('should use generated color when Firestore has no color', async () => {
      // Mock Firestore to return no color
      (getDoc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        exists: () => true,
        data: () => ({
          name: 'Test User',
          // No color property
        }),
      } as unknown as DocumentSnapshot);

      // Call the function
      const cleanup = await setupPresence(mockBoardId, mockDisplayName);

      // Verify user data was set with a generated color
      expect(set).toHaveBeenCalledWith(
        mockBoardRef,
        expect.objectContaining<{
          id: string;
          name: string;
          color: string;
          boardId: string;
          lastOnline: number;
        }>({
          id: mockUserId,
          name: mockDisplayName,
          color: expect.any(String),
          boardId: mockBoardId,
          lastOnline: expect.any(Number),
        })
      );

      // Clean up
      cleanup();
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

      // Restore auth.currentUser
      (auth as { currentUser: { uid: string } | null }).currentUser = originalCurrentUser;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('subscribeToParticipants', () => {
    it('should subscribe to participants for a board', () => {
      const mockCallback = vi.fn();
      type MockSnapshotData = {
        id: string;
        name: string;
        color: string;
        boardId: string;
        lastOnline: number;
      };

      const mockSnapshot = {
        exists: () => true,
        forEach: (callback: (snap: DataSnapshot) => void) => {
          const createMockSnapshot = (data: MockSnapshotData): DataSnapshot => ({
            val: () => data,
            exists: () => true,
            key: data.id,
            ref: {} as DatabaseReference,
            child: () => ({}) as DataSnapshot,
            forEach: () => false,
            hasChild: () => false,
            hasChildren: () => false,
            size: 0,
            toJSON: () => data,
            priority: null,
            exportVal: () => data,
          });

          callback(
            createMockSnapshot({
              id: 'user1',
              name: 'User One',
              color: '#ff0000',
              boardId: mockBoardId,
              lastOnline: Date.now(),
            })
          );
          callback(
            createMockSnapshot({
              id: 'user2',
              name: 'User Two',
              color: '#00ff00',
              boardId: mockBoardId,
              lastOnline: Date.now(),
            })
          );
        },
      } as unknown as DataSnapshot;

      // Setup onValue to call the callback immediately with mock data
      (onValue as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_ref: DatabaseReference, callback: (snapshot: DataSnapshot) => void) => {
          callback(mockSnapshot);
          return vi.fn(); // Return a mock unsubscribe function
        }
      );

      // Call the function
      const unsubscribe = subscribeToParticipants(mockBoardId, mockCallback);

      // Verify ref was created correctly
      expect(ref).toHaveBeenCalledWith(rtdb, `boards/${mockBoardId}/participants`);

      // Verify onValue was called
      expect(onValue).toHaveBeenCalled();

      // Verify callback was called with participants
      expect(mockCallback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 'user1', name: 'User One' }),
          expect.objectContaining({ id: 'user2', name: 'User Two' }),
        ])
      );

      // Verify unsubscribe function
      expect(typeof unsubscribe).toBe('function');

      // Call unsubscribe function
      unsubscribe();

      // Verify off was called to remove the listener
      expect(off).toHaveBeenCalled();
    });

    it('should handle empty participants list', () => {
      const mockCallback = vi.fn();
      const mockSnapshot = {
        exists: () => false,
        forEach: vi.fn(),
      } as unknown as DataSnapshot;

      // Setup onValue to call the callback immediately with empty data
      (onValue as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_ref: DatabaseReference, callback: (snapshot: DataSnapshot) => void) => {
          callback(mockSnapshot);
          return vi.fn();
        }
      );

      // Call the function
      subscribeToParticipants(mockBoardId, mockCallback);

      // Verify callback was called with empty array
      expect(mockCallback).toHaveBeenCalledWith([]);
      expect(mockSnapshot.forEach).not.toHaveBeenCalled();
    });
  });

  describe('updateParticipantName', () => {
    it('should update a participant name', async () => {
      const newName = 'New User Name';

      // Call the function
      await updateParticipantName(mockUserId, mockBoardId, newName);

      // Verify ref was created correctly
      expect(ref).toHaveBeenCalledWith(rtdb, `boards/${mockBoardId}/participants/${mockUserId}`);

      // Verify set was called with updated data
      expect(set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: mockUserId,
          name: newName,
          boardId: mockBoardId,
        })
      );
    });

    it('should not update if new name is empty', async () => {
      // Call with empty name
      await updateParticipantName(mockUserId, mockBoardId, '   ');

      // Verify set was not called
      expect(set).not.toHaveBeenCalled();
    });
  });
});
