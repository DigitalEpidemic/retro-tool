import { Clipboard, FileDown, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Board, Card } from '../services/firebase';
import { createAndDownloadMarkdownFile, formatExportFilename } from '../utils/exportUtils';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: Board | null;
  cards: Card[];
}

export default function ExportModal({ isOpen, onClose, board, cards }: ExportModalProps) {
  const [markdown, setMarkdown] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen || !board) return;

    // Generate markdown content
    let markdownContent = `# ${board.name}\n`;
    markdownContent += `Date: ${new Date().toLocaleDateString()}\n\n`;

    // Group cards by columns
    const cardsByColumn: Record<string, Card[]> = {};

    // Initialize empty arrays for each column
    Object.keys(board.columns).forEach(columnId => {
      cardsByColumn[columnId] = [];
    });

    // Populate cards by column
    cards.forEach(card => {
      if (cardsByColumn[card.columnId]) {
        cardsByColumn[card.columnId].push(card);
      }
    });

    // Build markdown for each column
    Object.entries(board.columns)
      .sort(([, a], [, b]) => a.order - b.order)
      .forEach(([columnId, column]) => {
        markdownContent += `## ${column.title}\n\n`;

        // If no cards in this column
        if (!cardsByColumn[columnId] || cardsByColumn[columnId].length === 0) {
          markdownContent += '_No cards in this column_\n\n';
          return;
        }

        // Sort cards by votes (descending) then add to markdown
        const sortedCards = [...cardsByColumn[columnId]].sort((a, b) => b.votes - a.votes);

        sortedCards.forEach(card => {
          markdownContent += `- ${card.content} _(${card.votes} votes, by ${card.authorName})_\n`;
        });

        markdownContent += '\n';
      });

    // Add action points section
    markdownContent += `## Action Points\n\n`;

    const actionPoints = board.actionPoints ?? [];

    if (actionPoints.length === 0) {
      markdownContent += '_No action points_\n\n';
    } else {
      // Sort action points by completion status (incomplete first)
      const sortedActionPoints = [...actionPoints].sort(
        (a, b) => Number(a.completed) - Number(b.completed)
      );

      sortedActionPoints.forEach(actionPoint => {
        const status = actionPoint.completed ? '[x]' : '[ ]';
        let actionPointText = `- ${status} ${actionPoint.text}`;

        // Add assignee if available
        if (actionPoint.assignee) {
          actionPointText += ` _(Assigned to: ${actionPoint.assignee})_`;
        }

        markdownContent += `${actionPointText}\n`;
      });

      markdownContent += '\n';
    }

    setMarkdown(markdownContent);
  }, [isOpen, board, cards]);

  const handleCopyToClipboard = () => {
    if (textareaRef.current) {
      textareaRef.current.select();
      document.execCommand('copy');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleSaveAsFile = () => {
    if (!board) return;

    const fileName = formatExportFilename(board.name);
    createAndDownloadMarkdownFile(markdown, fileName);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-gray-500/30 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden">
        <div className="flex justify-between items-center border-b border-gray-200 p-4">
          <h2 className="text-xl font-semibold text-gray-800">Export Board as Markdown</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 cursor-pointer"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-grow p-4">
          <textarea
            ref={textareaRef}
            className="w-full h-full p-4 border border-gray-300 rounded font-mono text-sm resize-none focus:ring-blue-500 focus:border-blue-500 overflow-auto"
            value={markdown}
            readOnly
          />
        </div>

        <div className="flex justify-end space-x-3 border-t border-gray-200 p-4">
          <button
            onClick={handleCopyToClipboard}
            className="flex items-center space-x-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 cursor-pointer"
          >
            <Clipboard className="h-4 w-4" />
            <span>{copySuccess ? 'Copied!' : 'Copy to Clipboard'}</span>
          </button>
          <button
            onClick={handleSaveAsFile}
            className="flex items-center space-x-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <FileDown className="h-4 w-4" />
            <span>Save as File</span>
          </button>
        </div>
      </div>
    </div>
  );
}
