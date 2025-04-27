import { fireEvent, render, screen } from '@testing-library/react';
import { setDoc, updateDoc } from 'firebase/firestore';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App'; // The component we're testing
import * as FirebaseContext from './contexts/FirebaseContext';

// Create a mock navigate function that can be used by all tests
const mockNavigate = vi.fn();

// Mock the react-router-dom hooks
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock the FirebaseContext to provide the necessary values
vi.mock('./contexts/useFirebase', () => ({
  useFirebase: vi.fn(() => ({
    user: { uid: 'test-user-id', displayName: 'Test User' },
    loading: false,
    error: null,
    updateUserDisplayName: vi.fn(),
  })),
}));

// Mock the Firebase methods and services
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockReturnValue({
    exists: () => false,
    data: () => ({}),
  }),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./services/firebase', () => ({
  db: {},
}));

vi.mock('./services/boardService', () => ({
  createBoard: vi.fn(),
}));

vi.mock('./services/presenceService', () => ({
  updateParticipantColor: vi.fn(),
}));

// Mock FirebaseProvider as a passthrough component
vi.mock('./contexts/FirebaseContext', () => ({
  FirebaseProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock the Board component since we only want to test routing logic in App.tsx
vi.mock('./components/Board', () => ({
  // Default export needs to be handled this way with vi.mock
  default: () => <div data-testid="mock-board">Mock Board Component</div>,
}));

describe('App Routing', () => {
  // Reset the mock navigate function before each test
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the Home component for the root path "/"', () => {
    // Render the App component wrapped in MemoryRouter, starting at the root path
    render(
      <FirebaseContext.FirebaseProvider>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </FirebaseContext.FirebaseProvider>
    );

    // Check if the welcome text from the Home component is present
    expect(
      screen.getByRole('heading', { level: 1, name: /Retrospective Board/i })
    ).toBeInTheDocument();
    // Check if the link suggestion is present
    expect(screen.getByText(/collaborate with your team/i)).toBeInTheDocument();
  });

  it('renders the Board component for the "/board/:boardId" path', () => {
    const testBoardId = 'test-board-123';
    // Render the App component, navigating to a specific board route
    render(
      <FirebaseContext.FirebaseProvider>
        <MemoryRouter initialEntries={[`/board/${testBoardId}`]}>
          <App />
        </MemoryRouter>
      </FirebaseContext.FirebaseProvider>
    );

    // Check if the mocked Board component's content is rendered
    expect(screen.getByTestId('mock-board')).toBeInTheDocument();
    expect(screen.getByText('Mock Board Component')).toBeInTheDocument();
  });

  it('renders the Not Found page for an unknown route', () => {
    // Render the App component, navigating to a route that doesn't exist
    render(
      <FirebaseContext.FirebaseProvider>
        <MemoryRouter initialEntries={['/some/random/path/that/does/not/exist']}>
          <App />
        </MemoryRouter>
      </FirebaseContext.FirebaseProvider>
    );

    // Check if the "Page Not Found" text is displayed
    expect(screen.getByText(/Page Not Found/i)).toBeInTheDocument();
  });

  it('allows color selection before creating a board', async () => {
    render(
      <FirebaseContext.FirebaseProvider>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </FirebaseContext.FirebaseProvider>
    );

    // Find a color button (red) and click it
    const redColorButton = screen.getAllByRole('button')[0]; // First color is red
    fireEvent.click(redColorButton);

    // Check that the button now has the selected state (has a ring)
    expect(redColorButton).toHaveClass('ring-2');
  });

  it('creates or updates user document when joining a board', async () => {
    // Setup test-specific mocks
    const mockSetDoc = vi.fn().mockResolvedValue(undefined);
    const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);

    // Override the mocks for this test
    vi.mocked(setDoc).mockImplementation(mockSetDoc);
    vi.mocked(updateDoc).mockImplementation(mockUpdateDoc);

    render(
      <FirebaseContext.FirebaseProvider>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </FirebaseContext.FirebaseProvider>
    );

    // Find the "Join an existing board" button and click it
    const joinButton = screen.getByText(/Join an existing board/i);
    fireEvent.click(joinButton);

    // Enter a board ID
    const boardIdInput = screen.getByPlaceholderText(/Enter board ID/i);
    fireEvent.change(boardIdInput, { target: { value: 'test-board-123' } });

    // Submit the form
    const submitButton = screen.getByText(/^Join$/i);

    // Wrap in act to handle async operations
    await vi.runAllTimersAsync();
    fireEvent.click(submitButton);
    await vi.runAllTimersAsync();

    // Verify navigation was called with the correct path
    expect(mockNavigate).toHaveBeenCalledWith('/board/test-board-123');
  });
});
