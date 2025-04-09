/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAndDownloadMarkdownFile, formatExportFilename } from '../exportUtils';

describe('formatExportFilename', () => {
  // Original Date object
  const originalDate = global.Date;

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
    } as any;
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
  beforeEach(() => {
    // Mock DOM APIs
    global.URL.createObjectURL = vi.fn().mockReturnValue('mock-url');
    global.URL.revokeObjectURL = vi.fn();
    
    document.body.appendChild = vi.fn();
    document.body.removeChild = vi.fn();
  });

  it('should create a Blob with correct content type', () => {
    const mockBlob = {};
    global.Blob = vi.fn().mockReturnValue(mockBlob) as any;
    
    createAndDownloadMarkdownFile('Test Content', 'test.md');
    
    expect(global.Blob).toHaveBeenCalledWith(['Test Content'], { type: 'text/markdown' });
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
  });

  it('should create and click a download link', () => {
    const linkClickMock = vi.fn();
    const mockLink = { 
      href: '',
      download: '',
      click: linkClickMock 
    };
    
    global.document.createElement = vi.fn().mockReturnValue(mockLink);
    
    createAndDownloadMarkdownFile('Test Content', 'test-filename.md');
    
    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockLink.href).toBe('mock-url');
    expect(mockLink.download).toBe('test-filename.md');
    expect(linkClickMock).toHaveBeenCalled();
    expect(document.body.appendChild).toHaveBeenCalledWith(mockLink);
    expect(document.body.removeChild).toHaveBeenCalledWith(mockLink);
  });

  it('should clean up by revoking the object URL', () => {
    createAndDownloadMarkdownFile('Test Content', 'test.md');
    
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('mock-url');
  });
}); 