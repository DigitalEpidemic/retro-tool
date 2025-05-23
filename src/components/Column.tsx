import { doc, getDoc } from 'firebase/firestore';
import { AlignLeft, ArrowUpDown, MoreVertical, Trash2 } from 'lucide-react'; // Added Trash2 icon
import React, { KeyboardEvent, useRef, useState } from 'react';
import Tooltip from '../components/Tooltip'; // Use absolute path for component
import { useFirebase } from '../contexts/useFirebase'; // To get user ID
import {
  addCard,
  deleteColumn,
  updateColumnDescription,
  updateColumnTitle,
} from '../services/boardService'; // Added updateColumnDescription
import { db } from '../services/firebase';

interface ColumnProps {
  id: string;
  title: string;
  boardId: string;
  sortByVotes: boolean;
  description?: string;
  onSortToggle: () => void;
  isBoardOwner: boolean; // Add prop to check if the current user is the board owner
  children: React.ReactNode; // To render Droppable content from Board.tsx
  onTitleUpdate?: (newTitle: string) => void; // Optional callback for title updates
  onDescriptionUpdate?: (description: string) => void; // Optional callback for description updates
  columnIndex?: number; // Add column index prop
  totalColumns?: number; // Add total columns prop
}

export default function Column({
  id,
  title,
  boardId,
  sortByVotes,
  description,
  onSortToggle,
  isBoardOwner,
  children,
  onTitleUpdate,
  onDescriptionUpdate,
  columnIndex,
  totalColumns,
}: ColumnProps) {
  const { user } = useFirebase();
  const [newCardContent, setNewCardContent] = React.useState('');
  const [isAddingCard, setIsAddingCard] = React.useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false); // Track if a submission is in progress

  // Title editing states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editableTitle, setEditableTitle] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const escapePressedRef = useRef(false);

  // Description editing states
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editableDescription, setEditableDescription] = useState(description ?? '');
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);
  const descriptionEscapePressedRef = useRef(false);
  const [isDescriptionVisible, setIsDescriptionVisible] = useState(true);

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Update editableTitle when title prop changes
  React.useEffect(() => {
    setEditableTitle(title);
  }, [title]);

  // Update editableDescription when description prop changes
  React.useEffect(() => {
    setEditableDescription(description ?? '');
  }, [description]);

  // Map column titles to RetroTool style titles based on the id
  const getMappedTitle = () => {
    // Don't use this function during editing - that's handled separately
    const titleMap: Record<string, string> = {
      'column-1': 'Mad',
      'column-2': 'Sad',
      'column-3': 'Glad',
    };
    return titleMap[id] || title;
  };

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardContent.trim() || !user || isSubmitting) return;

    try {
      setIsSubmitting(true); // Set submitting state to prevent multiple submissions

      // Get user's color from Firestore instead of localStorage
      let userColor = 'bg-blue-200'; // Default color as Tailwind class

      try {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists() && userDoc.data().color) {
          userColor = userDoc.data().color;
        }
      } catch (error) {
        console.error('Error getting user color:', error);
        // Proceed with default color
      }

      await addCard(
        boardId,
        id,
        newCardContent.trim(),
        user.uid,
        user.displayName ?? 'Anonymous User',
        userColor
      );
      setNewCardContent(''); // Clear input after adding
      setIsAddingCard(false); // Hide the form after adding
    } catch (error) {
      console.error('Error adding card:', error);
      // Handle error appropriately (e.g., show a notification)
    } finally {
      setIsSubmitting(false); // Reset submitting state regardless of success or failure
    }
  };

  const handleDeleteColumn = async () => {
    if (!isBoardOwner) return;

    try {
      const result = await deleteColumn(boardId, id);
      if (!result.success) {
        console.error('Failed to delete column:', result.error);
      }
      setIsMenuOpen(false);
    } catch (error) {
      console.error('Error deleting column:', error);
    }
  };

  // Handle title click to start editing
  const handleTitleClick = () => {
    if (isBoardOwner && !isEditingTitle) {
      setIsEditingTitle(true);
      // Selection of text will happen in useEffect after render
    }
  };

  // Add effect to select all text when editing starts
  React.useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      // Focus and select all text after the input is rendered
      setTimeout(() => {
        if (titleInputRef.current) {
          titleInputRef.current.select();
        }
      }, 10);
    }
  }, [isEditingTitle]);

  // Handle saving title
  const handleSaveTitle = async () => {
    if (!boardId || !isBoardOwner) return;

    const trimmedTitle = editableTitle.trim();
    if (!trimmedTitle) {
      // Don't allow empty titles
      setEditableTitle(title);
      setIsEditingTitle(false);
      return;
    }

    // Only save if the title has changed
    if (trimmedTitle !== title) {
      try {
        const result = await updateColumnTitle(boardId, id, trimmedTitle);
        if (result.success) {
          // Notify parent component if callback exists
          if (onTitleUpdate) {
            onTitleUpdate(trimmedTitle);
          }
        } else {
          // Revert to original title if update failed
          setEditableTitle(title);
          console.error('Failed to update column title:', result.error);
        }
      } catch (error) {
        console.error('Error updating column title:', error);
        setEditableTitle(title); // Revert on error
      }
    }

    setIsEditingTitle(false);
  };

  // Handle input change
  const handleTitleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditableTitle(e.target.value);
  };

  // Handle key press in input
  const handleTitleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      escapePressedRef.current = true;
      setEditableTitle(title); // Revert to original title
      setIsEditingTitle(false);
      titleInputRef.current?.blur();
    }
  };

  // Handle input blur
  const handleTitleInputBlur = () => {
    // If blur was triggered by Escape key, reset the flag and do nothing else
    if (escapePressedRef.current) {
      escapePressedRef.current = false;
      return;
    }

    handleSaveTitle();
  };

  // Handle description click to start editing
  const handleDescriptionClick = () => {
    if (isBoardOwner && !isEditingDescription) {
      setIsEditingDescription(true);
      // Selection of text will happen in useEffect after render
    }
  };

  // Add effect to focus description textarea when editing starts
  React.useEffect(() => {
    if (isEditingDescription && descriptionInputRef.current) {
      // Focus and select all text after the textarea is rendered
      setTimeout(() => {
        if (descriptionInputRef.current) {
          descriptionInputRef.current.select();
        }
      }, 10);
    }
  }, [isEditingDescription]);

  // Handle saving description
  const handleSaveDescription = async () => {
    if (!boardId || !isBoardOwner) return;

    const trimmedDescription = editableDescription.trim();

    // Even if description is empty, we still want to save it (allows clearing description)
    if (trimmedDescription !== description) {
      try {
        const result = await updateColumnDescription(boardId, id, trimmedDescription);
        if (result?.success) {
          // Notify parent component if callback exists
          if (onDescriptionUpdate) {
            onDescriptionUpdate(trimmedDescription);
          }
        } else {
          // Revert to original description if update failed
          setEditableDescription(description ?? '');
          console.error('Failed to update column description:', result?.error ?? 'Unknown error');
        }
      } catch (error) {
        console.error('Error updating column description:', error);
        setEditableDescription(description ?? ''); // Revert on error
      }
    }

    setIsEditingDescription(false);
  };

  // Handle description input change
  const handleDescriptionInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditableDescription(e.target.value);
  };

  // Handle key press in description textarea
  const handleDescriptionInputKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveDescription();
    } else if (e.key === 'Escape') {
      descriptionEscapePressedRef.current = true;
      setEditableDescription(description ?? ''); // Revert to original description
      setIsEditingDescription(false);
      descriptionInputRef.current?.blur();
    }
  };

  // Handle description textarea blur
  const handleDescriptionInputBlur = () => {
    // If blur was triggered by Escape key, reset the flag and do nothing else
    if (descriptionEscapePressedRef.current) {
      descriptionEscapePressedRef.current = false;
      return;
    }

    handleSaveDescription();
  };

  // Toggle description visibility
  const toggleDescriptionVisibility = () => {
    setIsDescriptionVisible(!isDescriptionVisible);
  };

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden max-w-full">
      {/* Column header */}
      <div className="flex justify-between items-center px-3 sm:px-4 py-3 border-b border-gray-200 flex-shrink-0 h-[52px]">
        <div className="h-[28px] flex items-center flex-grow min-w-0 overflow-hidden mr-2">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editableTitle}
              onChange={handleTitleInputChange}
              onKeyDown={handleTitleInputKeyDown}
              onBlur={handleTitleInputBlur}
              autoFocus
              className="text-base sm:text-lg font-medium text-gray-800 border border-gray-300 rounded px-2 leading-[28px] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 h-[28px] w-full box-border"
              data-testid={`column-title-input-${id}`}
            />
          ) : (
            <h2
              className={`text-base sm:text-lg font-medium text-gray-800 leading-[28px] flex items-center transition-colors duration-200 truncate max-w-full ${isBoardOwner ? 'cursor-pointer hover:text-blue-600 group' : ''}`}
              onClick={handleTitleClick}
              data-testid={`column-title-${id}`}
              title={getMappedTitle()}
            >
              <span className="flex-shrink-0 text-xs text-gray-500 font-normal md:hidden mr-1">
                {columnIndex !== undefined &&
                  totalColumns !== undefined &&
                  `(${columnIndex + 1}/${totalColumns})`}
              </span>
              <span className="truncate min-w-0 max-w-full">{getMappedTitle()}</span>
            </h2>
          )}
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          <Tooltip content={sortByVotes ? 'Sort by position' : 'Sort by votes'}>
            <button
              className="flex items-center text-blue-600 hover:text-blue-700 active:text-blue-800 cursor-pointer p-1.5 rounded hover:bg-blue-50 active:bg-blue-100 transition-colors duration-300 touch-feedback"
              onClick={onSortToggle}
              data-testid={`sort-toggle-${id}`}
            >
              <span className="text-xs mr-1">{sortByVotes ? 'Votes' : 'Order'}</span>
              <ArrowUpDown className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="sr-only">Sort</span>
            </button>
          </Tooltip>

          <div className="relative" ref={menuRef}>
            <Tooltip content="Column options">
              <button
                className="text-blue-600 hover:text-blue-700 active:text-blue-800 cursor-pointer p-1.5 rounded hover:bg-blue-50 active:bg-blue-100 transition-colors duration-300 touch-feedback"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                data-testid={`column-menu-${id}`}
              >
                <MoreVertical className="h-5 w-5 sm:h-4 sm:w-4" />
                <span className="sr-only">More options</span>
              </button>
            </Tooltip>

            {isMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                {(isBoardOwner || editableDescription) && (
                  <button
                    className={`w-full text-left px-4 py-2 text-sm flex items-center text-gray-700 hover:text-gray-900 hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors duration-300 touch-feedback`}
                    onClick={() => {
                      toggleDescriptionVisibility();
                      setIsMenuOpen(false);
                    }}
                    data-testid={`toggle-description-${id}`}
                  >
                    <AlignLeft className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
                    {isDescriptionVisible ? 'Hide description' : 'Show description'}
                  </button>
                )}
                <button
                  className={`w-full text-left px-4 py-2 text-sm flex items-center ${
                    isBoardOwner
                      ? 'text-red-600 hover:text-red-700 active:text-red-800 hover:bg-red-50 active:bg-red-100 cursor-pointer transition-colors duration-300 touch-feedback'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={handleDeleteColumn}
                  disabled={!isBoardOwner}
                  data-testid={`delete-column-${id}`}
                >
                  <Trash2 className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
                  Delete column
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Column Description Section */}
      {isDescriptionVisible && (isBoardOwner || editableDescription) && (
        <div className="px-3 sm:px-4 py-2 border-b border-gray-200 flex-shrink-0 bg-gray-50">
          {isEditingDescription ? (
            <textarea
              ref={descriptionInputRef}
              value={editableDescription}
              onChange={handleDescriptionInputChange}
              onKeyDown={handleDescriptionInputKeyDown}
              onBlur={handleDescriptionInputBlur}
              autoFocus
              placeholder="Add a description for this column..."
              className="w-full p-2 text-base sm:text-sm text-gray-700 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 min-h-[60px] resize-y"
              data-testid={`column-description-input-${id}`}
            />
          ) : (
            <div
              className={`text-sm text-gray-700 py-1 italic ${isBoardOwner ? 'cursor-pointer hover:text-blue-600 group' : ''}`}
              onClick={isBoardOwner ? handleDescriptionClick : undefined}
              data-testid={`column-description-${id}`}
            >
              {editableDescription ? (
                <span className="whitespace-pre-wrap flex items-center">{editableDescription}</span>
              ) : (
                isBoardOwner && <span className="text-gray-400">Add a description...</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Cards container - allow scrolling but ensure fixed height */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-2 sm:space-y-3">{children}</div>

      {/* Add card section - fixed at the bottom */}
      {isAddingCard ? (
        <form
          onSubmit={handleAddCard}
          className="p-2 sm:p-3 border-t border-gray-200 flex-shrink-0"
          data-testid="add-card-form"
        >
          <textarea
            value={newCardContent}
            onChange={e => setNewCardContent(e.target.value)}
            placeholder="Type here... Press Enter to save."
            rows={3}
            className="w-full rounded-none border-none bg-gray-100 text-base sm:text-sm p-3 mb-2 resize-none focus:ring-0"
            required
            autoFocus
            disabled={isSubmitting}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (newCardContent.trim() && user && !isSubmitting) {
                  handleAddCard(e);
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setIsAddingCard(false);
              }
            }}
          />
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsAddingCard(false)}
              className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 active:bg-gray-300 cursor-pointer transition-colors duration-300 touch-feedback"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-2 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 active:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors duration-300 touch-feedback"
              disabled={!newCardContent.trim() || !user || isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <Tooltip content="Add a new card to this column">
          <button
            onClick={() => setIsAddingCard(true)}
            className="w-full py-4 text-sm text-blue-600 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border-t border-gray-200 flex items-center justify-center cursor-pointer transition-colors duration-300 touch-feedback"
            data-testid="add-column-button"
          >
            + Add a card
          </button>
        </Tooltip>
      )}
    </div>
  );
}
