import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActionPointsPanel, { ActionPoint } from '../ActionPointsPanel';

describe('ActionPointsPanel', () => {
  const mockActionPoints: ActionPoint[] = [
    { id: '1', text: 'Test action point 1', completed: false },
    { id: '2', text: 'Test action point 2', completed: true },
  ];

  const mockOnClose = vi.fn();
  const mockOnAddActionPoint = vi.fn();
  const mockOnToggleActionPoint = vi.fn();
  const mockOnDeleteActionPoint = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when closed', () => {
    render(
      <ActionPointsPanel
        isOpen={false}
        onClose={mockOnClose}
        actionPoints={mockActionPoints}
        onAddActionPoint={mockOnAddActionPoint}
        onToggleActionPoint={mockOnToggleActionPoint}
        onDeleteActionPoint={mockOnDeleteActionPoint}
      />
    );

    expect(screen.queryByText('Action Points')).not.toBeInTheDocument();
  });

  it('should render when open', () => {
    render(
      <ActionPointsPanel
        isOpen={true}
        onClose={mockOnClose}
        actionPoints={mockActionPoints}
        onAddActionPoint={mockOnAddActionPoint}
        onToggleActionPoint={mockOnToggleActionPoint}
        onDeleteActionPoint={mockOnDeleteActionPoint}
      />
    );

    expect(screen.getByText('Action Points')).toBeInTheDocument();
    expect(screen.getByText('To do')).toBeInTheDocument();
    expect(screen.getByText('Test action point 1')).toBeInTheDocument();
    expect(screen.getByText('Test action point 2')).toBeInTheDocument();
  });

  it("should show 'no action points' message when there are no action points", () => {
    render(
      <ActionPointsPanel
        isOpen={true}
        onClose={mockOnClose}
        actionPoints={[]}
        onAddActionPoint={mockOnAddActionPoint}
        onToggleActionPoint={mockOnToggleActionPoint}
        onDeleteActionPoint={mockOnDeleteActionPoint}
      />
    );

    expect(screen.getByText('No action points yet')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    render(
      <ActionPointsPanel
        isOpen={true}
        onClose={mockOnClose}
        actionPoints={mockActionPoints}
        onAddActionPoint={mockOnAddActionPoint}
        onToggleActionPoint={mockOnToggleActionPoint}
        onDeleteActionPoint={mockOnDeleteActionPoint}
      />
    );

    fireEvent.click(screen.getByTestId('close-panel'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("should show input field when 'Add action point' button is clicked", () => {
    render(
      <ActionPointsPanel
        isOpen={true}
        onClose={mockOnClose}
        actionPoints={mockActionPoints}
        onAddActionPoint={mockOnAddActionPoint}
        onToggleActionPoint={mockOnToggleActionPoint}
        onDeleteActionPoint={mockOnDeleteActionPoint}
      />
    );

    fireEvent.click(screen.getByTestId('add-action-point-button'));

    expect(screen.getByPlaceholderText('Enter action point...')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
  });

  it('should call onAddActionPoint when new action point is added', () => {
    render(
      <ActionPointsPanel
        isOpen={true}
        onClose={mockOnClose}
        actionPoints={mockActionPoints}
        onAddActionPoint={mockOnAddActionPoint}
        onToggleActionPoint={mockOnToggleActionPoint}
        onDeleteActionPoint={mockOnDeleteActionPoint}
      />
    );

    fireEvent.click(screen.getByTestId('add-action-point-button'));

    const input = screen.getByPlaceholderText('Enter action point...');
    fireEvent.change(input, { target: { value: 'New action point' } });

    fireEvent.click(screen.getByTestId('add-action-point'));

    expect(mockOnAddActionPoint).toHaveBeenCalledWith('New action point');
  });

  it('should call onToggleActionPoint when checkbox is clicked', () => {
    render(
      <ActionPointsPanel
        isOpen={true}
        onClose={mockOnClose}
        actionPoints={mockActionPoints}
        onAddActionPoint={mockOnAddActionPoint}
        onToggleActionPoint={mockOnToggleActionPoint}
        onDeleteActionPoint={mockOnDeleteActionPoint}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    expect(mockOnToggleActionPoint).toHaveBeenCalledWith('1');
  });

  it('should call onDeleteActionPoint when delete button is clicked', () => {
    render(
      <ActionPointsPanel
        isOpen={true}
        onClose={mockOnClose}
        actionPoints={mockActionPoints}
        onAddActionPoint={mockOnAddActionPoint}
        onToggleActionPoint={mockOnToggleActionPoint}
        onDeleteActionPoint={mockOnDeleteActionPoint}
      />
    );

    const deleteButtons = screen.getAllByLabelText('Delete action point');
    fireEvent.click(deleteButtons[0]);

    expect(mockOnDeleteActionPoint).toHaveBeenCalledWith('1');
  });
});
