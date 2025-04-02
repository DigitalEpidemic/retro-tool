import React from "react";
// Removed unused imports: Droppable, DraggableProvided, CardComponent, CardType
import { useFirebase } from "../contexts/FirebaseContext"; // To get user ID
import { addCard } from "../services/boardService"; // To add new cards

interface ColumnProps {
  id: string;
  title: string;
  boardId: string;
  children: React.ReactNode; // To render Droppable content from Board.tsx
}

export default function Column({ id, title, boardId, children }: ColumnProps) {
  const { user } = useFirebase();
  const [newCardContent, setNewCardContent] = React.useState("");

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardContent.trim() || !user) return;

    try {
      await addCard(boardId, id, newCardContent.trim(), user.uid);
      setNewCardContent(""); // Clear input after adding
    } catch (error) {
      console.error("Error adding card:", error);
      // Handle error appropriately (e.g., show a notification)
    }
  };

  return (
    <div className="w-80 flex-shrink-0 bg-white rounded shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-11rem)] min-h-[24rem]">
      <div className="px-3 py-2.5 border-b border-gray-200 bg-gray-50">
        <h2 className="text-sm font-medium text-gray-800">{title}</h2>
      </div>

      <div className="flex-grow overflow-y-auto px-3 py-2">
        {children}
      </div>

      <form onSubmit={handleAddCard} className="p-3 border-t border-gray-200 bg-gray-50">
        <textarea
          value={newCardContent}
          onChange={(e) => setNewCardContent(e.target.value)}
          placeholder="Add a new card..."
          rows={2}
          className="w-full rounded-md border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm p-2.5 mb-2 resize-none"
          required
        />
        <button
          type="submit"
          className="w-full px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
          disabled={!newCardContent.trim() || !user}
        >
          Add Card
        </button>
      </form>
    </div>
  );
}
