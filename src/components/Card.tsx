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
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
    >
      {isEditing ? (
        <div className="space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full rounded border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
            rows={3}
            autoFocus
          />
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-gray-700 whitespace-pre-wrap">{card.content}</p>
          <div className="mt-3 flex justify-between items-center">
            <div className="text-sm text-gray-500">{card.authorName}</div>
            <div className="flex space-x-1">
              <button
                onClick={handleVote}
                className="p-1 rounded text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 flex items-center"
              >
                <ThumbsUp className="h-4 w-4 mr-1" />
                <span className="text-xs">{card.votes || 0}</span>
              </button>

              {isOwner && (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="p-1 rounded text-gray-500 hover:text-indigo-600 hover:bg-indigo-50"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleDelete}
                    className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50"
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
