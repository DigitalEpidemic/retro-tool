import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ClipboardCheck, Shuffle } from 'lucide-react';
import { nanoid } from 'nanoid';
import { FormEvent, useEffect, useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import './App.css';
import Board from './components/Board';
import { useFirebase } from './contexts/useFirebase';
import './index.css';
import { createBoard } from './services/boardService';
import { db } from './services/firebase';
import { updateParticipantColor } from './services/presenceService';

// A simple component for the root path
function Home() {
  const navigate = useNavigate();
  const { user, loading: authLoading, updateUserDisplayName } = useFirebase();
  const [username, setUsername] = useState('');
  const [boardName, setBoardName] = useState('');
  const [userColor, setUserColor] = useState('bg-blue-200');
  const [isLoading, setIsLoading] = useState(false);
  const [joinBoardId, setJoinBoardId] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [isUpdatingColor, setIsUpdatingColor] = useState(false);
  const [colorUpdateStatus, setColorUpdateStatus] = useState<string | null>(null);

  // Set initial username from Firebase user when available
  useEffect(() => {
    if (user?.displayName) {
      setUsername(user.displayName);
    }
  }, [user]);

  // Array of 14 predefined distinct colors from Tailwind
  const colorOptions = [
    { value: 'bg-red-200', name: 'Red' },
    { value: 'bg-orange-200', name: 'Orange' },
    { value: 'bg-amber-200', name: 'Amber' },
    { value: 'bg-yellow-200', name: 'Yellow' },
    { value: 'bg-lime-200', name: 'Lime' },
    { value: 'bg-green-200', name: 'Green' },
    { value: 'bg-teal-200', name: 'Teal' },
    { value: 'bg-cyan-200', name: 'Cyan' },
    { value: 'bg-sky-200', name: 'Sky' },
    { value: 'bg-blue-200', name: 'Blue' },
    { value: 'bg-indigo-200', name: 'Indigo' },
    { value: 'bg-violet-200', name: 'Violet' },
    { value: 'bg-fuchsia-200', name: 'Fuchsia' },
    { value: 'bg-rose-200', name: 'Rose' },
  ];

  // Load user color from Firestore if available
  useEffect(() => {
    if (!user) return;

    const loadUserColor = async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists() && userSnap.data().color) {
          setUserColor(userSnap.data().color);
        }
      } catch (error) {
        console.error('Error loading user color:', error);
      }
    };

    loadUserColor();
  }, [user]);

  const handleRandomColor = async () => {
    if (isUpdatingColor || !user) return;

    const randomIndex = Math.floor(Math.random() * colorOptions.length);
    const newColor = colorOptions[randomIndex].value;

    await handleColorChange(newColor);
  };

  // Update color preference in Firestore without updating cards
  const handleColorChange = async (color: string) => {
    if (isUpdatingColor || !user) return;

    setIsUpdatingColor(true);
    setColorUpdateStatus('Updating color preference...');

    try {
      setUserColor(color);

      // Update in Firestore - this only updates the preference, not the cards
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { color });

      // Check if the user is in a board
      const userSnap = await getDoc(userRef);
      const currentBoardId = userSnap.exists() ? userSnap.data().boardId : null;

      // Update in realtime database if the user is in a board
      if (currentBoardId) {
        try {
          // Only update the participant color in the realtime database
          // We won't update card colors here - that will happen in the Board component
          // when the user is confirmed to be in the participants list
          await updateParticipantColor(user.uid, currentBoardId, color);
          setColorUpdateStatus(
            'Color preference saved. Your cards will update when you are active in a board.'
          );
        } catch (rtdbError) {
          console.error('Error updating realtime database color:', rtdbError);
          setColorUpdateStatus(
            'Color preference saved. Your cards will update when you are active in a board.'
          );
        }
      } else {
        // User is not in any board, just save the preference
        setColorUpdateStatus(
          'Color preference saved. Your cards will update when you join boards.'
        );
      }

      // Clear status after 3 seconds
      setTimeout(() => setColorUpdateStatus(null), 3000);
    } catch (error) {
      console.error('Error updating color:', error);
      setColorUpdateStatus('Error updating color preference.');
      setTimeout(() => setColorUpdateStatus(null), 5000);
    } finally {
      setIsUpdatingColor(false);
    }
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
      const userRef = doc(db, 'users', user.uid);
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
      console.error('Error creating board:', error);
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
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-blue-50 to-indigo-50 py-6 px-3 sm:py-8 sm:px-6 lg:px-8 overflow-auto flex flex-col items-center justify-center">
      <div className="max-w-md w-full mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl mb-4">
        <div className="p-4 sm:p-6 md:p-8">
          <div className="flex items-center justify-center mb-4">
            <ClipboardCheck className="h-8 w-8 sm:h-10 sm:w-10 text-indigo-600" />
            <h1 className="ml-2 text-xl sm:text-2xl font-bold text-gray-800">Retrospective Board</h1>
          </div>

          <p className="text-gray-600 mb-6 text-center text-sm sm:text-base">
            Create a new retrospective board to collaborate with your team
          </p>

          <form onSubmit={handleCreateBoard} className="space-y-4 sm:space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                Your Name
              </label>
              <input
                type="text"
                id="username"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label htmlFor="boardName" className="block text-sm font-medium text-gray-700">
                Board Name
              </label>
              <input
                type="text"
                id="boardName"
                required
                value={boardName}
                onChange={e => setBoardName(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="Sprint 42 Retrospective"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Your Card Color</label>
              <p className="text-xs text-gray-500 mb-2">
                This color will be used for all cards you create across any board.
              </p>
              {isUpdatingColor && (
                <div className="mt-1 mb-2">
                  <div className="h-1 bg-blue-200 rounded">
                    <div className="h-1 bg-blue-500 rounded animate-pulse"></div>
                  </div>
                </div>
              )}
              {colorUpdateStatus && (
                <p className="text-xs text-blue-600 mb-2">{colorUpdateStatus}</p>
              )}
              <div className="mt-2 flex items-center">
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => handleColorChange(color.value)}
                      disabled={isUpdatingColor}
                      className={`h-7 w-7 sm:h-8 sm:w-8 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                        userColor === color.value ? 'ring-2 ring-offset-2 ring-indigo-500' : ''
                      } ${isUpdatingColor ? 'opacity-50 cursor-not-allowed' : ''} ${color.value}`}
                      title={color.name}
                      aria-label={`Select ${color.name} color`}
                    ></button>
                  ))}
                  <button
                    type="button"
                    onClick={handleRandomColor}
                    disabled={isUpdatingColor}
                    className={`h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-white border border-gray-300 flex items-center justify-center cursor-pointer ${
                      isUpdatingColor ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    title="Random color"
                  >
                    <Shuffle className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500" />
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-1 sm:pt-2">
              <button
                type="submit"
                disabled={isLoading || authLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Creating...' : 'Create Retro Board'}
              </button>
            </div>
          </form>

          <div className="mt-4 sm:mt-6 text-center text-sm text-gray-500">
            <p>
              {showJoinInput ? (
                <form onSubmit={handleJoinBoard} className="mt-3">
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={joinBoardId}
                      onChange={e => setJoinBoardId(e.target.value)}
                      placeholder="Enter board ID"
                      className="flex-1 rounded-l-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-r-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      Join
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  Already have a board?{' '}
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

      <div className="max-w-md w-full mx-auto text-center text-xs sm:text-sm text-gray-500 pb-4">
        <p>
          A collaborative tool for team retrospectives. Share ideas, vote on topics, and track
          action items.
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="h-dvh">
      <main className="h-full">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/board/:boardId" element={<Board />} />
          <Route
            path="*"
            element={<div className="p-4 text-center text-red-500">Page Not Found</div>}
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
