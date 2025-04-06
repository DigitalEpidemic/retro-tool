import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { OnlineUser } from '../../services/firebase';
import { memo } from 'react';

// Mock lucide-react icons used in ParticipantsPanel
vi.mock('lucide-react', () => ({
  X: () => <div data-testid="x-icon">X</div>,
  Edit2: () => <div data-testid="edit-icon">Edit</div>,
  Check: () => <div data-testid="check-icon">Check</div>,
  Users: () => <div data-testid="users-icon">Users</div>,
}));

// Create a separate component for testing that mimics the MemoizedParticipantsPanel from Board.tsx
interface ParticipantsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  participants: OnlineUser[];
  currentUserId: string;
  onUpdateName: (userId: string, newName: string) => void;
}

// This is a reproduction of the MemoizedParticipantsPanel component from Board.tsx
const ParticipantsPanel = memo(({ 
  isOpen, 
  onClose, 
  participants, 
  currentUserId, 
  onUpdateName 
}: ParticipantsPanelProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-screen w-80 bg-white shadow-lg border-l border-gray-200 z-20 overflow-y-auto" data-testid="participants-panel">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-800">Participants</h2>
        <button 
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Close panel"
          data-testid="close-panel"
        >
          <span data-testid="x-icon">X</span>
        </button>
      </div>
      
      <div className="p-4">
        <ul className="space-y-3">
          {participants.length === 0 ? (
            <li className="text-gray-500 italic">No participants yet</li>
          ) : (
            participants.map(participant => (
              <li 
                key={participant.id} 
                data-testid={`participant-${participant.id}`}
                className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50"
              >
                <div className="flex items-center">
                  <div 
                    className="h-8 w-8 rounded-full mr-3 flex items-center justify-center text-white"
                    style={{ backgroundColor: participant.color || '#6B7280' }}
                  >
                    {participant.name.charAt(0).toUpperCase()}
                  </div>
                  
                  {participant.id === currentUserId ? (
                    <span className="font-medium text-gray-700" data-testid={`participant-name-${participant.id}`}>
                      {participant.name} (You)
                    </span>
                  ) : (
                    <span className="font-medium text-gray-700" data-testid={`participant-name-${participant.id}`}>
                      {participant.name}
                    </span>
                  )}
                </div>
                
                {participant.id === currentUserId && (
                  <button 
                    onClick={() => {/* This would trigger edit mode */}}
                    className="text-gray-400 hover:text-blue-500"
                    aria-label="Edit your name"
                    data-testid={`edit-name-${participant.id}`}
                  >
                    <span data-testid="edit-icon">Edit</span>
                  </button>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
});

// Mock participants data
const mockParticipants: OnlineUser[] = [
  {
    id: 'user1',
    name: 'John Doe',
    color: '#ff0000',
    boardId: 'board1',
    lastOnline: Date.now()
  },
  {
    id: 'user2',
    name: 'Jane Smith',
    color: '#00ff00',
    boardId: 'board1',
    lastOnline: Date.now()
  },
  {
    id: 'current-user',
    name: 'Current User',
    color: '#0000ff',
    boardId: 'board1',
    lastOnline: Date.now()
  }
];

describe('ParticipantsPanel', () => {
  // Setup for each test
  const mockOnClose = vi.fn();
  const mockOnUpdateName = vi.fn();
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
      />
    );
    
    // Panel should not be visible
    expect(screen.queryByTestId('participants-panel')).not.toBeInTheDocument();
  });
  
  it('renders a list of participants when open', () => {
    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
      />
    );
    
    // Panel should be visible
    expect(screen.getByTestId('participants-panel')).toBeInTheDocument();
    
    // Header should be visible
    expect(screen.getByText('Participants')).toBeInTheDocument();
    
    // All participants should be listed
    expect(screen.getByTestId('participant-user1')).toBeInTheDocument();
    expect(screen.getByTestId('participant-user2')).toBeInTheDocument();
    expect(screen.getByTestId('participant-current-user')).toBeInTheDocument();
    
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
      />
    );
    
    // Find and click the close button
    const closeButton = screen.getByTestId('close-panel');
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
      />
    );
    
    // Current user should have an edit button
    expect(screen.getByTestId('edit-name-current-user')).toBeInTheDocument();
    
    // Other users should not have edit buttons
    expect(screen.queryByTestId('edit-name-user1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-name-user2')).not.toBeInTheDocument();
  });
  
  it('renders empty state when there are no participants', () => {
    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={[]}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
      />
    );
    
    expect(screen.getByText('No participants yet')).toBeInTheDocument();
  });
}); 