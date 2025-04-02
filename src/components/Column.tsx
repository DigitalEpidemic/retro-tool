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
    // Added fixed width, flex-shrink-0, adjusted bg, shadow, padding
    <div className="w-72 flex-shrink-0 bg-neutral-100 rounded-lg shadow-sm p-3 flex flex-col max-h-full">
      {/* Adjusted title style */}
      <h2 className="text-base font-medium mb-3 px-1 text-gray-700">{title}</h2>

      {/* Render the Droppable area passed as children from Board.tsx */}
      {/* Added padding inside the scrollable area */}
      <div className="flex-grow overflow-y-auto px-1 mb-2">{children}</div>

      {/* Form to add a new card */}
      {/* Removed border-t, adjusted margin/padding */}
      <form onSubmit={handleAddCard} className="mt-auto pt-2">
        <textarea
          value={newCardContent}
          onChange={(e) => setNewCardContent(e.target.value)}
          placeholder="Add a new card..."
          rows={2}
          // Matched style with Card edit textarea
          className="w-full rounded border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm p-2 mb-2"
          required
        />
        <button
          type="submit"
          // Matched style with Card save button
          className="w-full px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-60"
          disabled={!newCardContent.trim() || !user}
        >
          Add Card
        </button>
      </form>
    </div>
  );
}
