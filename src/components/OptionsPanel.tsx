import { X, Trash2, AlertCircle, Plus, Eye, EyeOff } from "lucide-react";
import { memo, useState } from "react";

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
        className="fixed right-0 top-0 h-screen w-80 bg-white shadow-lg border-l border-gray-200 z-20 overflow-y-auto"
        data-testid="options-panel"
      >
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Options</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 cursor-pointer"
            aria-label="Close panel"
            data-testid="close-panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Board Layout Options - Only visible to board owner */}
          {isBoardCreator && (
            <div className="border-b border-gray-200 pb-4">
              <h3 className="text-sm font-semibold text-gray-600 mb-3">Board Layout</h3>
              
              <div className="space-y-3">
                {/* Add Column Placeholder Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Plus className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="text-sm text-gray-700">Add Column Placeholder</span>
                  </div>
                  
                  <button
                    onClick={() => onToggleAddColumnPlaceholder(!showAddColumnPlaceholder)}
                    className={`flex items-center px-2 py-1 rounded text-xs font-medium ${
                      showAddColumnPlaceholder 
                        ? "bg-blue-100 text-blue-700" 
                        : "bg-gray-100 text-gray-600"
                    } cursor-pointer`}
                    data-testid="toggle-add-column-placeholder"
                  >
                    {showAddColumnPlaceholder ? (
                      <>
                        <Eye className="h-3 w-3 mr-1" />
                        Shown
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-3 w-3 mr-1" />
                        Hidden
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-2">Danger Zone</h3>
            
            {isConfirmingDelete && isBoardCreator ? (
              <div className="bg-red-50 p-3 rounded-md border border-red-200">
                <p className="text-sm text-red-700 mb-3">
                  Are you sure you want to delete this board? This action cannot be undone. All cards and action points will be permanently deleted.
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setIsConfirmingDelete(false)}
                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 cursor-pointer"
                    data-testid="cancel-delete"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onDeleteBoard}
                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 cursor-pointer"
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
                  className={`flex items-center text-sm ${
                    isBoardCreator 
                      ? "text-red-600 hover:text-red-700 cursor-pointer" 
                      : "text-gray-400 cursor-not-allowed"
                  } font-medium`}
                  data-testid="delete-board-button"
                  disabled={!isBoardCreator}
                  title={!isBoardCreator ? "Only the board creator can delete this board" : ""}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete Board
                </button>
                
                {!isBoardCreator && (
                  <div className="mt-1.5 flex items-center text-xs text-gray-500 bg-gray-50 p-2 rounded">
                    <AlertCircle className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
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