// Extract file saving logic to a testable function
export function createAndDownloadMarkdownFile(markdownContent: string, fileName: string) {
  const blob = new Blob([markdownContent], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export the filename creation logic for testing
export function formatExportFilename(boardName: string): string {
  // Remove "Board: " prefix from the board name
  const cleanedBoardName = boardName.replace(/^Board:\s*/i, '');

  const dateStr = new Date().toISOString().split('T')[0];
  return `${dateStr}-${cleanedBoardName.replace(/\s+/g, '-').toLowerCase()}.md`;
} 