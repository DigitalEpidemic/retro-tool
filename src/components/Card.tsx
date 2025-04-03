import { useState, useRef } from "react";
import { ThumbsUp, ThumbsDown, Edit2, Trash2 } from "lucide-react";
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
  const [cardHeight, setCardHeight] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  // Function to determine card color based on column or random assignment
  const getCardColor = () => {
    // This is a simple mapping - extend as needed based on your column IDs
    const columnColors: Record<string, string> = {
      // Mad column (first column) - mint green
      "column-1": "bg-green-100",
      // Sad column (second column) - light purple for some cards, mint green for others
      "column-2":
        card.id.charCodeAt(0) % 2 === 0 ? "bg-green-100" : "bg-purple-100",
      // Glad column (third column) - alternating colors
      "column-3":
        card.id.charCodeAt(0) % 2 === 0 ? "bg-green-100" : "bg-purple-100",
      // Default fallback for any other columns
      default:
        card.id.charCodeAt(0) % 2 === 0 ? "bg-green-100" : "bg-purple-100",
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

  const handleEdit = () => {
    if (cardRef.current) {
      const height = cardRef.current.clientHeight;
      setCardHeight(height);
    }
    setIsEditing(true);
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this card?")) {
      deleteCard(card.id);
    }
  };

  const handleVote = (voteType: "up" | "down") => {
    voteForCard(card.id, voteType).catch((error) => {
      console.error("Vote failed:", error);
    });
  };

  return (
    <div
      ref={(node) => {
        provided.innerRef(node);
        cardRef.current = node;
      }}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      className={`${getCardColor()} rounded shadow-sm border-none mb-3 group p-0 min-h-[100px] relative flex flex-col overflow-hidden`}
    >
      {isEditing ? (
        <div className="p-3" style={{ height: `${cardHeight}px` }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-[calc(100%-40px)] rounded border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm p-2 resize-none"
            autoFocus
          />
          <div className="flex justify-end space-x-2 mt-2">
            <button
              aria-label="Cancel"
              onClick={() => setIsEditing(false)}
              className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              aria-label="Save"
              onClick={handleSave}
              className="px-2.5 py-1 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Position edit/delete buttons in top right corner */}
          <div className="absolute right-0 top-0 flex flex-col items-center py-2 px-0 min-w-[30px] z-10">
            {isOwner && (
              <>
                {/* Delete button at top */}
                <button
                  aria-label="Delete"
                  onClick={handleDelete}
                  className="p-1 rounded text-red-600 hover:text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                </button>

                {/* Edit button below delete */}
                <button
                  aria-label="Edit"
                  onClick={handleEdit}
                  className="p-1 mt-2 rounded text-blue-600 hover:text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  <Edit2 className="h-3 w-3" />
                </button>
              </>
            )}
          </div>

          {/* Card content with padding to accommodate action buttons */}
          <div className="flex-grow py-3 mr-[30px] ml-[30px]">
            <p className="text-sm text-gray-900 whitespace-pre-wrap break-words leading-relaxed text-left">
              {card.content}
            </p>
          </div>

          {/* Footer with author name and voting */}
          <div className="px-3 pb-2 relative">
            <div className="flex items-center justify-between">
              {/* Voting component horizontal layout on left */}
              <div className="flex items-center">
                <button
                  onClick={() => handleVote("up")}
                  className="p-1 rounded flex items-center transition-colors cursor-pointer text-gray-500 hover:text-green-600 hover:bg-green-50"
                >
                  <ThumbsUp aria-label="Upvote" className="h-3 w-3" />
                </button>

                <span className="text-xs font-medium mx-1">{card.votes}</span>

                <button
                  onClick={() => handleVote("down")}
                  className="p-1 rounded flex items-center transition-colors cursor-pointer text-gray-500 hover:text-red-600 hover:bg-red-50"
                >
                  <ThumbsDown aria-label="Downvote" className="h-3 w-3" />
                </button>
              </div>

              {/* Author name on right */}
              <div className="text-right">
                <div className="text-xs text-gray-500 italic">
                  {card.authorName || "Wonderful Turtle"}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
