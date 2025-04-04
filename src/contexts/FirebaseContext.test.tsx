import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react"; // Import act
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { FirebaseProvider, useFirebase } from "./FirebaseContext"; // Adjust the import path as needed
import { User } from "firebase/auth";
// Import the specific functions we need to mock *after* vi.mock
import { auth, signInAnonymousUser } from "../services/firebase";

// Mock Firebase service methods using factory function
vi.mock("../services/firebase", () => ({
  // Return new mocks directly from the factory
  auth: {
    onAuthStateChanged: vi.fn(),
  },
  signInAnonymousUser: vi.fn(),
}));

// Get typed references to the *mocked* functions after vi.mock
const mockedAuth = vi.mocked(auth);
const mockedSignInAnonymousUser = vi.mocked(signInAnonymousUser);

// Test Consumer Component
const TestConsumer = () => {
  const { user, loading, error } = useFirebase();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (user) {
    return <div>User ID: {user.uid}</div>;
  }

  return <div>No user</div>;
};

describe("FirebaseProvider", () => {
  let onAuthStateChangedCallback: (user: User | null) => void;

  beforeEach(() => {
    // Adjust mockImplementation to match the (next, error?) signature used in the context
    mockedAuth.onAuthStateChanged.mockImplementation((next) => {
      // Capture the 'next' callback (the first argument)
      onAuthStateChangedCallback = next as (user: User | null) => void;
      // Return a mock unsubscribe function
      return vi.fn();
    });
    // Provide a default resolved promise (null User) for signInAnonymousUser
    mockedSignInAnonymousUser.mockResolvedValue(null as unknown as User);
    // Reset mocks before each test (clears implementations and calls)
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should show loading state initially", () => {
    render(
      <FirebaseProvider>
        <TestConsumer />
      </FirebaseProvider>
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    // Expect signInAnonymousUser to have been called
    expect(mockedSignInAnonymousUser).toHaveBeenCalled();
  });

  it("should sign in anonymously and set user state on successful auth change", async () => {
    const mockUser = { uid: "test-user-123" } as User;
    // Mock the promise resolution for signInAnonymousUser to resolve directly with User
    mockedSignInAnonymousUser.mockResolvedValue(mockUser);

    render(
      <FirebaseProvider>
        <TestConsumer />
      </FirebaseProvider>
    );

    // Expect loading initially
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // Simulate Firebase finishing the sign-in and calling onAuthStateChanged
    // Need to wait for the promise from signInAnonymousUser to resolve *before* calling the callback
    await waitFor(() => expect(mockedSignInAnonymousUser).toHaveBeenCalled());

    // Now simulate the auth state change within act
    act(() => {
      onAuthStateChangedCallback(mockUser);
    });

    // Wait for the state update and re-render
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
      expect(screen.getByText(`User ID: ${mockUser.uid}`)).toBeInTheDocument();
    });

    // Verify error is null via UI assertion
    expect(screen.queryByText(/Error:/)).not.toBeInTheDocument();
  });

  it("should handle anonymous sign-in error", async () => {
    const mockError = new Error("Firebase sign-in failed");
    mockedSignInAnonymousUser.mockRejectedValue(mockError);

    render(
      <FirebaseProvider>
        <TestConsumer />
      </FirebaseProvider>
    );

    // Expect loading initially
    expect(screen.getByText("Loading...")).toBeInTheDocument();

    // Wait for the error state to be set
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
      expect(
        screen.getByText(`Error: ${mockError.message}`)
      ).toBeInTheDocument();
    });
    // Verify user is null
    expect(screen.queryByText(/User ID:/)).not.toBeInTheDocument();
  });

  it("should set user to null when auth state changes to null", async () => {
    const mockUser = { uid: "test-user-123" } as User;
    // Mock the promise resolution for signInAnonymousUser to resolve directly with User
    mockedSignInAnonymousUser.mockResolvedValue(mockUser);

    render(
      <FirebaseProvider>
        <TestConsumer />
      </FirebaseProvider>
    );

    // Initial sign-in
    await waitFor(() => expect(mockedSignInAnonymousUser).toHaveBeenCalled());
    act(() => {
      onAuthStateChangedCallback(mockUser);
    });
    await waitFor(() =>
      expect(screen.getByText(`User ID: ${mockUser.uid}`)).toBeInTheDocument()
    );

    // Simulate sign-out / auth state becomes null within act
    act(() => {
      onAuthStateChangedCallback(null);
    });

    // Wait for state update
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
      expect(screen.getByText("No user")).toBeInTheDocument(); // Or whatever state indicates no user
    });
  });

  it("useFirebase hook should throw error when used outside of Provider", () => {
    // Suppress console.error output for this specific test
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // We expect this render to throw an error
    expect(() => render(<TestConsumer />)).toThrow(
      "useFirebase must be used within a FirebaseProvider"
    );

    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  it("should call the unsubscribe function on unmount", () => {
    const mockUnsubscribe = vi.fn();
    // Adjust mockImplementation to match the (next, error?) signature used in the context
    mockedAuth.onAuthStateChanged.mockImplementation((next) => {
      // Capture the 'next' callback (the first argument)
      onAuthStateChangedCallback = next as (user: User | null) => void;
      return mockUnsubscribe; // Return the mock unsubscribe function
    });

    const { unmount } = render(
      <FirebaseProvider>
        <TestConsumer />
      </FirebaseProvider>
    );

    // Unmount the component
    unmount();

    // Expect the unsubscribe function to have been called
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
