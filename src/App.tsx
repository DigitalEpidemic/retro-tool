import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { ClipboardCheck, Shuffle } from "lucide-react";
import { nanoid } from "nanoid";
import { FormEvent, useEffect, useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import "./App.css";
import Board from "./components/Board";
import { useFirebase } from "./contexts/FirebaseContext";
import "./index.css";
import { createBoard } from "./services/boardService";
import { db } from "./services/firebase";

// A simple component for the root path
function Home() {
  const navigate = useNavigate();
  const { user, loading: authLoading, updateUserDisplayName } = useFirebase();
  const [username, setUsername] = useState("");
  const [boardName, setBoardName] = useState("");
  const [userColor, setUserColor] = useState("#6B7280");
  const [isLoading, setIsLoading] = useState(false);
  const [joinBoardId, setJoinBoardId] = useState("");
  const [showJoinInput, setShowJoinInput] = useState(false);

  // Set initial username from Firebase user when available
  useEffect(() => {
    if (user && user.displayName) {
      setUsername(user.displayName);
    }
  }, [user]);

  // Array of predefined colors the user can choose from
  const colorOptions = [
    { value: "#F87171", name: "Red" },
    { value: "#FB923C", name: "Orange" },
    { value: "#FBBF24", name: "Amber" },
    { value: "#34D399", name: "Emerald" },
    { value: "#60A5FA", name: "Blue" },
    { value: "#A78BFA", name: "Violet" },
    { value: "#F472B6", name: "Pink" },
    { value: "#6B7280", name: "Gray" },
  ];

  const handleRandomColor = () => {
    const randomIndex = Math.floor(Math.random() * colorOptions.length);
    setUserColor(colorOptions[randomIndex].value);
  };

  const handleCreateBoard = async (e: FormEvent) => {
    e.preventDefault();
    if (authLoading || !user) return;

    setIsLoading(true);

    try {
      // Create a random board ID with nanoid
      const newBoardId = nanoid(8);

      // First update the user's display name if needed
      if (updateUserDisplayName && username !== user.displayName) {
        updateUserDisplayName(username);
      }

      // Check if user document exists first
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        // Update existing user document
        await updateDoc(userRef, {
          name: username,
          color: userColor,
        });
      } else {
        // Create new user document
        await setDoc(userRef, {
          id: user.uid,
          name: username,
          color: userColor,
          lastActive: new Date(),
          boardId: newBoardId,
        });
      }

      // Create the board in Firebase
      await createBoard(boardName, user.uid, newBoardId);

      // Navigate to the new board
      navigate(`/board/${newBoardId}`);
    } catch (error) {
      console.error("Error creating board:", error);
      setIsLoading(false);
    }
  };

  const handleJoinBoard = (e: FormEvent) => {
    e.preventDefault();
    if (joinBoardId.trim()) {
      navigate(`/board/${joinBoardId.trim()}`);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl">
        <div className="p-8">
          <div className="flex items-center justify-center mb-6">
            <ClipboardCheck className="h-10 w-10 text-indigo-600" />
            <h1 className="ml-2 text-2xl font-bold text-gray-800">
              Retrospective Board
            </h1>
          </div>

          <p className="text-gray-600 mb-8 text-center">
            Create a new retrospective board to collaborate with your team
          </p>

          <form onSubmit={handleCreateBoard} className="space-y-6">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700"
              >
                Your Name
              </label>
              <input
                type="text"
                id="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label
                htmlFor="boardName"
                className="block text-sm font-medium text-gray-700"
              >
                Board Name
              </label>
              <input
                type="text"
                id="boardName"
                required
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="Sprint 42 Retrospective"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Your Card Color
              </label>
              <div className="mt-2 flex items-center">
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setUserColor(color.value)}
                      className={`h-8 w-8 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                        userColor === color.value
                          ? "ring-2 ring-offset-2 ring-indigo-500"
                          : ""
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                      aria-label={`Select ${color.name} color`}
                    ></button>
                  ))}
                  <button
                    type="button"
                    onClick={handleRandomColor}
                    className="h-8 w-8 rounded-full bg-white border border-gray-300 flex items-center justify-center cursor-pointer"
                    title="Random color"
                  >
                    <Shuffle className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading || authLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Creating..." : "Create Retro Board"}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              {showJoinInput ? (
                <form onSubmit={handleJoinBoard} className="mt-4">
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={joinBoardId}
                      onChange={(e) => setJoinBoardId(e.target.value)}
                      placeholder="Enter board ID"
                      className="flex-1 rounded-l-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center px-4 py-2 border border-transparent rounded-r-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      Join
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  Already have a board?{" "}
                  <button
                    onClick={() => setShowJoinInput(true)}
                    className="text-indigo-600 hover:text-indigo-500 cursor-pointer"
                  >
                    Join an existing board
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 max-w-md mx-auto text-center text-sm text-gray-500">
        <p>
          A collaborative tool for team retrospectives. Share ideas, vote on
          topics, and track action items.
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="h-screen">
      <main className="h-full">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/board/:boardId" element={<Board />} />
          <Route
            path="*"
            element={
              <div className="p-4 text-center text-red-500">Page Not Found</div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
