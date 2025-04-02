import { useState } from "react";
import { ThumbsUp, Edit2, Trash2 } from "lucide-react";
// Import from boardService instead of cardService
import { updateCard, deleteCard, voteForCard } from "../services/boardService";
import { DraggableProvided } from "@hello-pangea/dnd"; // Import DraggableProvided
import { Card as CardType } from "../services/firebase"; // Import Card type

interface CardProps {
  provided: DraggableProvided; // Use DraggableProvided type
  card: CardType; // Use CardType
  isOwner: boolean;
}

export default function Card({ provided, card, isOwner }: CardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(card.content);

  const handleSave = () => {
    if (content.trim()) {
      updateCard(card.id, { content });
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this card?")) {
      deleteCard(card.id);
    }
  };

  const handleVote = () => {
    voteForCard(card.id);
  };

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      className="bg-neutral-50 rounded-md shadow p-4 hover:shadow-lg transition-shadow mb-4" // Changed bg, rounded, shadow, hover shadow, removed border, added margin-bottom
    >
      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full rounded border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm p-2" // Adjusted border, focus, added text-sm, padding
            rows={3}
            autoFocus
          />
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200" // Neutral cancel button
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700" // Primary save button (using blue)
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">
            {card.content}
          </p>{" "}
          {/* Adjusted text size and color */}
          <div className="mt-3 flex justify-between items-center">
            <div className="text-xs text-gray-500">{card.authorName}</div>{" "}
            {/* Adjusted text size */}
            <div className="flex space-x-1 items-center">
              {" "}
              {/* Added items-center */}
              <button
                onClick={handleVote}
                className="p-1.5 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-100 flex items-center transition-colors" // Adjusted padding, hover colors, added transition
              >
                <ThumbsUp className="h-4 w-4 mr-1" />
                <span className="text-xs font-medium">
                  {card.votes || 0}
                </span>{" "}
                {/* Added font-medium */}
              </button>
              {isOwner && (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1.5 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-100 transition-colors" // Adjusted padding, hover colors, added transition
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleDelete}
                    className="p-1.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-100 transition-colors" // Adjusted padding, hover colors, added transition
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
