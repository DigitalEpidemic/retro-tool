import { DraggableProvided } from '@hello-pangea/dnd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Timestamp } from 'firebase/firestore'; // Import Timestamp
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Card as CardType } from '../../services/firebase';
import Card from '../Card';

// Mock the boardService functions
vi.mock('../../services/boardService', () => ({
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  voteForCard: vi.fn().mockResolvedValue(undefined), // Mock vote to resolve successfully
}));

// Mock icons to avoid SVG rendering issues in tests
vi.mock('lucide-react', () => ({
  Edit2: () => <div data-testid="edit-icon">Edit</div>,
  Trash2: () => <div data-testid="trash-icon">Delete</div>,
  Check: () => <div data-testid="check-icon">Save</div>,
  X: () => <div data-testid="x-icon">Cancel</div>,
  ThumbsUp: () => <div data-testid="thumbs-up-icon">Upvote</div>,
  ThumbsDown: () => <div data-testid="thumbs-down-icon">Downvote</div>,
}));

// Mock window.confirm
global.confirm = vi.fn(() => true); // Assume user confirms deletion

// Helper function to create mock DraggableProvided
const mockDraggableProvided = (): DraggableProvided => ({
  innerRef: vi.fn(),
  draggableProps: {
    // Add required properties based on TS errors
    'data-rfd-draggable-context-id': 'mock-context-1', // Using placeholder
    'data-rfd-draggable-id': 'mock-draggable-1', // Using placeholder
    style: {},
    onTransitionEnd: vi.fn(),
  },
  dragHandleProps: {
    // Add required properties based on TS errors
    'data-rfd-drag-handle-draggable-id': 'mock-draggable-1', // Using placeholder
    'data-rfd-drag-handle-context-id': 'mock-context-1', // Using placeholder
    role: 'button',
    tabIndex: 0,
    draggable: false,
    onDragStart: vi.fn(),
    'aria-describedby': 'id',
  },
});

describe('Card', () => {
  let mockCard: CardType;
  let provided: DraggableProvided;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    (global.confirm as ReturnType<typeof vi.fn>).mockClear().mockReturnValue(true);

    mockCard = {
      id: 'card-1',
      boardId: 'board-1', // Added
      content: 'Test Card Content',
      columnId: 'column-1', // Mad column (green)
      votes: 5,
      authorId: 'user-1',
      authorName: 'Test User',
      createdAt: Timestamp.now(), // Use Firestore Timestamp mock
      position: 1, // Added
    };
    provided = mockDraggableProvided();
  });

  // 1. Rendering Tests
  it('renders correctly with given props', () => {
    render(<Card provided={provided} card={mockCard} isOwner={true} />);
    expect(screen.getByText('Test Card Content')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // Votes
    expect(screen.getByText('Test User')).toBeInTheDocument(); // Author name
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upvote' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Downvote' })).toBeInTheDocument();
  });

  it('renders correctly when not the owner', () => {
    render(<Card provided={provided} card={mockCard} isOwner={false} />);
    expect(screen.getByText('Test Card Content')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('renders default author name if authorName is missing', () => {
    // Adjust mock to satisfy CardType while testing the component's fallback logic
    // Ideally, CardType would have authorName?: string
    const cardWithoutAuthorName = {
      ...mockCard,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authorName: undefined as any, // Cast to bypass TS error for this specific test case
    };
    render(
      <Card
        provided={provided}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        card={cardWithoutAuthorName as CardType} // Cast needed because of the 'any' above
        isOwner={true}
      />
    );
    expect(screen.getByText('Wonderful Turtle')).toBeInTheDocument();
  });

  it('applies correct background color based on columnId (column-1)', () => {
    const { container } = render(<Card provided={provided} card={mockCard} isOwner={true} />); // Removed extra closing parenthesis here
    // Find the main div using the ref assignment logic (or a data-testid if added)
    // Here we check the first child div which receives the classes
    const cardElement = container.firstChild as HTMLElement;
    expect(cardElement).toHaveClass('bg-green-100');
  });

  it('applies correct background color based on columnId (column-2, even ID)', () => {
    const cardCol2Even = { ...mockCard, columnId: 'column-2', id: 'card-2' }; // Even ASCII for '2'
    const { container } = render(<Card provided={provided} card={cardCol2Even} isOwner={true} />);
    const cardElement = container.firstChild as HTMLElement;
    expect(cardElement).toHaveClass('bg-purple-100');
  });

  it('applies correct background color based on columnId (column-2, odd ID)', () => {
    const cardCol2Odd = { ...mockCard, columnId: 'column-2', id: 'card-1' }; // Odd ASCII for '1'
    const { container } = render(<Card provided={provided} card={cardCol2Odd} isOwner={true} />);
    const cardElement = container.firstChild as HTMLElement;
    expect(cardElement).toHaveClass('bg-purple-100');
  });

  it('applies correct background color based on columnId (column-3, even ID)', () => {
    const cardCol3Even = { ...mockCard, columnId: 'column-3', id: 'card-2' }; // Even ASCII for '2'
    const { container } = render(<Card provided={provided} card={cardCol3Even} isOwner={true} />);
    const cardElement = container.firstChild as HTMLElement;
    expect(cardElement).toHaveClass('bg-purple-100');
  });

  it('applies correct background color based on columnId (column-3, odd ID)', () => {
    const cardCol3Odd = { ...mockCard, columnId: 'column-3', id: 'card-1' }; // Odd ASCII for '1'
    const { container } = render(<Card provided={provided} card={cardCol3Odd} isOwner={true} />);
    const cardElement = container.firstChild as HTMLElement;
    expect(cardElement).toHaveClass('bg-purple-100');
  });

  it('applies default background color for unknown columnId (odd ID)', () => {
    const cardUnknownCol = {
      ...mockCard,
      columnId: 'unknown-column',
      id: 'card-1',
    }; // Odd ASCII for '1'
    const { container } = render(<Card provided={provided} card={cardUnknownCol} isOwner={true} />);
    const cardElement = container.firstChild as HTMLElement;
    expect(cardElement).toHaveClass('bg-purple-100'); // Default fallback for odd
  });

  it("uses card's color property when available", () => {
    const cardWithColor = {
      ...mockCard,
      color: 'bg-blue-300', // Dark blue Tailwind class
    };
    const { container } = render(<Card provided={provided} card={cardWithColor} isOwner={true} />);
    const cardElement = container.firstChild as HTMLElement;
    expect(cardElement).toHaveClass('bg-blue-300'); // Should directly use the Tailwind class
  });

  // 2. User Interaction Tests
  it('enters edit mode when edit button is clicked', () => {
    render(<Card provided={provided} card={mockCard} isOwner={true} />);
    // Find button via the icon's test id
    const editButton = screen.getByRole('button', { name: 'Edit' });
    expect(editButton).toBeInTheDocument(); // Ensure button is found
    fireEvent.click(editButton!); // Use non-null assertion

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test Card Content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByText(mockCard.authorName)).not.toBeInTheDocument();
  });

  it('calls updateCard and exits edit mode when save button is clicked', async () => {
    const { updateCard } = await import('../../services/boardService');
    render(<Card provided={provided} card={mockCard} isOwner={true} />);

    // Enter edit mode
    const editButton = screen.getByRole('button', { name: 'Edit' });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton!);

    // Change content
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Updated Content' } });

    // Click save
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // Assertions
    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(updateCard).toHaveBeenCalledWith('card-1', {
      content: 'Updated Content',
    });

    // Wait for the state update to hide the textarea
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
    // Check if the original content display is back (though it will show old content until prop updates)
    expect(screen.getByText('Test Card Content')).toBeInTheDocument();
  });

  it('does not call updateCard if content is empty when saving', async () => {
    const { updateCard } = await import('../../services/boardService');
    render(<Card provided={provided} card={mockCard} isOwner={true} />);

    const editButton = screen.getByRole('button', { name: 'Edit' });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton!);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '   ' } }); // Empty content
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateCard).not.toHaveBeenCalled();
    // Should remain in edit mode
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('exits edit mode without saving when cancel button is clicked', async () => {
    const { updateCard } = await import('../../services/boardService');
    render(<Card provided={provided} card={mockCard} isOwner={true} />);

    // Enter edit mode
    const editButton = screen.getByRole('button', { name: 'Edit' });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton!);

    // Change content (optional, just to ensure it doesn't save)
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Temporary Edit' },
    });

    // Click cancel
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Assertions
    expect(updateCard).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Test Card Content')).toBeInTheDocument(); // Original content shown
  });

  it('calls deleteCard when delete button is clicked and confirmed', async () => {
    const { deleteCard } = await import('../../services/boardService');
    render(<Card provided={provided} card={mockCard} isOwner={true} />);

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toBeInTheDocument();
    fireEvent.click(deleteButton!);

    expect(global.confirm).toHaveBeenCalledTimes(1);
    expect(deleteCard).toHaveBeenCalledTimes(1);
    expect(deleteCard).toHaveBeenCalledWith('card-1');
  });

  it('does not call deleteCard when delete button is clicked and cancelled', async () => {
    const { deleteCard } = await import('../../services/boardService');
    (global.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false); // Simulate user cancelling
    render(<Card provided={provided} card={mockCard} isOwner={true} />);

    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toBeInTheDocument();
    fireEvent.click(deleteButton!);

    expect(global.confirm).toHaveBeenCalledTimes(1);
    expect(deleteCard).not.toHaveBeenCalled();
  });

  it('calls voteForCard with "up" when thumbs up is clicked', async () => {
    const { voteForCard } = await import('../../services/boardService');
    render(<Card provided={provided} card={mockCard} isOwner={true} />);

    const thumbsUpButton = screen.getByRole('button', { name: 'Upvote' });
    expect(thumbsUpButton).toBeInTheDocument();
    fireEvent.click(thumbsUpButton!);

    expect(voteForCard).toHaveBeenCalledTimes(1);
    expect(voteForCard).toHaveBeenCalledWith('card-1', 'up');
  });

  it('calls voteForCard with "down" when thumbs down is clicked', async () => {
    const { voteForCard } = await import('../../services/boardService');
    render(<Card provided={provided} card={mockCard} isOwner={true} />);

    const thumbsDownButton = screen.getByRole('button', { name: 'Downvote' });
    expect(thumbsDownButton).toBeInTheDocument();
    fireEvent.click(thumbsDownButton!);

    expect(voteForCard).toHaveBeenCalledTimes(1);
    expect(voteForCard).toHaveBeenCalledWith('card-1', 'down');
  });

  // 3. State/Prop Change Tests (implicitly covered by interaction tests, but can add specific ones)
  it('updates displayed content when card prop changes', () => {
    const { rerender } = render(<Card provided={provided} card={mockCard} isOwner={true} />);
    expect(screen.getByText('Test Card Content')).toBeInTheDocument();

    const updatedCard = { ...mockCard, content: 'New Content From Prop' };
    rerender(<Card provided={provided} card={updatedCard} isOwner={true} />);

    expect(screen.getByText('New Content From Prop')).toBeInTheDocument();
    expect(screen.queryByText('Test Card Content')).not.toBeInTheDocument();
  });

  it('updates displayed votes when card prop changes', () => {
    const { rerender } = render(<Card provided={provided} card={mockCard} isOwner={true} />);
    expect(screen.getByText('5')).toBeInTheDocument();

    const updatedCard = { ...mockCard, votes: 10 };
    rerender(<Card provided={provided} card={updatedCard} isOwner={true} />);

    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  // 4. Firestore Integration (Mocked) - Covered by interaction tests calling mocked service functions

  // 5. Edge Cases
  it('handles card with empty content correctly', () => {
    const emptyContentCard = { ...mockCard, content: '' };
    render(<Card provided={provided} card={emptyContentCard} isOwner={true} />);
    // Check that the container is there, but the specific content text isn't
    expect(screen.queryByText('Test Card Content')).not.toBeInTheDocument();
    // Check for author and votes to ensure the rest renders
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  // 6. Snapshot Testing
  it('matches snapshot when owner', () => {
    const { container } = render(<Card provided={provided} card={mockCard} isOwner={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when not owner', () => {
    const { container } = render(<Card provided={provided} card={mockCard} isOwner={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when editing', () => {
    const { container } = render(<Card provided={provided} card={mockCard} isOwner={true} />);
    const editButton = screen.getByRole('button', { name: 'Edit' });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton!);
    expect(container.firstChild).toMatchSnapshot();
  });
});
