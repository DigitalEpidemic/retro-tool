import React from "react";
import { Droppable, DraggableProvided } from "@hello-pangea/dnd";
import CardComponent from "./Card"; // Assuming Card.tsx exists and exports CardComponent
import { Card as CardType } from "../services/firebase"; // Import Card type
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
    <div className="bg-gray-100 rounded-lg shadow p-4 flex flex-col">
      <h2 className="text-lg font-semibold mb-4 text-gray-800">{title}</h2>

      {/* Render the Droppable area passed as children from Board.tsx */}
      <div className="flex-grow overflow-y-auto mb-4">{children}</div>

      {/* Form to add a new card */}
      <form
        onSubmit={handleAddCard}
        className="mt-auto pt-4 border-t border-gray-200"
      >
        <textarea
          value={newCardContent}
          onChange={(e) => setNewCardContent(e.target.value)}
          placeholder="Add a new card..."
          rows={2}
          className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          required
        />
        <button
          type="submit"
          className="mt-2 w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded transition duration-150 ease-in-out disabled:opacity-50"
          disabled={!newCardContent.trim() || !user}
        >
          Add Card
        </button>
      </form>
    </div>
  );
}
