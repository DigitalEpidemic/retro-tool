import { Plus, X } from 'lucide-react';
import { KeyboardEvent, memo, useEffect, useRef, useState } from 'react';

export interface ActionPoint {
  id: string;
  text: string;
  completed: boolean;
  assignee?: string;
}

// Create a memoized version of the ActionPointsPanel
const ActionPointsPanel = memo(
  ({
    isOpen,
    onClose,
    actionPoints,
    onAddActionPoint,
    onToggleActionPoint,
    onDeleteActionPoint,
  }: {
    isOpen: boolean;
    onClose: () => void;
    actionPoints: ActionPoint[];
    onAddActionPoint: (text: string) => void;
    onToggleActionPoint: (id: string) => void;
    onDeleteActionPoint: (id: string) => void;
  }) => {
    const [isAddingActionPoint, setIsAddingActionPoint] = useState(false);
    const [newActionPointText, setNewActionPointText] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when adding action point
    useEffect(() => {
      if (isAddingActionPoint && inputRef.current) {
        inputRef.current.focus();
      }
    }, [isAddingActionPoint]);

    const handleStartAdd = () => {
      setIsAddingActionPoint(true);
      setNewActionPointText('');
    };

    const handleCancelAdd = () => {
      setIsAddingActionPoint(false);
      setNewActionPointText('');
    };

    const handleAddActionPoint = () => {
      if (newActionPointText.trim()) {
        onAddActionPoint(newActionPointText.trim());
        setIsAddingActionPoint(false);
        setNewActionPointText('');
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleAddActionPoint();
      } else if (e.key === 'Escape') {
        handleCancelAdd();
      }
    };

    if (!isOpen) return null;

    return (
      <div
        className="fixed right-0 top-0 h-screen w-80 bg-white shadow-lg border-l border-gray-200 z-20 overflow-y-auto"
        data-testid="action-points-panel"
      >
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Action Points</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 cursor-pointer"
            aria-label="Close panel"
            data-testid="close-panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-2">To do</h3>

          <ul className="space-y-3 mb-4">
            {actionPoints.length === 0 && !isAddingActionPoint ? (
              <li className="text-gray-500 italic text-sm py-2 px-3 bg-gray-50 rounded-md border border-gray-200 border-dashed">
                No action points yet
              </li>
            ) : (
              actionPoints.map(actionPoint => (
                <li
                  key={actionPoint.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50"
                  data-testid={`action-point-${actionPoint.id}`}
                >
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={actionPoint.completed}
                      onChange={() => onToggleActionPoint(actionPoint.id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mr-3"
                    />
                    <span
                      className={`text-sm ${
                        actionPoint.completed ? 'text-gray-400 line-through' : 'text-gray-700'
                      }`}
                    >
                      {actionPoint.text}
                    </span>
                  </div>

                  <button
                    onClick={() => onDeleteActionPoint(actionPoint.id)}
                    className="text-gray-400 hover:text-red-500 ml-2 cursor-pointer"
                    aria-label="Delete action point"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))
            )}
          </ul>

          {isAddingActionPoint ? (
            <div className="border border-gray-300 rounded-md p-2">
              <input
                ref={inputRef}
                type="text"
                value={newActionPointText}
                onChange={e => setNewActionPointText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter action point..."
                className="w-full text-sm border-none focus:outline-none focus:ring-0 p-1"
                data-testid="action-point-input"
              />
              <div className="flex justify-end mt-2 space-x-2">
                <button
                  onClick={handleCancelAdd}
                  className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 cursor-pointer"
                  data-testid="cancel-action-point"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddActionPoint}
                  className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 cursor-pointer"
                  data-testid="add-action-point"
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleStartAdd}
              className="flex items-center text-blue-600 hover:text-blue-700 font-medium text-sm cursor-pointer"
              data-testid="add-action-point-button"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add action point
            </button>
          )}
        </div>
      </div>
    );
  }
);

export default ActionPointsPanel;
