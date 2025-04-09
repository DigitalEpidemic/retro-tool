import { Edit2, X } from 'lucide-react';
import { KeyboardEvent, memo, useEffect, useRef, useState } from 'react';
import { OnlineUser } from '../services/firebase';

// Create a memoized version of the ParticipantsPanel
const ParticipantsPanel = memo(
  ({
    isOpen,
    onClose,
    participants,
    currentUserId,
    onUpdateName,
    onUpdateColor,
  }: {
    isOpen: boolean;
    onClose: () => void;
    participants: OnlineUser[];
    currentUserId: string;
    onUpdateName: (userId: string, newName: string) => void;
    onUpdateColor: (userId: string, newColor: string) => void;
  }) => {
    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Available Tailwind color classes
    const colorOptions = [
      { value: 'bg-red-200', name: 'Red' },
      { value: 'bg-orange-200', name: 'Orange' },
      { value: 'bg-amber-200', name: 'Amber' },
      { value: 'bg-yellow-200', name: 'Yellow' },
      { value: 'bg-lime-200', name: 'Lime' },
      { value: 'bg-green-200', name: 'Green' },
      { value: 'bg-teal-200', name: 'Teal' },
      { value: 'bg-cyan-200', name: 'Cyan' },
      { value: 'bg-sky-200', name: 'Sky' },
      { value: 'bg-blue-200', name: 'Blue' },
      { value: 'bg-indigo-200', name: 'Indigo' },
      { value: 'bg-violet-200', name: 'Violet' },
      { value: 'bg-fuchsia-200', name: 'Fuchsia' },
      { value: 'bg-rose-200', name: 'Rose' },
    ];

    // Focus input when editing starts
    useEffect(() => {
      if (editingUser && inputRef.current) {
        inputRef.current.focus();
      }
    }, [editingUser]);

    const handleStartEdit = (userId: string, currentName: string, currentColor: string) => {
      setEditingUser(userId);
      setNewName(currentName);
      setNewColor(currentColor || 'bg-blue-200');
    };

    // Handle when the user selects a color (just updates local state, doesn't save yet)
    const handleColorSelect = (color: string) => {
      setNewColor(color);
    };

    // Save all changes (name and color) when the save button is clicked
    const handleSaveChanges = () => {
      if (editingUser) {
        // Save name if it's been modified and is valid
        if (newName.trim()) {
          onUpdateName(editingUser, newName.trim());
        }

        // Get the current user's participant data
        const participant = participants.find(p => p.id === editingUser);

        // Save color if it's different from current color
        if (newColor && participant && newColor !== participant.color) {
          onUpdateColor(editingUser, newColor);
        }

        // Close edit mode
        setEditingUser(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSaveChanges();
      } else if (e.key === 'Escape') {
        setEditingUser(null);
      }
    };

    if (!isOpen) return null;

    // Filter out any invalid participants (shouldn't happen, but just in case)
    const validParticipants = participants.filter(p => p && p.id && p.name);

    return (
      <div
        className="fixed right-0 top-0 h-screen w-80 bg-white shadow-lg border-l border-gray-200 z-20 overflow-y-auto"
        data-testid="participants-panel"
      >
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Participants</h2>
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
          <ul className="space-y-3">
            {validParticipants.length === 0 ? (
              <li className="text-gray-500 italic">No participants yet</li>
            ) : (
              validParticipants.map(participant => (
                <li
                  key={participant.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50"
                  data-testid={`participant-${participant.id}`}
                >
                  <div className="flex flex-col w-full">
                    {editingUser === participant.id ? (
                      <>
                        <div className="flex items-center w-full mb-2">
                          <div
                            className={`h-8 w-8 rounded-full mr-3 flex-shrink-0 flex items-center justify-center text-gray-700 ${
                              participant.color || 'bg-blue-200'
                            }`}
                            data-testid={`participant-color-${participant.id}`}
                          >
                            {participant.name.charAt(0).toUpperCase()}
                          </div>
                          <input
                            ref={inputRef}
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            autoComplete="off"
                            data-testid={`edit-input-${participant.id}`}
                          />
                        </div>
                        <div className="pl-11">
                          {' '}
                          {/* Left padding to align with input field */}
                          <p className="text-xs text-gray-600 mb-1 font-medium">Select a color:</p>
                          <div className="flex flex-wrap gap-2">
                            {colorOptions.map(color => (
                              <button
                                key={color.value}
                                onClick={() => handleColorSelect(color.value)}
                                className={`${
                                  color.value
                                } w-7 h-7 rounded-full cursor-pointer shadow-sm transition-all 
                                  ${
                                    newColor === color.value
                                      ? 'ring-2 ring-blue-500 scale-110'
                                      : 'hover:scale-110 hover:ring-1 hover:ring-gray-400'
                                  }`}
                                aria-label={`Select ${color.name} color`}
                                title={color.name}
                                type="button"
                              >
                                {newColor === color.value && (
                                  <span className="flex items-center justify-center text-blue-800">
                                    ✓
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <p className="text-xs text-gray-500">
                              Current: {participant.color.replace('bg-', '').replace('-200', '')}
                            </p>
                            {newColor !== participant.color && (
                              <p className="text-xs text-blue-600">
                                New: {newColor.replace('bg-', '').replace('-200', '')}
                              </p>
                            )}
                          </div>
                          <div className="flex justify-end mt-3 gap-2">
                            <button
                              onClick={() => setEditingUser(null)}
                              className="text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded text-sm font-medium cursor-pointer transition-colors"
                              aria-label="Cancel changes"
                              data-testid={`cancel-changes-${participant.id}`}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveChanges}
                              className="text-white bg-blue-500 hover:bg-blue-600 px-3 py-1 rounded text-sm font-medium cursor-pointer transition-colors"
                              aria-label="Save changes"
                              data-testid={`save-changes-${participant.id}`}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center w-full justify-between">
                        <div className="flex items-center">
                          <div
                            className={`h-8 w-8 rounded-full mr-3 flex items-center justify-center text-gray-700 ${
                              participant.color || 'bg-blue-200'
                            }`}
                            data-testid={`participant-color-${participant.id}`}
                          >
                            {participant.name.charAt(0).toUpperCase()}
                          </div>
                          <span
                            className="font-medium text-gray-700"
                            data-testid={`participant-name-${participant.id}`}
                          >
                            {participant.name}
                            {participant.id === currentUserId && ' (You)'}
                          </span>
                        </div>

                        {participant.id === currentUserId && (
                          <button
                            onClick={() =>
                              handleStartEdit(participant.id, participant.name, participant.color)
                            }
                            className="text-gray-400 hover:text-blue-500 cursor-pointer"
                            aria-label="Edit your name and color"
                            data-testid={`edit-name-${participant.id}`}
                          >
                            <Edit2 className="h-4 w-4" data-testid="edit-icon" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    );
  }
);

export default ParticipantsPanel;
