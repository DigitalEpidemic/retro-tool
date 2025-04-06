import { Check, Edit2, X } from "lucide-react";
import { KeyboardEvent, memo, useEffect, useRef, useState } from "react";
import { OnlineUser } from "../services/firebase";

// Create a memoized version of the ParticipantsPanel
const ParticipantsPanel = memo(
  ({
    isOpen,
    onClose,
    participants,
    currentUserId,
    onUpdateName,
  }: {
    isOpen: boolean;
    onClose: () => void;
    participants: OnlineUser[];
    currentUserId: string;
    onUpdateName: (userId: string, newName: string) => void;
  }) => {
    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [newName, setNewName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when editing starts
    useEffect(() => {
      if (editingUser && inputRef.current) {
        inputRef.current.focus();
      }
    }, [editingUser]);

    const handleStartEdit = (userId: string, currentName: string) => {
      setEditingUser(userId);
      setNewName(currentName);
    };

    const handleSaveName = () => {
      if (editingUser && newName.trim()) {
        onUpdateName(editingUser, newName.trim());
        setEditingUser(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleSaveName();
      } else if (e.key === "Escape") {
        setEditingUser(null);
      }
    };

    if (!isOpen) return null;

    // Filter out any invalid participants (shouldn't happen, but just in case)
    const validParticipants = participants.filter((p) => p && p.id && p.name);

    return (
      <div
        className="fixed right-0 top-0 h-screen w-80 bg-white shadow-lg border-l border-gray-200 z-20 overflow-y-auto"
        data-testid="participants-panel"
      >
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Participants</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
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
              validParticipants.map((participant) => (
                <li
                  key={participant.id}
                  className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-gray-50"
                  data-testid={`participant-${participant.id}`}
                >
                  <div className="flex items-center">
                    <div
                      className="h-8 w-8 rounded-full mr-3 flex items-center justify-center text-white"
                      style={{
                        backgroundColor: participant.color || "#6B7280",
                      }}
                    >
                      {participant.name.charAt(0).toUpperCase()}
                    </div>

                    {editingUser === participant.id ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        onBlur={handleSaveName}
                        autoComplete="off"
                        data-testid={`edit-input-${participant.id}`}
                      />
                    ) : (
                      <span
                        className="font-medium text-gray-700"
                        data-testid={`participant-name-${participant.id}`}
                      >
                        {participant.name}
                        {participant.id === currentUserId && " (You)"}
                      </span>
                    )}
                  </div>

                  {participant.id === currentUserId &&
                    editingUser !== participant.id && (
                      <button
                        onClick={() =>
                          handleStartEdit(participant.id, participant.name)
                        }
                        className="text-gray-400 hover:text-blue-500"
                        aria-label="Edit your name"
                        data-testid={`edit-name-${participant.id}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}

                  {editingUser === participant.id && (
                    <button
                      onClick={handleSaveName}
                      className="text-green-500 hover:text-green-600"
                      aria-label="Save name"
                      data-testid={`save-name-${participant.id}`}
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
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
