import { doc, getDoc } from 'firebase/firestore';
import { ArrowUpDown, Edit2, MoreVertical } from 'lucide-react'; // Import icons
import React, { KeyboardEvent, useRef, useState } from 'react';
import { useFirebase } from '../contexts/useFirebase'; // To get user ID
import { addCard, deleteColumn, updateColumnTitle } from '../services/boardService'; // Add updateColumnTitle
import { db } from '../services/firebase';

interface ColumnProps {
  id: string;
  title: string;
  boardId: string;
  sortByVotes: boolean;
  onSortToggle: () => void;
  isBoardOwner: boolean; // Add prop to check if the current user is the board owner
  children: React.ReactNode; // To render Droppable content from Board.tsx
  onTitleUpdate?: (newTitle: string) => void; // Optional callback for title updates
}

export default function Column({
  id,
  title,
  boardId,
  sortByVotes,
  onSortToggle,
  isBoardOwner,
  children,
  onTitleUpdate,
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

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      {/* Column header */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 flex-shrink-0 h-[52px]">
        <div className="h-[28px] flex items-center flex-grow overflow-hidden mr-2">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editableTitle}
              onChange={handleTitleInputChange}
              onKeyDown={handleTitleInputKeyDown}
              onBlur={handleTitleInputBlur}
              autoFocus
              className="text-lg font-medium text-gray-800 border border-gray-300 rounded px-2 leading-[28px] focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 h-[28px] w-full box-border"
              data-testid={`column-title-input-${id}`}
            />
          ) : (
            <h2
              className={`text-lg font-medium text-gray-800 leading-[28px] flex items-center transition-colors duration-200 overflow-hidden text-ellipsis whitespace-nowrap ${isBoardOwner ? 'cursor-pointer hover:text-blue-600 group' : ''}`}
              onClick={handleTitleClick}
              data-testid={`column-title-${id}`}
              title={isBoardOwner ? 'Click to edit column title' : ''}
            >
              {getMappedTitle()}
              {isBoardOwner && (
                <Edit2 className="h-3.5 w-3.5 ml-1.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              )}
            </h2>
          )}
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          <button
            className="flex items-center text-blue-600 hover:text-blue-700 cursor-pointer"
            onClick={onSortToggle}
            data-testid={`sort-toggle-${id}`}
          >
            {sortByVotes && <span className="text-xs mr-1">Votes</span>}
            <ArrowUpDown className="h-4 w-4" />
            <span className="sr-only">Sort</span>
          </button>
          <div className="relative" ref={menuRef}>
            <button
              className="text-blue-600 hover:text-blue-700 cursor-pointer"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              data-testid={`column-menu-${id}`}
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More options</span>
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                <button
                  className={`w-full text-left px-4 py-2 text-sm ${
                    isBoardOwner
                      ? 'text-red-600 hover:bg-gray-100 cursor-pointer'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={handleDeleteColumn}
                  disabled={!isBoardOwner}
                  data-testid={`delete-column-${id}`}
                >
                  Delete column
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cards container - allow scrolling */}
      <div className="flex-grow overflow-y-auto p-3 space-y-3">{children}</div>

      {/* Add card section */}
      {isAddingCard ? (
        <form
          onSubmit={handleAddCard}
          className="p-3 border-t border-gray-200 flex-shrink-0"
          data-testid="add-card-form"
        >
          <textarea
            value={newCardContent}
            onChange={e => setNewCardContent(e.target.value)}
            placeholder="Type here... Press Enter to save."
            rows={3}
            className="w-full rounded-none border-none bg-gray-100 text-sm p-3 mb-2 resize-none focus:ring-0"
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
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 cursor-pointer"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
              disabled={!newCardContent.trim() || !user || isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <div className="p-3 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={() => setIsAddingCard(true)}
            className="w-full p-2 text-sm text-blue-600 bg-gray-50 hover:bg-gray-100 rounded flex items-center justify-center cursor-pointer"
          >
            + Add a card
          </button>
        </div>
      )}
    </div>
  );
}
