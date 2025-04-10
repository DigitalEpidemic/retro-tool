import { Plus } from 'lucide-react';
import React, { useState } from 'react';
import { addColumn } from '../services/boardService';

interface AddColumnPlaceholderProps {
  boardId: string;
  onColumnAdded?: () => void;
}

export default function AddColumnPlaceholder({
  boardId,
  onColumnAdded,
}: AddColumnPlaceholderProps) {
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [columnTitle, setColumnTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!columnTitle.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await addColumn(boardId, columnTitle.trim());

      if (result.success) {
        setColumnTitle('');
        setIsAddingColumn(false);
        if (onColumnAdded) onColumnAdded();
      } else {
        setError(result.error ?? 'Failed to add column');
      }
    } catch (err) {
      setError('An unexpected error occurred');
      console.error('Error adding column:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAddingColumn) {
    return (
      <div className="border-r border-l border-gray-200 bg-white rounded shadow-sm h-full flex flex-col overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-medium text-gray-800">New Column</h2>
        </div>

        <div className="flex-grow overflow-y-auto p-6 flex flex-col justify-center">
          <form onSubmit={handleAddColumn} className="space-y-4">
            {error && <div className="text-red-500 text-sm bg-red-50 p-2 rounded">{error}</div>}

            <div>
              <label htmlFor="columnTitle" className="block text-sm font-medium text-gray-700 mb-1">
                Column Title
              </label>
              <input
                type="text"
                id="columnTitle"
                value={columnTitle}
                onChange={e => setColumnTitle(e.target.value)}
                placeholder="Enter column title"
                className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                required
              />
            </div>

            <div className="flex space-x-2 justify-end">
              <button
                type="button"
                onClick={() => setIsAddingColumn(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 cursor-pointer"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
                disabled={!columnTitle.trim() || isSubmitting}
              >
                {isSubmitting ? 'Adding...' : 'Add Column'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-dashed border-gray-300 bg-gray-50 rounded h-full flex flex-col overflow-hidden">
      <div className="flex-grow flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-blue-100 rounded-full p-3 mb-4">
          <Plus className="h-6 w-6 text-blue-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-800 mb-2">Create New Column</h3>
        <p className="text-sm text-gray-500 mb-4">
          Add a new column to collect feedback in different categories
        </p>
        <button
          onClick={() => setIsAddingColumn(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-medium transition-colors cursor-pointer"
          data-testid="add-column-button"
        >
          Create Column
        </button>
      </div>
    </div>
  );
}
