import React from "react";
// Removed unused imports: Droppable, DraggableProvided, CardComponent, CardType
import { useFirebase } from "../contexts/FirebaseContext"; // To get user ID
import { addCard } from "../services/boardService"; // To add new cards
import { ArrowUpDown, MoreVertical } from "lucide-react"; // Import icons

interface ColumnProps {
  id: string;
  title: string;
  boardId: string;
  children: React.ReactNode; // To render Droppable content from Board.tsx
}

export default function Column({ id, title, boardId, children }: ColumnProps) {
  const { user } = useFirebase();
  const [newCardContent, setNewCardContent] = React.useState("");
  const [isAddingCard, setIsAddingCard] = React.useState(false);

  // Map column titles to RetroTool style titles based on the id
  const getMappedTitle = () => {
    const titleMap: Record<string, string> = {
      "column-1": "Mad",
      "column-2": "Sad",
      "column-3": "Glad",
    };
    return titleMap[id] || title;
  };

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardContent.trim() || !user) return;

    try {
      await addCard(boardId, id, newCardContent.trim(), user.uid);
      setNewCardContent(""); // Clear input after adding
      setIsAddingCard(false); // Hide the form after adding
    } catch (error) {
      console.error("Error adding card:", error);
      // Handle error appropriately (e.g., show a notification)
    }
  };

  return (
    <div className="w-full bg-white border-none flex flex-col h-[calc(100vh-13rem)] min-h-[24rem]">
      {/* Column header */}
      <div className="flex justify-between items-center px-4 py-2 border-b border-gray-100">
        <h2 className="text-lg font-medium text-gray-800">{getMappedTitle()}</h2>
        <div className="flex items-center space-x-2">
          <button className="text-gray-400 hover:text-gray-600">
            <ArrowUpDown className="h-4 w-4" />
            <span className="sr-only">Sort</span>
          </button>
          <button className="text-gray-400 hover:text-gray-600">
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">More options</span>
          </button>
        </div>
      </div>

      {/* Cards container */}
      <div className="flex-grow overflow-y-auto p-3 space-y-3">
        {children}
      </div>

      {/* Add card section */}
      {isAddingCard ? (
        <form onSubmit={handleAddCard} className="p-3 border-t border-gray-100">
          <textarea
            value={newCardContent}
            onChange={(e) => setNewCardContent(e.target.value)}
            placeholder="Type here... Press Enter to save."
            rows={3}
            className="w-full rounded-none border-none bg-[#baf5e3] text-sm p-3 mb-2 resize-none focus:ring-0"
            required
            autoFocus
          />
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsAddingCard(false)}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              disabled={!newCardContent.trim() || !user}
            >
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={() => setIsAddingCard(true)}
            className="w-full p-2 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 rounded flex items-center justify-center"
          >
            + Add a card
          </button>
        </div>
      )}
    </div>
  );
}
