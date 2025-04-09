import { doc, getDoc } from "firebase/firestore";
import { ArrowUpDown, MoreVertical } from "lucide-react"; // Import icons
import React, { useEffect, useRef, useState } from "react";
import { useFirebase } from "../contexts/FirebaseContext"; // To get user ID
import { addCard, deleteColumn } from "../services/boardService"; // To add new cards and delete columns
import { db } from "../services/firebase";

interface ColumnProps {
  id: string;
  title: string;
  boardId: string;
  sortByVotes: boolean;
  onSortToggle: () => void;
  isBoardOwner: boolean; // Add prop to check if the current user is the board owner
  children: React.ReactNode; // To render Droppable content from Board.tsx
}

export default function Column({
  id,
  title,
  boardId,
  sortByVotes,
  onSortToggle,
  isBoardOwner,
  children,
}: ColumnProps) {
  const { user } = useFirebase();
  const [newCardContent, setNewCardContent] = React.useState("");
  const [isAddingCard, setIsAddingCard] = React.useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [userColor, setUserColor] = useState<string>("bg-blue-100"); // Default color as Tailwind class

  // Fetch the user's color from Firestore when the component mounts
  useEffect(() => {
    if (!user) return;

    const getUserColor = async () => {
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists() && userSnap.data().color) {
          setUserColor(userSnap.data().color);
        }
      } catch (error) {
        console.error("Error fetching user color:", error);
      }
    };

    getUserColor();
  }, [user]);

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
      // Get user's color from Firestore instead of localStorage
      let userColor = "bg-blue-100"; // Default color as Tailwind class

      try {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists() && userDoc.data().color) {
          userColor = userDoc.data().color;
        }
      } catch (error) {
        console.error("Error getting user color:", error);
        // Proceed with default color
      }

      await addCard(
        boardId,
        id,
        newCardContent.trim(),
        user.uid,
        user.displayName || "Anonymous User",
        userColor
      );
      setNewCardContent(""); // Clear input after adding
      setIsAddingCard(false); // Hide the form after adding
    } catch (error) {
      console.error("Error adding card:", error);
      // Handle error appropriately (e.g., show a notification)
    }
  };

  const handleDeleteColumn = async () => {
    if (!isBoardOwner) return;

    try {
      const result = await deleteColumn(boardId, id);
      if (!result.success) {
        console.error("Failed to delete column:", result.error);
      }
      setIsMenuOpen(false);
    } catch (error) {
      console.error("Error deleting column:", error);
    }
  };

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">
      {/* Column header */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-lg font-medium text-gray-800">
          {getMappedTitle()}
        </h2>
        <div className="flex items-center space-x-2">
          <button
            className="flex items-center text-blue-600 hover:text-blue-700 cursor-pointer"
            onClick={onSortToggle}
            data-testid={`sort-toggle-${id}`}
          >
            {sortByVotes && <span className="text-xs mr-1">Votes</span>}
            <ArrowUpDown className="h-4 w-4" />
            <span className="sr-only">Sort</span>
          </button>
          <div className="relative" ref={menuRef}>
            <button
              className="text-blue-600 hover:text-blue-700 cursor-pointer"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              data-testid={`column-menu-${id}`}
            >
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">More options</span>
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                <button
                  className={`w-full text-left px-4 py-2 text-sm ${
                    isBoardOwner
                      ? "text-red-600 hover:bg-gray-100 cursor-pointer"
                      : "text-gray-400 cursor-not-allowed"
                  }`}
                  onClick={handleDeleteColumn}
                  disabled={!isBoardOwner}
                  data-testid={`delete-column-${id}`}
                >
                  Delete column
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cards container - allow scrolling */}
      <div className="flex-grow overflow-y-auto p-3 space-y-3">{children}</div>

      {/* Add card section */}
      {isAddingCard ? (
        <form
          onSubmit={handleAddCard}
          className="p-3 border-t border-gray-200 flex-shrink-0"
          data-testid="add-card-form"
        >
          <textarea
            value={newCardContent}
            onChange={(e) => setNewCardContent(e.target.value)}
            placeholder="Type here... Press Enter to save."
            rows={3}
            className="w-full rounded-none border-none bg-gray-100 text-sm p-3 mb-2 resize-none focus:ring-0"
            required
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (newCardContent.trim() && user) {
                  handleAddCard(e);
                }
              } else if (e.key === "Escape") {
                e.preventDefault();
                setIsAddingCard(false);
              }
            }}
          />
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsAddingCard(false)}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
              disabled={!newCardContent.trim() || !user}
            >
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="p-3 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={() => setIsAddingCard(true)}
            className="w-full p-2 text-sm text-blue-600 bg-gray-50 hover:bg-gray-100 rounded flex items-center justify-center cursor-pointer"
          >
            + Add a card
          </button>
        </div>
      )}
    </div>
  );
}
