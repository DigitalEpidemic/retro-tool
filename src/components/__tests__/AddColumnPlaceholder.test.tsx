import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddColumnPlaceholder from '../AddColumnPlaceholder';
import { addColumn } from '../../services/boardService';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the boardService
vi.mock('../../services/boardService', () => ({
  addColumn: vi.fn(),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Plus: () => <div data-testid="plus-icon">Plus</div>,
}));

describe('AddColumnPlaceholder', () => {
  const mockBoardId = 'test-board-id';
  const mockOnColumnAdded = vi.fn();

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('renders the placeholder with "Create Column" button', () => {
    render(<AddColumnPlaceholder boardId={mockBoardId} />);

    expect(screen.getByText('Create New Column')).toBeInTheDocument();
    expect(
      screen.getByText('Add a new column to collect feedback in different categories')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Column' })).toBeInTheDocument();
  });

  it('shows the form when the create button is clicked', () => {
    render(<AddColumnPlaceholder boardId={mockBoardId} />);

    // Click the create button
    fireEvent.click(screen.getByRole('button', { name: 'Create Column' }));

    // Form elements should be visible
    expect(screen.getByLabelText('Column Title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Column' })).toBeInTheDocument();
  });

  it('calls addColumn service when form is submitted', async () => {
    // Mock successful response
    (addColumn as any).mockResolvedValue({ success: true, columnId: 'new-column-id' });

    render(<AddColumnPlaceholder boardId={mockBoardId} onColumnAdded={mockOnColumnAdded} />);

    // Click the create button to show form
    fireEvent.click(screen.getByRole('button', { name: 'Create Column' }));

    // Fill in the form
    fireEvent.change(screen.getByLabelText('Column Title'), {
      target: { value: 'New Test Column' },
    });

    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: 'Add Column' }));

    // Verify service was called with correct arguments
    await waitFor(() => {
      expect(addColumn).toHaveBeenCalledWith(mockBoardId, 'New Test Column');
      expect(mockOnColumnAdded).toHaveBeenCalled();
    });

    // Form should be hidden and placeholder shown again
    await waitFor(() => {
      expect(screen.getByText('Create New Column')).toBeInTheDocument();
    });
  });

  it('shows error message when column addition fails', async () => {
    // Mock failed response
    (addColumn as any).mockResolvedValue({
      success: false,
      error: 'Failed to add column',
    });

    render(<AddColumnPlaceholder boardId={mockBoardId} />);

    // Click create button and fill form
    fireEvent.click(screen.getByRole('button', { name: 'Create Column' }));
    fireEvent.change(screen.getByLabelText('Column Title'), {
      target: { value: 'New Test Column' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Column' }));

    // Error message should be displayed
    await waitFor(() => {
      expect(screen.getByText('Failed to add column')).toBeInTheDocument();
    });

    // Form should still be visible
    expect(screen.getByLabelText('Column Title')).toBeInTheDocument();

    // Callback should not have been called
    expect(mockOnColumnAdded).not.toHaveBeenCalled();
  });

  it('cancels form submission when cancel button is clicked', () => {
    render(<AddColumnPlaceholder boardId={mockBoardId} />);

    // Show the form
    fireEvent.click(screen.getByRole('button', { name: 'Create Column' }));

    // Fill in the form
    fireEvent.change(screen.getByLabelText('Column Title'), {
      target: { value: 'New Test Column' },
    });

    // Click cancel
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Form should be hidden and placeholder shown again
    expect(screen.getByText('Create New Column')).toBeInTheDocument();

    // Service should not have been called
    expect(addColumn).not.toHaveBeenCalled();
  });
});
