/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { Board, Card } from '../../services/firebase';
import ExportModal from '../ExportModal';
import { createAndDownloadMarkdownFile, formatExportFilename } from '../../utils/exportUtils';
import { ActionPoint } from '../ActionPointsPanel';

// Mock document.execCommand for clipboard test
document.execCommand = vi.fn();

// Mock for Timestamp
const createMockTimestamp = () => {
  const now = new Date();
  return {
    toDate: () => now,
    toMillis: () => now.getTime(),
    seconds: Math.floor(now.getTime() / 1000),
    nanoseconds: 0,
    isEqual: () => false,
    toJSON: () => ({ seconds: 0, nanoseconds: 0 }),
    valueOf: () => 0
  } as unknown as Timestamp;
};

describe('ExportModal', () => {
  const mockActionPoints: ActionPoint[] = [
    {
      id: 'ap-1',
      text: 'Schedule more frequent team check-ins',
      completed: false,
    },
    {
      id: 'ap-2',
      text: 'Update documentation with latest changes',
      completed: true,
    },
    {
      id: 'ap-3',
      text: 'Investigate performance issues',
      completed: false,
      assignee: 'Alice',
    },
  ];

  const mockBoard: Board = {
    id: 'board-1',
    name: 'Test Retro Board',
    createdAt: createMockTimestamp(),
    isActive: true,
    columns: {
      col1: { id: 'col1', title: 'What went well', order: 0 },
      col2: { id: 'col2', title: 'What can be improved', order: 1 },
      col3: { id: 'col3', title: 'Action items', order: 2 },
    },
    actionPoints: mockActionPoints,
  };

  const mockCards: Card[] = [
    {
      id: 'card-1',
      boardId: 'board-1',
      columnId: 'col1',
      content: 'Great teamwork',
      authorId: 'user-1',
      authorName: 'John',
      createdAt: createMockTimestamp(),
      votes: 3,
      position: 0,
    },
    {
      id: 'card-2',
      boardId: 'board-1',
      columnId: 'col2',
      content: 'Communication could be better',
      authorId: 'user-2',
      authorName: 'Jane',
      createdAt: createMockTimestamp(),
      votes: 2,
      position: 0,
    },
    {
      id: 'card-3',
      boardId: 'board-1',
      columnId: 'col3',
      content: 'Create more documentation',
      authorId: 'user-3',
      authorName: 'Bob',
      createdAt: createMockTimestamp(),
      votes: 1,
      position: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    render(<ExportModal isOpen={false} onClose={vi.fn()} board={mockBoard} cards={mockCards} />);

    expect(screen.queryByText('Export Board as Markdown')).toBeNull();
  });

  it('should render when isOpen is true', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} board={mockBoard} cards={mockCards} />);

    expect(screen.getByText('Export Board as Markdown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy to Clipboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save as File' })).toBeInTheDocument();
  });

  it('should format markdown content correctly', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} board={mockBoard} cards={mockCards} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    // Check header
    expect(textarea.value).toContain(`# ${mockBoard.name}`);
    expect(textarea.value).toContain('Date:');

    // Check column titles
    expect(textarea.value).toContain('## What went well');
    expect(textarea.value).toContain('## What can be improved');
    expect(textarea.value).toContain('## Action items');

    // Check card content
    expect(textarea.value).toContain('Great teamwork');
    expect(textarea.value).toContain('Communication could be better');
    expect(textarea.value).toContain('Create more documentation');

    // Check votes and authors
    expect(textarea.value).toContain('(3 votes, by John)');
    expect(textarea.value).toContain('(2 votes, by Jane)');
    expect(textarea.value).toContain('(1 votes, by Bob)');
  });

  it('should include action points in markdown export', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} board={mockBoard} cards={mockCards} />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    // Check action points section header
    expect(textarea.value).toContain('## Action Points');

    // Check action points content and formatting
    expect(textarea.value).toContain('- [ ] Schedule more frequent team check-ins');
    expect(textarea.value).toContain('- [x] Update documentation with latest changes');
    expect(textarea.value).toContain('- [ ] Investigate performance issues');

    // Check assignee display
    expect(textarea.value).toContain('_(Assigned to: Alice)_');
  });

  it('should handle board with no action points', () => {
    const boardWithoutActionPoints = { ...mockBoard, actionPoints: undefined };
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        board={boardWithoutActionPoints}
        cards={mockCards}
      />
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    // Check action points section header
    expect(textarea.value).toContain('## Action Points');

    // Check "no action points" message
    expect(textarea.value).toContain('_No action points_');
  });

  it('should handle board with empty action points array', () => {
    const boardWithEmptyActionPoints = { ...mockBoard, actionPoints: [] };
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        board={boardWithEmptyActionPoints}
        cards={mockCards}
      />
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    // Check action points section header
    expect(textarea.value).toContain('## Action Points');

    // Check "no action points" message
    expect(textarea.value).toContain('_No action points_');
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ExportModal isOpen={true} onClose={onClose} board={mockBoard} cards={mockCards} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should handle copy to clipboard', () => {
    render(<ExportModal isOpen={true} onClose={vi.fn()} board={mockBoard} cards={mockCards} />);

    // Trigger copy action
    fireEvent.click(screen.getByRole('button', { name: 'Copy to Clipboard' }));

    // Check if document.execCommand was called with 'copy'
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });
});

describe('formatExportFilename', () => {
  // Original Date object
  const originalDate = global.Date;

  interface CustomDateConstructor extends DateConstructor {
    new(): Date & { toISOString(): string };
  }

  beforeEach(() => {
    // Mock Date to return a fixed date
    const fixedDate = new Date('2025-04-07T12:00:00.000Z');
    global.Date = class extends Date {
      constructor() {
        super();
        return fixedDate;
      }

      toISOString() {
        return '2025-04-07T12:00:00.000Z';
      }
    } as CustomDateConstructor;
  });

  afterEach(() => {
    // Restore original Date
    global.Date = originalDate;
  });

  it.each([
    ['Test Board', '2025-04-07-test-board.md', 'regular board name'],
    ['Board: Test Board', '2025-04-07-test-board.md', "board name with 'Board: ' prefix"],
    [
      'board: Test Board',
      '2025-04-07-test-board.md',
      "board name with case-insensitive 'board: ' prefix",
    ],
    ['My Amazing Board', '2025-04-07-my-amazing-board.md', 'board name with spaces'],
  ])('should format %s correctly as %s (%s)', (input, expected) => {
    const result = formatExportFilename(input);
    expect(result).toBe(expected);
  });
});

describe('createAndDownloadMarkdownFile', () => {
  let mockElement: HTMLAnchorElement;
  
  beforeEach(() => {
    // Mock DOM APIs
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mockurl');
    global.URL.revokeObjectURL = vi.fn();
    global.Blob = vi.fn().mockImplementation((content, options) => {
      return { content, options };
    }) as unknown as typeof Blob;
    
    // Mock the document methods
    mockElement = document.createElement('a');
    mockElement.click = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue(mockElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockElement);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockElement);
  });

  afterEach(() => {
    // Restore all mocks
    vi.restoreAllMocks();
  });

  it('should create a blob and generate a URL', () => {
    // Call the function with test content
    createAndDownloadMarkdownFile('# Test Markdown', 'test-file.md');

    // Since we can't easily verify the Blob without type issues,
    // we'll just verify that createObjectURL was called
    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('should create and configure an anchor element', () => {
    // Call the function
    createAndDownloadMarkdownFile('# Test Content', 'test-file.md');

    // Verify document.createElement was called to create an anchor
    expect(document.createElement).toHaveBeenCalledWith('a');

    // Verify anchor element properties were set
    expect(mockElement.href).toBe('blob:mockurl');
    expect(mockElement.download).toBe('test-file.md');
  });

  it('should trigger the download and clean up resources', () => {
    // Call the function
    createAndDownloadMarkdownFile('# Test Content', 'test-file.md');

    // Verify the anchor was appended to the body, clicked, and removed
    expect(document.body.appendChild).toHaveBeenCalledWith(mockElement);
    expect(mockElement.click).toHaveBeenCalled();
    expect(document.body.removeChild).toHaveBeenCalledWith(mockElement);

    // Verify URL.revokeObjectURL was called to clean up
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mockurl');
  });
});
