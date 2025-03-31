import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, beforeEach, test, expect } from 'vitest';
import Card from '../Card';
import * as cardService from '../../services/cardService';

// Mock the card service
vi.mock('../../services/cardService', () => ({
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  voteForCard: vi.fn(),
}));

describe('Card component', () => {
  const mockProvided = {
    innerRef: vi.fn(),
    draggableProps: {},
    dragHandleProps: {},
  };
  
  const mockCard = {
    id: 'card1',
    content: 'Test card content',
    authorId: 'user1',
    authorName: 'User 1',
    votes: 2,
  };
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  test('renders card content correctly', () => {
    render(<Card provided={mockProvided} card={mockCard} isOwner={true} />);
    expect(screen.getByText('Test card content')).toBeInTheDocument();
    expect(screen.getByText('User 1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
  
  test('shows edit and delete buttons for card owner', () => {
    render(<Card provided={mockProvided} card={mockCard} isOwner={true} />);
    expect(screen.getByLabelText(/edit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/delete/i)).toBeInTheDocument();
  });
  
  test('hides edit and delete buttons for non-owners', () => {
    render(<Card provided={mockProvided} card={mockCard} isOwner={false} />);
    expect(screen.queryByLabelText(/edit/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/delete/i)).not.toBeInTheDocument();
  });
  
  test('allows voting on cards', () => {
    render(<Card provided={mockProvided} card={mockCard} isOwner={false} />);
    fireEvent.click(screen.getByLabelText(/thumbs up/i));
    expect(cardService.voteForCard).toHaveBeenCalledWith('card1');
  });
  
  test('enters edit mode when edit button is clicked', () => {
    render(<Card provided={mockProvided} card={mockCard} isOwner={true} />);
    fireEvent.click(screen.getByLabelText(/edit/i));
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test card content')).toBeInTheDocument();
  });
  
  test('updates card content on save', () => {
    render(<Card provided={mockProvided} card={mockCard} isOwner={true} />);
    
    // Enter edit mode
    fireEvent.click(screen.getByLabelText(/edit/i));
    
    // Update content
    const textarea = screen.getByDisplayValue('Test card content');
    fireEvent.change(textarea, { target: { value: 'Updated content' } });
    
    // Save changes
    fireEvent.click(screen.getByText('Save'));
    
    // Verify service was called
    expect(cardService.updateCard).toHaveBeenCalledWith('card1', { content: 'Updated content' });
  });
}); 