import { act, render, screen, waitFor } from '@testing-library/react'; // Import act
import {
  Auth,
  NextOrObserver,
  signInAnonymously,
  Unsubscribe,
  User,
  UserCredential,
} from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirebaseProvider } from './FirebaseContext'; // Adjust the import path as needed
import { useFirebase } from './useFirebase';

// Mock Firebase fully including both auth and firestore
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

// Create mock implementations first
const unsubscribeSpy = vi.fn();
type AuthStateCallback = (user: User | null) => void;
let authStateCallback: AuthStateCallback | null = null;

// Mock Firebase Auth module
vi.mock('firebase/auth', () => {
  const mockUser: User = { uid: 'test-user-123', displayName: null } as User;

  const mockOnAuthStateChanged = (
    _auth: Auth,
    nextOrObserver: NextOrObserver<User | null>
  ): Unsubscribe => {
    if (typeof nextOrObserver === 'function') {
      authStateCallback = (user: User | null) => nextOrObserver(user);
    } else {
      authStateCallback = (user: User | null) => nextOrObserver.next?.(user);
    }
    return unsubscribeSpy;
  };

  return {
    getAuth: vi.fn(() => ({
      currentUser: null,
      onAuthStateChanged: vi.fn(mockOnAuthStateChanged),
    })),
    onAuthStateChanged: vi.fn(mockOnAuthStateChanged),
    signInAnonymously: vi.fn(() =>
      Promise.resolve({
        user: mockUser,
        operationType: 'signIn',
        providerId: null,
      } as UserCredential)
    ),
  };
});

// Mock Firestore
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn(() => 'mocked-doc-ref'),
  getDoc: vi.fn(() =>
    Promise.resolve({
      exists: () => false,
      data: () => ({}),
    })
  ),
}));

// Mock Firebase services
vi.mock('../services/firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn((nextOrObserver: NextOrObserver<User | null>): Unsubscribe => {
      if (typeof nextOrObserver === 'function') {
        authStateCallback = (user: User | null) => nextOrObserver(user);
      } else {
        authStateCallback = (user: User | null) => nextOrObserver.next?.(user);
      }
      return unsubscribeSpy;
    }),
  },
  db: {},
}));

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

describe('FirebaseProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStateCallback = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading state initially', () => {
    render(
      <FirebaseProvider>
        <TestConsumer />
      </FirebaseProvider>
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should sign in anonymously and set user state on successful auth change', async () => {
    const mockUser = { uid: 'test-user-123', displayName: null } as User;
    vi.mocked(signInAnonymously).mockResolvedValueOnce({
      user: mockUser,
      operationType: 'signIn',
      providerId: null,
    } as UserCredential);

    render(
      <FirebaseProvider>
        <TestConsumer />
      </FirebaseProvider>
    );

    // Expect loading initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Simulate Firebase auth change with the mock user
    await act(async () => {
      // First trigger with null to start anonymous sign-in
      if (authStateCallback) authStateCallback(null);
      // Wait a moment for the anonymous sign-in promise to resolve
      await new Promise(resolve => setTimeout(resolve, 10));
      // Then trigger with the mock user to simulate successful sign-in
      if (authStateCallback) authStateCallback(mockUser);
    });

    // Wait for the state update and re-render
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.getByText(`User ID: ${mockUser.uid}`)).toBeInTheDocument();
    });
  });

  it('should handle anonymous sign-in error', async () => {
    const mockError = new Error('Firebase sign-in failed');
    vi.mocked(signInAnonymously).mockRejectedValueOnce(mockError);

    // Spy on console.error to verify and suppress the error message
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <FirebaseProvider>
        <TestConsumer />
      </FirebaseProvider>
    );

    // Expect loading initially
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    // Trigger auth state change with null to start anonymous sign-in
    await act(async () => {
      if (authStateCallback) authStateCallback(null);
    });

    // Wait for the error state to be set
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.getByText(`Error: ${mockError.message}`)).toBeInTheDocument();
    });

    // Verify the error log shows the anonymous sign-in failure
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Anonymous sign-in failed:',
      expect.objectContaining({
        message: 'Firebase sign-in failed',
      })
    );

    // Restore the original console.error
    consoleErrorSpy.mockRestore();
  });

  it('should set user to null when auth state changes to null', async () => {
    const mockUser = { uid: 'test-user-123', displayName: null } as User;

    // Spy on console.error to verify and suppress the error message
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <FirebaseProvider>
        <TestConsumer />
      </FirebaseProvider>
    );

    // Simulate initial auth with a user
    await act(async () => {
      if (authStateCallback) authStateCallback(mockUser);
    });

    // Wait for user to be set
    await waitFor(() => expect(screen.getByText(`User ID: ${mockUser.uid}`)).toBeInTheDocument());

    // In the actual implementation, when auth state changes to null,
    // it initiates anonymous sign-in again - we need to make that fail
    // so the user stays null
    vi.mocked(signInAnonymously).mockRejectedValueOnce(new Error('Sign-in failed'));

    // Simulate sign-out by changing auth state to null
    await act(async () => {
      if (authStateCallback) authStateCallback(null);
    });

    // Wait for the error state to be set
    await waitFor(() => {
      // The user should be null and we should see an error
      expect(screen.getByText(/Error: Sign-in failed/)).toBeInTheDocument();
    });

    // Verify the error was properly logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Anonymous sign-in failed:',
      expect.objectContaining({
        message: 'Sign-in failed',
      })
    );

    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  it('useFirebase hook should throw error when used outside of Provider', () => {
    // Suppress console.error output for this specific test
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // We expect this render to throw an error
    expect(() => render(<TestConsumer />)).toThrow(
      'useFirebase must be used within a FirebaseProvider'
    );

    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  it('should call the unsubscribe function on unmount', () => {
    const { unmount } = render(
      <FirebaseProvider>
        <TestConsumer />
      </FirebaseProvider>
    );

    // Unmount the component
    unmount();

    // Expect the unsubscribe function to have been called
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});
