import { get, off, onDisconnect, onValue, ref, set } from "firebase/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth, rtdb } from "../firebase";
import {
  setupPresence,
  subscribeToParticipants,
  updateParticipantName,
} from "../presenceService";

// Mock firebase/database
vi.mock("firebase/database", () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  onDisconnect: vi.fn(),
  set: vi.fn(),
  off: vi.fn(),
  get: vi.fn(),
  serverTimestamp: vi.fn(() => "MOCK_TIMESTAMP"),
  query: vi.fn(),
  orderByChild: vi.fn(),
  equalTo: vi.fn(),
}));

// Mock firebase services
vi.mock("../firebase", () => ({
  auth: {
    currentUser: {
      uid: "test-user-id",
    },
  },
  rtdb: {},
}));

describe("presenceService", () => {
  const mockBoardId = "test-board-id";
  const mockDisplayName = "Test User";
  const mockUserId = "test-user-id";

  const mockStatusRef = { key: "status/test-user-id" };
  const mockBoardRef = {
    key: "boards/test-board-id/participants/test-user-id",
  };
  const mockOnDisconnect = {
    set: vi.fn().mockReturnThis(),
    remove: vi.fn().mockReturnThis(),
    cancel: vi.fn().mockReturnThis(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock the get function
    (get as any).mockResolvedValue({
      exists: () => true,
      val: () => ({
        id: "test-user-id",
        name: "Old Name",
        color: "#ff0000",
        boardId: "test-board-id",
        lastOnline: 123456789,
      }),
    });

    // Setup the mocks for each test
    (ref as any).mockImplementation((_: any, path: string) => {
      if (path?.includes("status")) return mockStatusRef;
      if (path?.includes("participants")) return mockBoardRef;
      return { key: "unknown-path" };
    });

    (onDisconnect as any).mockReturnValue(mockOnDisconnect);
    (set as any).mockResolvedValue(undefined);
  });

  describe("setupPresence", () => {
    it("should set up presence tracking for a user", () => {
      // Call the function
      const cleanup = setupPresence(mockBoardId, mockDisplayName);

      // Verify refs were created correctly
      expect(ref).toHaveBeenCalledWith(rtdb, `status/${mockUserId}`);
      expect(ref).toHaveBeenCalledWith(
        rtdb,
        `boards/${mockBoardId}/participants/${mockUserId}`
      );

      // Verify onDisconnect was set up
      expect(onDisconnect).toHaveBeenCalledWith(mockStatusRef);
      expect(onDisconnect).toHaveBeenCalledWith(mockBoardRef);
      expect(mockOnDisconnect.set).toHaveBeenCalledWith({
        online: false,
        lastChanged: "MOCK_TIMESTAMP",
      });
      expect(mockOnDisconnect.remove).toHaveBeenCalled();

      // Verify user data was set
      expect(set).toHaveBeenCalledWith(mockStatusRef, {
        online: true,
        lastChanged: "MOCK_TIMESTAMP",
      });
      expect(set).toHaveBeenCalledWith(
        mockBoardRef,
        expect.objectContaining({
          id: mockUserId,
          name: mockDisplayName,
          color: expect.any(String),
          boardId: mockBoardId,
          lastOnline: expect.any(Number),
        })
      );

      // Verify cleanup function
      expect(typeof cleanup).toBe("function");

      // Call cleanup function
      cleanup();

      // Verify cleanup actions
      expect(mockOnDisconnect.cancel).toHaveBeenCalledTimes(2);
      expect(set).toHaveBeenCalledWith(mockStatusRef, {
        online: false,
        lastChanged: "MOCK_TIMESTAMP",
      });
      expect(set).toHaveBeenCalledWith(mockBoardRef, null);
    });

    it("should return empty cleanup function when no user is authenticated", () => {
      // Spy on console.error
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // Temporarily replace auth.currentUser with null
      const originalCurrentUser = auth.currentUser;
      (auth as any).currentUser = null;

      // Call the function
      const cleanup = setupPresence(mockBoardId, mockDisplayName);

      // Verify no refs or listeners were created
      expect(ref).not.toHaveBeenCalled();
      expect(onDisconnect).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();

      // Verify console.error was called with the correct message
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Cannot setup presence without an authenticated user"
      );

      // Verify cleanup is a no-op function
      expect(typeof cleanup).toBe("function");
      cleanup(); // Should not throw

      // Restore auth.currentUser and console.error
      (auth as any).currentUser = originalCurrentUser;
      consoleErrorSpy.mockRestore();
    });
  });

  describe("subscribeToParticipants", () => {
    it("should subscribe to participants for a board", () => {
      const mockCallback = vi.fn();
      const mockSnapshot = {
        exists: () => true,
        forEach: (callback: (snap: any) => void) => {
          callback({
            val: () => ({
              id: "user1",
              name: "User One",
              color: "#ff0000",
              boardId: mockBoardId,
              lastOnline: Date.now(),
            }),
          });
          callback({
            val: () => ({
              id: "user2",
              name: "User Two",
              color: "#00ff00",
              boardId: mockBoardId,
              lastOnline: Date.now(),
            }),
          });
        },
      };

      // Setup onValue to call the callback immediately with mock data
      (onValue as any).mockImplementation(
        (_: any, callback: (snapshot: any) => void) => {
          callback(mockSnapshot);
          return vi.fn(); // Return a mock unsubscribe function
        }
      );

      // Call the function
      const unsubscribe = subscribeToParticipants(mockBoardId, mockCallback);

      // Verify ref was created correctly
      expect(ref).toHaveBeenCalledWith(
        rtdb,
        `boards/${mockBoardId}/participants`
      );

      // Verify onValue was called
      expect(onValue).toHaveBeenCalled();

      // Verify callback was called with participants
      expect(mockCallback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: "user1", name: "User One" }),
          expect.objectContaining({ id: "user2", name: "User Two" }),
        ])
      );

      // Verify unsubscribe function
      expect(typeof unsubscribe).toBe("function");

      // Call unsubscribe function
      unsubscribe();

      // Verify off was called to remove the listener
      expect(off).toHaveBeenCalled();
    });

    it("should handle empty participants list", () => {
      const mockCallback = vi.fn();
      const mockSnapshot = {
        exists: () => false,
        forEach: vi.fn(),
      };

      // Setup onValue to call the callback immediately with empty data
      (onValue as any).mockImplementation(
        (_: any, callback: (snapshot: any) => void) => {
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

  describe("updateParticipantName", () => {
    it("should update a participant name", async () => {
      const newName = "New User Name";

      // Call the function
      await updateParticipantName(mockUserId, mockBoardId, newName);

      // Verify ref was created correctly
      expect(ref).toHaveBeenCalledWith(
        rtdb,
        `boards/${mockBoardId}/participants/${mockUserId}`
      );

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

    it("should not update if new name is empty", async () => {
      // Call with empty name
      await updateParticipantName(mockUserId, mockBoardId, "   ");

      // Verify set was not called
      expect(set).not.toHaveBeenCalled();
    });
  });
});
