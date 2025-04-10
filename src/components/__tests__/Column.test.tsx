import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { User } from 'firebase/auth'; // Import User type
import { DocumentSnapshot, getDoc } from 'firebase/firestore'; // Import getDoc from firebase/firestore
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFirebase } from '../../contexts/useFirebase'; // Adjust the import path
import { addCard } from '../../services/boardService'; // Adjust the import path
import Column from '../Column'; // This is the real component

// Mock dependencies
vi.mock('../../contexts/useFirebase', () => ({
  useFirebase: vi.fn(),
}));

vi.mock('../../services/boardService', () => ({
  addCard: vi.fn(),
  deleteColumn: vi.fn(),
}));

// Mock firebase/firestore
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    doc: vi.fn(),
    getDoc: vi.fn().mockResolvedValue({
      exists: () => true,
      data: () => ({ color: 'bg-blue-100', name: 'Test User' }),
    }),
  };
});

// lucide-react icons are mocked in src/test/setup.ts

// Mock firebase services
vi.mock('../../services/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'test-user-id' } },
  rtdb: {},
  OnlineUser: function (id: string, name: string, color: string, boardId: string) {
    return { id, name, color, boardId, lastOnline: Date.now() };
  },
}));

// Mock user data
const mockUser = { uid: 'test-user-123', displayName: null };
const mockBoardId = 'board-abc';
const mockColumnId = 'column-1'; // Corresponds to "Mad" title

describe('Column', () => {
  const mockOnSortToggle = vi.fn();

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Provide the mock user via the mocked hook
    vi.mocked(useFirebase).mockReturnValue({
      user: mockUser as User, // Cast partial mock
      loading: false,
      error: null,
    });
    // Mock addCard to resolve successfully (returns void)
    vi.mocked(addCard).mockResolvedValue(undefined);
  });

  const defaultProps = {
    id: mockColumnId,
    title: 'Default Title', // This should be overridden by the mapped title
    boardId: mockBoardId,
    sortByVotes: false,
    onSortToggle: mockOnSortToggle,
    isBoardOwner: false, // Default to not being the board owner
  };

  // Helper function to render the component
  const renderColumn = (props = {}, children = <div>Card Content</div>) => {
    return render(
      <Column {...defaultProps} {...props}>
        {children}
      </Column>
    );
  };

  // --- Rendering Tests ---
  it('renders correctly with the mapped title', async () => {
    await act(async () => {
      renderColumn();
    });
    expect(screen.getByText('Mad')).toBeInTheDocument(); // Mapped title for column-1
    expect(screen.queryByText('Default Title')).not.toBeInTheDocument();
  });

  it('renders children correctly', async () => {
    await act(async () => {
      renderColumn({}, <div data-testid="child-card">Test Card</div>);
    });
    expect(screen.getByTestId('child-card')).toBeInTheDocument();
    expect(screen.getByText('Test Card')).toBeInTheDocument();
  });

  it('renders icons', async () => {
    await act(async () => {
      renderColumn();
    });
    // Look for the SVG elements with the specific classes instead of data-testid
    expect(screen.getByRole('button', { name: 'Sort' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More options' })).toBeInTheDocument();
  });

  it('renders "Add a card" button initially', async () => {
    await act(async () => {
      renderColumn();
    });
    expect(screen.getByRole('button', { name: '+ Add a card' })).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText('Type here... Press Enter to save.')
    ).not.toBeInTheDocument();
  });

  // --- User Interaction Tests ---
  it('shows the add card form when "Add a card" button is clicked', async () => {
    renderColumn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    expect(screen.getByPlaceholderText('Type here... Press Enter to save.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add a card' })).not.toBeInTheDocument();
  });

  it('hides the add card form when "Cancel" button is clicked', async () => {
    renderColumn();
    // Open the form first
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    expect(screen.getByPlaceholderText('Type here... Press Enter to save.')).toBeInTheDocument();

    // Click Cancel
    await act(async () => {
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);
    });

    expect(
      screen.queryByPlaceholderText('Type here... Press Enter to save.')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add a card' })).toBeInTheDocument();
  });

  it('updates textarea value on change', async () => {
    renderColumn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    const textarea = screen.getByPlaceholderText(
      'Type here... Press Enter to save.'
    ) as HTMLTextAreaElement;

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'New card idea' } });
    });

    expect(textarea.value).toBe('New card idea');
  });

  it('calls addCard and hides form on submit with valid content', async () => {
    renderColumn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    const textarea = screen.getByPlaceholderText('Type here... Press Enter to save.');
    const saveButton = screen.getByRole('button', { name: 'Save' });
    const form = screen.getByTestId('add-card-form'); // Use data-testid

    // Enter content
    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: '  A valid card content  ' },
      });
    });

    expect(saveButton).not.toBeDisabled();

    // Submit form
    await act(async () => {
      fireEvent.submit(form); // Use form submit event
    });

    // Check if addCard was called correctly
    await waitFor(() => {
      expect(addCard).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(addCard)).toHaveBeenCalledWith(
      mockBoardId,
      mockColumnId,
      'A valid card content', // Content should be trimmed
      mockUser.uid,
      mockUser.displayName ?? 'Anonymous User', // Include displayName parameter
      'bg-blue-100' // Include the color parameter
    );

    // Check if form is hidden and input cleared
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText('Type here... Press Enter to save.')
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '+ Add a card' })).toBeInTheDocument();
    });
  });

  it('calls onSortToggle when sort button is clicked', async () => {
    renderColumn();

    await act(async () => {
      const sortButton = screen.getByRole('button', { name: /Sort/ }); // Use regex to find button containing "Sort"
      fireEvent.click(sortButton);
    });

    expect(mockOnSortToggle).toHaveBeenCalledTimes(1);
  });

  // --- State/Prop Change Tests ---
  it('shows "Votes" text when sortByVotes is true', async () => {
    await act(async () => {
      renderColumn({ sortByVotes: true });
    });
    expect(screen.getByText('Votes')).toBeInTheDocument();
  });

  it('does not show "Votes" text when sortByVotes is false', async () => {
    await act(async () => {
      renderColumn({ sortByVotes: false });
    });
    expect(screen.queryByText('Votes')).not.toBeInTheDocument();
  });

  // --- Firestore Integration (Mocked) Tests ---
  it('handles error when addCard fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorMessage = 'Failed to add card';
    vi.mocked(addCard).mockRejectedValue(new Error(errorMessage)); // Use vi.mocked

    renderColumn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    const textarea = screen.getByPlaceholderText('Type here... Press Enter to save.');
    const form = screen.getByTestId('add-card-form'); // Use data-testid

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Card content' } });
    });

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(addCard).toHaveBeenCalledTimes(1);
    });

    // Check if error was logged (or handle UI feedback if implemented)
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error adding card:', expect.any(Error));
    expect(consoleErrorSpy.mock.calls[0][1].message).toBe(errorMessage);

    // Form should potentially remain open on error, depending on desired UX
    expect(screen.getByPlaceholderText('Type here... Press Enter to save.')).toBeInTheDocument();

    consoleErrorSpy.mockRestore(); // Clean up spy
  });

  // --- Edge Case Tests ---
  it('does not call addCard if content is empty or whitespace', async () => {
    renderColumn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    const textarea = screen.getByPlaceholderText('Type here... Press Enter to save.');
    const saveButton = screen.getByRole('button', { name: 'Save' });
    const form = screen.getByTestId('add-card-form'); // Use data-testid

    // Try with empty content
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '' } });
    });

    expect(saveButton).toBeDisabled();

    await act(async () => {
      fireEvent.submit(form);
    });

    expect(addCard).not.toHaveBeenCalled();

    // Try with whitespace only
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '   ' } });
    });

    expect(saveButton).toBeDisabled();

    await act(async () => {
      fireEvent.submit(form);
    });

    expect(addCard).not.toHaveBeenCalled();
  });

  it('disables Save button if user is null', async () => {
    // Simulate no user, but provide full context type
    vi.mocked(useFirebase).mockReturnValue({
      user: null,
      loading: false,
      error: null,
    });
    renderColumn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    const textarea = screen.getByPlaceholderText('Type here... Press Enter to save.');
    const saveButton = screen.getByRole('button', { name: 'Save' });

    // Even with content, button should be disabled if no user
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Some content' } });
    });

    expect(saveButton).toBeDisabled();
  });

  it('uses default title if id does not match mapped titles', async () => {
    await act(async () => {
      renderColumn({ id: 'unknown-column', title: 'Fallback Title' });
    });
    expect(screen.getByText('Fallback Title')).toBeInTheDocument();
    expect(screen.queryByText('Mad')).not.toBeInTheDocument();
  });

  // Test to verify the user's displayName and color are correctly passed to addCard
  it("passes user's displayName and color to addCard", async () => {
    // Mock Firestore to return a user color
    const mockUserColor = 'bg-blue-100'; // Light blue color

    // Mock getDoc from Firestore to return a user with color
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({
        color: mockUserColor,
        name: 'Test User',
      }),
    } as unknown as DocumentSnapshot<unknown>);

    // Mock a user with a displayName
    const userWithName = {
      uid: 'test-user-123',
      displayName: 'Test User',
    };

    // Mock the firebase hook to return a user with displayName
    vi.mocked(useFirebase).mockReturnValue({
      user: userWithName as User,
      loading: false,
      error: null,
    });

    renderColumn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    const textarea = screen.getByPlaceholderText('Type here... Press Enter to save.');
    const form = screen.getByTestId('add-card-form');

    // Enter content
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'New card content' } });
    });

    // Submit form
    await act(async () => {
      fireEvent.submit(form);
    });

    // Verify addCard was called with the correct displayName and color
    await waitFor(() => {
      expect(addCard).toHaveBeenCalledTimes(1);
      expect(vi.mocked(addCard)).toHaveBeenCalledWith(
        mockBoardId,
        mockColumnId,
        'New card content',
        userWithName.uid,
        userWithName.displayName,
        mockUserColor // Should include the color from Firestore
      );
    });
  });

  // Test to verify anonymous fallback when displayName is null
  it("uses 'Anonymous User' as fallback when displayName is null", async () => {
    // Mock a user with null displayName
    const userWithoutName = {
      uid: 'test-user-123',
      displayName: null,
    };

    // Mock the firebase hook to return a user without displayName
    vi.mocked(useFirebase).mockReturnValue({
      user: userWithoutName as User,
      loading: false,
      error: null,
    });

    renderColumn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    const textarea = screen.getByPlaceholderText('Type here... Press Enter to save.');
    const form = screen.getByTestId('add-card-form');

    // Enter content
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Anonymous card' } });
    });

    // Submit form
    await act(async () => {
      fireEvent.submit(form);
    });

    // Verify addCard was called with the "Anonymous User" fallback
    await waitFor(() => {
      expect(addCard).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(addCard)).toHaveBeenCalledWith(
      mockBoardId,
      mockColumnId,
      'Anonymous card',
      userWithoutName.uid,
      'Anonymous User',
      'bg-blue-100' // Default light blue color
    );
  });

  // --- Snapshot Testing ---
  it('matches snapshot', async () => {
    let container;
    await act(async () => {
      const renderResult = renderColumn();
      container = renderResult.container;
    });
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when adding card', async () => {
    let container;
    await act(async () => {
      const renderResult = renderColumn();
      container = renderResult.container;
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot when sorted by votes', async () => {
    let container;
    await act(async () => {
      const renderResult = renderColumn({ sortByVotes: true });
      container = renderResult.container;
    });
    expect(container).toMatchSnapshot();
  });

  // Test for Enter key functionality
  it('adds a card when pressing Enter in the textarea', async () => {
    renderColumn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    const textarea = screen.getByPlaceholderText('Type here... Press Enter to save.');

    // Enter content
    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: 'New card via Enter key' },
      });
    });

    // Press Enter key
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    });

    // Check if addCard was called correctly
    await waitFor(() => {
      expect(addCard).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(addCard)).toHaveBeenCalledWith(
      mockBoardId,
      mockColumnId,
      'New card via Enter key',
      mockUser.uid,
      mockUser.displayName ?? 'Anonymous User',
      'bg-blue-100' // Default light blue color
    );

    // Form should be hidden after submission
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText('Type here... Press Enter to save.')
      ).not.toBeInTheDocument();
    });
  });

  it('does not add a card when pressing Enter with Shift key', async () => {
    renderColumn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    const textarea = screen.getByPlaceholderText('Type here... Press Enter to save.');

    // Enter content
    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: 'Content with line break' },
      });
    });

    // Press Enter with Shift key (should add a new line instead of submitting)
    await act(async () => {
      fireEvent.keyDown(textarea, {
        key: 'Enter',
        code: 'Enter',
        shiftKey: true,
      });
    });

    // Check that addCard was not called
    expect(addCard).not.toHaveBeenCalled();

    // Form should still be visible
    expect(screen.getByPlaceholderText('Type here... Press Enter to save.')).toBeInTheDocument();
  });

  it('does not add a card when pressing Enter with empty content', async () => {
    renderColumn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    const textarea = screen.getByPlaceholderText('Type here... Press Enter to save.');

    // Leave content empty
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '' } });
    });

    // Press Enter key
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });
    });

    // Check that addCard was not called
    expect(addCard).not.toHaveBeenCalled();

    // Form should still be visible
    expect(screen.getByPlaceholderText('Type here... Press Enter to save.')).toBeInTheDocument();
  });

  it('cancels adding a card when pressing Escape key', async () => {
    renderColumn();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '+ Add a card' }));
    });

    const textarea = screen.getByPlaceholderText('Type here... Press Enter to save.');

    // Enter some content
    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: 'Content that will be discarded' },
      });
    });

    // Press Escape key
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Escape', code: 'Escape' });
    });

    // Form should be hidden after Escape
    expect(
      screen.queryByPlaceholderText('Type here... Press Enter to save.')
    ).not.toBeInTheDocument();

    // "Add a card" button should be visible again
    expect(screen.getByRole('button', { name: '+ Add a card' })).toBeInTheDocument();

    // addCard should not have been called
    expect(addCard).not.toHaveBeenCalled();
  });

  // Add tests for column menu
  describe('Column menu functionality', () => {
    it('opens the dropdown menu when clicking the MoreVertical icon', async () => {
      renderColumn();

      // Initially, the dropdown should not be visible
      expect(screen.queryByText('Delete column')).not.toBeInTheDocument();

      // Click the menu button
      await act(async () => {
        const menuButton = screen.getByTestId('column-menu-column-1');
        fireEvent.click(menuButton);
      });

      // Now the dropdown should be visible
      expect(screen.getByText('Delete column')).toBeInTheDocument();
    });

    it('shows a disabled delete option for non-owner users', async () => {
      renderColumn({ isBoardOwner: false });

      // Open the menu
      await act(async () => {
        const menuButton = screen.getByTestId('column-menu-column-1');
        fireEvent.click(menuButton);
      });

      // Find the delete button and check it's disabled
      const deleteButton = screen.getByTestId('delete-column-column-1');
      expect(deleteButton).toBeDisabled();
      expect(deleteButton).toHaveClass('text-gray-400');
      expect(deleteButton).toHaveClass('cursor-not-allowed');
    });

    it('shows an enabled delete option for board owners', async () => {
      renderColumn({ isBoardOwner: true });

      // Open the menu
      await act(async () => {
        const menuButton = screen.getByTestId('column-menu-column-1');
        fireEvent.click(menuButton);
      });

      // Find the delete button and check it's enabled
      const deleteButton = screen.getByTestId('delete-column-column-1');
      expect(deleteButton).not.toBeDisabled();
      expect(deleteButton).toHaveClass('text-red-600');
      expect(deleteButton).toHaveClass('hover:bg-gray-100');
      expect(deleteButton).toHaveClass('cursor-pointer');
    });

    it('calls deleteColumn when delete button is clicked by board owner', async () => {
      // Import deleteColumn from the mock
      const { deleteColumn } = await import('../../services/boardService');
      // Setup the mock to return success
      vi.mocked(deleteColumn).mockResolvedValue({ success: true });

      renderColumn({ isBoardOwner: true });

      // Open the menu
      await act(async () => {
        fireEvent.click(screen.getByTestId('column-menu-column-1'));
      });

      // Click the delete button
      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-column-column-1'));
      });

      // Check if deleteColumn was called correctly
      await waitFor(() => {
        expect(deleteColumn).toHaveBeenCalledTimes(1);
        expect(vi.mocked(deleteColumn)).toHaveBeenCalledWith(mockBoardId, mockColumnId);
      });
    });

    it('handles error when deleteColumn fails', async () => {
      // Spy on console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Import deleteColumn from the mock
      const { deleteColumn } = await import('../../services/boardService');
      // Setup the mock to return failure
      vi.mocked(deleteColumn).mockResolvedValue({
        success: false,
        error: 'Failed to delete column',
      });

      renderColumn({ isBoardOwner: true });

      // Open the menu
      await act(async () => {
        fireEvent.click(screen.getByTestId('column-menu-column-1'));
      });

      // Click the delete button
      await act(async () => {
        fireEvent.click(screen.getByTestId('delete-column-column-1'));
      });

      // Check if error was logged
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to delete column:',
          'Failed to delete column'
        );
      });

      consoleErrorSpy.mockRestore();
    });

    it('closes the menu when clicking outside', async () => {
      renderColumn();

      // Open the menu
      await act(async () => {
        const menuButton = screen.getByTestId('column-menu-column-1');
        fireEvent.click(menuButton);
      });

      // The dropdown should be visible
      expect(screen.getByText('Delete column')).toBeInTheDocument();

      // Click outside the menu
      await act(async () => {
        fireEvent.mouseDown(document.body);
      });

      // Now the dropdown should be hidden
      expect(screen.queryByText('Delete column')).not.toBeInTheDocument();
    });
  });
});
