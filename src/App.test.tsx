import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from './App'; // The component we're testing
import * as FirebaseContext from './contexts/FirebaseContext';

// Mock the FirebaseContext to provide the necessary values
vi.mock('./contexts/useFirebase', () => ({
  useFirebase: vi.fn(() => ({
    user: { uid: 'test-user-id', displayName: 'Test User' },
    loading: false,
    error: null,
    updateUserDisplayName: vi.fn(),
  })),
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
});
