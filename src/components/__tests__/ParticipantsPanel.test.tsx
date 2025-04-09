import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlineUser } from '../../services/firebase';
import ParticipantsPanel from '../ParticipantsPanel';

// Mock lucide-react icons used in ParticipantsPanel
vi.mock('lucide-react', () => ({
  X: () => <div data-testid="x-icon">X</div>,
  Edit2: () => <div data-testid="edit-icon">Edit</div>,
  Check: () => <div data-testid="check-icon">Check</div>,
  Users: () => <div data-testid="users-icon">Users</div>,
}));

// Mock participants data
const mockParticipants: OnlineUser[] = [
  {
    id: 'user1',
    name: 'John Doe',
    color: 'bg-red-200',
    boardId: 'board1',
    lastOnline: Date.now(),
  },
  {
    id: 'user2',
    name: 'Jane Smith',
    color: 'bg-green-200',
    boardId: 'board1',
    lastOnline: Date.now(),
  },
  {
    id: 'current-user',
    name: 'Current User',
    color: 'bg-blue-200',
    boardId: 'board1',
    lastOnline: Date.now(),
  },
];

describe('ParticipantsPanel', () => {
  // Setup for each test
  const mockOnClose = vi.fn();
  const mockOnUpdateName = vi.fn();
  const mockOnUpdateColor = vi.fn();
  const currentUserId = 'current-user';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when not open', () => {
    render(
      <ParticipantsPanel
        isOpen={false}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
        onUpdateColor={mockOnUpdateColor}
      />
    );

    // Panel should not be visible
    expect(screen.queryByText('Participants')).not.toBeInTheDocument();
  });

  it('renders a list of participants when open', () => {
    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
        onUpdateColor={mockOnUpdateColor}
      />
    );

    // Panel should be visible
    expect(screen.getByText('Participants')).toBeInTheDocument();

    // Header should be visible
    expect(screen.getByText('Participants')).toBeInTheDocument();

    // All participants should be listed
    mockParticipants.forEach(participant => {
      expect(
        screen.getByText(participant.name + (participant.id === currentUserId ? ' (You)' : ''))
      ).toBeInTheDocument();
    });

    // Current user should have "(You)" next to their name
    expect(screen.getByText('Current User (You)')).toBeInTheDocument();
  });

  it('closes the panel when the close button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
        onUpdateColor={mockOnUpdateColor}
      />
    );

    // Find and click the close button
    const closeButton = screen.getByLabelText('Close panel');
    await user.click(closeButton);

    // Verify onClose was called
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows edit button only for current user', () => {
    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
        onUpdateColor={mockOnUpdateColor}
      />
    );

    // Current user should have an edit button
    const editButton = screen.getByLabelText('Edit your name and color');
    expect(editButton).toBeInTheDocument();

    // Ensure edit button is only next to Current User
    const currentUserName = screen.getByText('Current User (You)');
    expect(currentUserName.parentElement?.parentElement?.contains(editButton)).toBe(true);

    // There should only be one edit button
    expect(screen.getAllByTestId('edit-icon')).toHaveLength(1);
  });

  it('renders empty state when there are no participants', () => {
    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={[]}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
        onUpdateColor={mockOnUpdateColor}
      />
    );

    expect(screen.getByText('No participants yet')).toBeInTheDocument();
  });

  it('allows editing the current user name', async () => {
    const user = userEvent.setup();

    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
        onUpdateColor={mockOnUpdateColor}
      />
    );

    // Find and click the edit button
    const editButton = screen.getByLabelText('Edit your name and color');
    await user.click(editButton);

    // Input should appear
    const nameInput = screen.getByRole('textbox');
    expect(nameInput).toBeInTheDocument();

    // Change the name
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');

    // Save the changes
    const saveButton = screen.getByLabelText('Save changes');
    await user.click(saveButton);

    // Verify onUpdateName was called with correct parameters
    expect(mockOnUpdateName).toHaveBeenCalledWith('current-user', 'New Name');
  });

  it('allows selecting a color but only applies it when save is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
        onUpdateColor={mockOnUpdateColor}
      />
    );

    // Find and click the edit button
    const editButton = screen.getByLabelText('Edit your name and color');
    await user.click(editButton);

    // Color options should appear and the selector text should be visible
    expect(screen.getByText('Select a color:')).toBeInTheDocument();

    // Find and click a color button (red)
    const redColorButton = screen.getByTitle('Red');
    await user.click(redColorButton);

    // Verify color change is not applied yet (onUpdateColor should not be called)
    expect(mockOnUpdateColor).not.toHaveBeenCalled();

    // The "New" text should be visible to indicate pending change
    expect(screen.getByText('New: red')).toBeInTheDocument();

    // Now click save
    const saveButton = screen.getByLabelText('Save changes');
    await user.click(saveButton);

    // Verify onUpdateColor was called with correct parameters
    expect(mockOnUpdateColor).toHaveBeenCalledWith('current-user', 'bg-red-200');
  });

  it('allows updating both name and color at once', async () => {
    const user = userEvent.setup();

    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
        onUpdateColor={mockOnUpdateColor}
      />
    );

    // Find and click the edit button
    const editButton = screen.getByLabelText('Edit your name and color');
    await user.click(editButton);

    // Change the name
    const nameInput = screen.getByRole('textbox');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');

    // Select a new color (green)
    const greenColorButton = screen.getByTitle('Green');
    await user.click(greenColorButton);

    // Save all changes
    const saveButton = screen.getByLabelText('Save changes');
    await user.click(saveButton);

    // Verify both update functions were called with correct parameters
    expect(mockOnUpdateName).toHaveBeenCalledWith('current-user', 'Updated Name');
    expect(mockOnUpdateColor).toHaveBeenCalledWith('current-user', 'bg-green-200');
  });

  it("doesn't update color if the same color is selected", async () => {
    const user = userEvent.setup();

    // Create a custom participant with blue color
    const blueParticipant: OnlineUser[] = [
      {
        id: 'current-user',
        name: 'Blue User',
        color: 'bg-blue-200',
        boardId: 'board1',
        lastOnline: Date.now(),
      },
    ];

    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={blueParticipant}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
        onUpdateColor={mockOnUpdateColor}
      />
    );

    // Start editing
    const editButton = screen.getByLabelText('Edit your name and color');
    await user.click(editButton);

    // Click the blue color (same as current)
    const blueColorButton = screen.getByTitle('Blue');
    await user.click(blueColorButton);

    // Save changes
    const saveButton = screen.getByLabelText('Save changes');
    await user.click(saveButton);

    // Name update should be called, but not color (since it didn't change)
    expect(mockOnUpdateName).toHaveBeenCalled();
    expect(mockOnUpdateColor).not.toHaveBeenCalled();
  });

  it('cancels editing without saving changes when cancel button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
        onUpdateColor={mockOnUpdateColor}
      />
    );

    // Reset mocks for this test
    mockOnUpdateName.mockReset();
    mockOnUpdateColor.mockReset();

    // Find and click the edit button
    const editButton = screen.getByLabelText('Edit your name and color');
    await user.click(editButton);

    // Change the name
    const nameInput = screen.getByRole('textbox');
    await user.clear(nameInput);
    await user.type(nameInput, 'Canceled Name');

    // Select a new color
    const redColorButton = screen.getByTitle('Red');
    await user.click(redColorButton);

    // Click the cancel button
    const cancelButton = screen.getByLabelText('Cancel changes');
    await user.click(cancelButton);

    // Edit mode should be closed
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    // Verify that neither update function was called
    expect(mockOnUpdateName).not.toHaveBeenCalled();
    expect(mockOnUpdateColor).not.toHaveBeenCalled();

    // The participant name should still be displayed
    expect(screen.getByText('Current User (You)')).toBeInTheDocument();
  });
});
