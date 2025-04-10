import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OptionsPanel from '../OptionsPanel';

// lucide-react icons are mocked in src/test/setup.ts

describe('OptionsPanel', () => {
  const mockOnClose = vi.fn();
  const mockOnDeleteBoard = vi.fn();
  const mockOnToggleAddColumnPlaceholder = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders when isOpen is true', () => {
    render(
      <OptionsPanel
        isOpen={true}
        onClose={mockOnClose}
        onDeleteBoard={mockOnDeleteBoard}
        isBoardCreator={true}
        showAddColumnPlaceholder={true}
        onToggleAddColumnPlaceholder={mockOnToggleAddColumnPlaceholder}
      />
    );

    expect(screen.getByText('Options')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <OptionsPanel
        isOpen={false}
        onClose={mockOnClose}
        onDeleteBoard={mockOnDeleteBoard}
        isBoardCreator={true}
        showAddColumnPlaceholder={true}
        onToggleAddColumnPlaceholder={mockOnToggleAddColumnPlaceholder}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('calls onClose when close button is clicked', () => {
    render(
      <OptionsPanel
        isOpen={true}
        onClose={mockOnClose}
        onDeleteBoard={mockOnDeleteBoard}
        isBoardCreator={true}
        showAddColumnPlaceholder={true}
        onToggleAddColumnPlaceholder={mockOnToggleAddColumnPlaceholder}
      />
    );

    fireEvent.click(screen.getByTestId('close-panel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onDeleteBoard when confirming delete', () => {
    render(
      <OptionsPanel
        isOpen={true}
        onClose={mockOnClose}
        onDeleteBoard={mockOnDeleteBoard}
        isBoardCreator={true}
        showAddColumnPlaceholder={true}
        onToggleAddColumnPlaceholder={mockOnToggleAddColumnPlaceholder}
      />
    );

    // Click delete button to show confirmation
    fireEvent.click(screen.getByTestId('delete-board-button'));

    // Should show confirmation dialog
    expect(screen.getByText(/Are you sure you want to delete this board/)).toBeInTheDocument();

    // Click confirm delete button
    fireEvent.click(screen.getByTestId('confirm-delete'));
    expect(mockOnDeleteBoard).toHaveBeenCalledTimes(1);
  });

  it('shows "Add Column Placeholder" option only for board creator', () => {
    // Test with isBoardCreator=true
    render(
      <OptionsPanel
        isOpen={true}
        onClose={mockOnClose}
        onDeleteBoard={mockOnDeleteBoard}
        isBoardCreator={true}
        showAddColumnPlaceholder={true}
        onToggleAddColumnPlaceholder={mockOnToggleAddColumnPlaceholder}
      />
    );

    expect(screen.getByText('Add Column Placeholder')).toBeInTheDocument();

    // Cleanup and re-render with isBoardCreator=false
    cleanup();

    render(
      <OptionsPanel
        isOpen={true}
        onClose={mockOnClose}
        onDeleteBoard={mockOnDeleteBoard}
        isBoardCreator={false}
        showAddColumnPlaceholder={true}
        onToggleAddColumnPlaceholder={mockOnToggleAddColumnPlaceholder}
      />
    );

    expect(screen.queryByText('Add Column Placeholder')).not.toBeInTheDocument();
  });

  it('displays correct toggle state for Add Column Placeholder', () => {
    // Test with showAddColumnPlaceholder=true
    render(
      <OptionsPanel
        isOpen={true}
        onClose={mockOnClose}
        onDeleteBoard={mockOnDeleteBoard}
        isBoardCreator={true}
        showAddColumnPlaceholder={true}
        onToggleAddColumnPlaceholder={mockOnToggleAddColumnPlaceholder}
      />
    );

    expect(screen.getByText('Shown')).toBeInTheDocument();

    // Cleanup and re-render with showAddColumnPlaceholder=false
    cleanup();

    render(
      <OptionsPanel
        isOpen={true}
        onClose={mockOnClose}
        onDeleteBoard={mockOnDeleteBoard}
        isBoardCreator={true}
        showAddColumnPlaceholder={false}
        onToggleAddColumnPlaceholder={mockOnToggleAddColumnPlaceholder}
      />
    );

    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it('calls onToggleAddColumnPlaceholder when toggle is clicked', () => {
    render(
      <OptionsPanel
        isOpen={true}
        onClose={mockOnClose}
        onDeleteBoard={mockOnDeleteBoard}
        isBoardCreator={true}
        showAddColumnPlaceholder={true}
        onToggleAddColumnPlaceholder={mockOnToggleAddColumnPlaceholder}
      />
    );

    fireEvent.click(screen.getByTestId('toggle-add-column-placeholder'));
    expect(mockOnToggleAddColumnPlaceholder).toHaveBeenCalledWith(false);

    // Cleanup and re-render with showAddColumnPlaceholder=false
    cleanup();

    render(
      <OptionsPanel
        isOpen={true}
        onClose={mockOnClose}
        onDeleteBoard={mockOnDeleteBoard}
        isBoardCreator={true}
        showAddColumnPlaceholder={false}
        onToggleAddColumnPlaceholder={mockOnToggleAddColumnPlaceholder}
      />
    );

    fireEvent.click(screen.getByTestId('toggle-add-column-placeholder'));
    expect(mockOnToggleAddColumnPlaceholder).toHaveBeenCalledWith(true);
  });
});
