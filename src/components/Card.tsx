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

  // Function to determine card color based on column or random assignment
  const getCardColor = () => {
    // This is a simple mapping - extend as needed based on your column IDs
    const columnColors: Record<string, string> = {
      // Mad column (first column) - mint green
      "column-1": "bg-green-100",
      // Sad column (second column) - light purple for some cards, mint green for others
      "column-2": card.id.charCodeAt(0) % 2 === 0 ? "bg-green-100" : "bg-purple-100",
      // Glad column (third column) - alternating colors
      "column-3": card.id.charCodeAt(0) % 2 === 0 ? "bg-green-100" : "bg-purple-100",
      // Default fallback for any other columns
      "default": card.id.charCodeAt(0) % 2 === 0 ? "bg-green-100" : "bg-purple-100",
    };
    
    // Return the color for the column or default to the fallback if column not found
    return columnColors[card.columnId] || columnColors["default"];
  };

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
      className={`${getCardColor()} rounded shadow-sm border-none mb-3 group p-3 min-h-[100px] relative flex flex-col`}
    >
      {isEditing ? (
        <div className="p-2.5 flex-grow">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full rounded border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm p-2 min-h-[80px] resize-none"
            rows={3}
            autoFocus
          />
          <div className="flex justify-end space-x-2 mt-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-2.5 py-1 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-grow">
            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
              {card.content}
            </p>
          </div>
          
          <div className="mt-auto pt-3">
            <div className="border-t border-gray-200 opacity-40 mb-2 mt-1"></div>
            <div className="flex justify-between items-center">
              {/* Author name at bottom of card */}
              <div className="text-xs text-gray-600 font-medium">
                {card.authorName || "Wonderful Turtle"}
              </div>
              
              {/* Action buttons - always visible */}
              <div className="flex space-x-1 items-center">
                <button
                  onClick={handleVote}
                  className="p-1 rounded text-blue-600 hover:text-blue-700 hover:bg-blue-100 flex items-center transition-colors cursor-pointer"
                >
                  <ThumbsUp className="h-3 w-3" />
                  {card.votes > 0 && (
                    <span className="text-xs font-medium ml-0.5">
                      {card.votes}
                    </span>
                  )}
                </button>
                {isOwner && (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1 rounded text-blue-600 hover:text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={handleDelete}
                      className="p-1 rounded text-red-600 hover:text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
