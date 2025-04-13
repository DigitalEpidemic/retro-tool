import { AlertCircle, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { memo, useState } from 'react';

const OptionsPanel = memo(
  ({
    isOpen,
    onClose,
    onDeleteBoard,
    isBoardCreator,
    showAddColumnPlaceholder,
    onToggleAddColumnPlaceholder,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onDeleteBoard: () => void;
    isBoardCreator: boolean;
    showAddColumnPlaceholder: boolean;
    onToggleAddColumnPlaceholder: (show: boolean) => void;
  }) => {
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    if (!isOpen) return null;

    return (
      <div
        className="fixed inset-0 bg-white z-50 flex flex-col md:inset-auto md:right-0 md:top-0 md:h-screen md:w-80 md:bg-white md:shadow-lg md:border-l md:border-gray-200 md:z-20 md:overflow-y-auto"
        data-testid="options-panel"
      >
        <div className="border-b border-gray-200 flex justify-between items-center px-3 py-3">
          <h2 className="text-lg font-semibold text-gray-800">Options</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 active:text-gray-900 cursor-pointer p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors duration-300 touch-feedback"
            aria-label="Close panel"
            data-testid="close-panel"
          >
            <X className="h-6 w-6 md:h-5 md:w-5" />
          </button>
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-6">
          {/* Board Layout Options - Only visible to board owner */}
          {isBoardCreator && (
            <div className="border-b border-gray-200 pb-4">
              <h3 className="text-sm font-semibold text-gray-600 mb-3">Board Layout</h3>

              <div className="space-y-3">
                {/* Add Column Placeholder Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Plus className="h-5 w-5 mr-3 text-gray-500" />
                    <span className="text-base text-gray-700">Add Column Placeholder</span>
                  </div>

                  <button
                    onClick={() => onToggleAddColumnPlaceholder(!showAddColumnPlaceholder)}
                    className={`flex items-center px-3 py-1.5 rounded text-sm font-medium ${
                      showAddColumnPlaceholder
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 active:bg-blue-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
                    } cursor-pointer transition-colors duration-300 touch-feedback`}
                    data-testid="toggle-add-column-placeholder"
                  >
                    {showAddColumnPlaceholder ? (
                      <>
                        <Eye className="h-4 w-4 mr-1.5" />
                        Shown
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-4 w-4 mr-1.5" />
                        Hidden
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">Danger Zone</h3>

            {isConfirmingDelete && isBoardCreator ? (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="text-base text-red-700 mb-4">
                  Are you sure you want to delete this board? This action cannot be undone. All
                  cards and action points will be permanently deleted.
                </p>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setIsConfirmingDelete(false)}
                    className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 active:bg-gray-300 cursor-pointer transition-colors duration-300 touch-feedback"
                    data-testid="cancel-delete"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onDeleteBoard}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 active:bg-red-800 cursor-pointer transition-colors duration-300 touch-feedback"
                    data-testid="confirm-delete"
                  >
                    Yes, Delete Board
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative group">
                <button
                  onClick={() => isBoardCreator && setIsConfirmingDelete(true)}
                  className={`flex items-center text-base py-2 px-3 rounded-lg ${
                    isBoardCreator
                      ? 'text-red-600 hover:text-red-700 active:text-red-800 hover:bg-red-50 active:bg-red-100 cursor-pointer transition-colors duration-300 touch-feedback'
                      : 'text-gray-400 cursor-not-allowed'
                  } font-medium transition-colors`}
                  data-testid="delete-board-button"
                  disabled={!isBoardCreator}
                  title={!isBoardCreator ? 'Only the board creator can delete this board' : ''}
                >
                  <Trash2 className="h-5 w-5 mr-2" />
                  Delete Board
                </button>

                {!isBoardCreator && (
                  <div className="mt-2 flex items-center text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
                    <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>Only the board creator can delete this board</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

export default OptionsPanel;
