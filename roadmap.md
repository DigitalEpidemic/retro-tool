# Real-Time Retrospective Tool Project Roadmap

## Technology Selection

After evaluating your requirements, I recommend using **Firebase** for the backend due to its mature real-time capabilities, excellent React integration, and simplified authentication flow. Firebase Firestore will provide the real-time database features needed for this collaborative application.

## Project Setup and Structure

### Phase 1: Project Initialization (Week 1)

#### Milestone: Project Scaffold and Environment Setup

1. **Initialize React + Vite project with TypeScript**

   ```bash
   npm create vite@latest retro-tool -- --template react-ts
   cd retro-tool
   npm install
   ```

2. **Add key dependencies**

   ```bash
   npm install firebase react-beautiful-dnd @types/react-beautiful-dnd tailwindcss postcss autoprefixer lucide-react react-router-dom nanoid date-fns
   npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
   ```

3. **Configure Tailwind CSS**

   ```bash
   npx tailwindcss init -p
   ```

4. **Set up Vitest**

   ```javascript
   // vitest.config.ts
   import { defineConfig } from "vitest/config";
   import react from "@vitejs/plugin-react";

   export default defineConfig({
     plugins: [react()],
     test: {
       environment: "jsdom",
       globals: true,
       setupFiles: "./src/test/setup.ts",
     },
   });
   ```

5. **Firebase project setup**
   - Create a new Firebase project in Firebase Console
   - Enable Firestore Database
   - Set up appropriate security rules
   - Configure authentication (anonymous auth)

### Phase 2: Database Schema Design (Week 1)

#### Milestone: Finalized Database Structure

**Firestore Collections Structure:**

```typescript
// Database Schema

// boards collection
interface Board {
  id: string;
  name: string;
  createdAt: Timestamp;
  isActive: boolean;
  columns: {
    [columnId: string]: {
      id: string;
      title: string;
      order: number;
    };
  };
  facilitatorId?: string; // optional creator ID
}

// cards collection
interface Card {
  id: string;
  boardId: string;
  columnId: string;
  content: string;
  authorId: string; // anonymous ID
  authorName: string;
  createdAt: Timestamp;
  votes: number;
  position: number; // for ordering
}

// actions collection
interface Action {
  id: string;
  boardId: string;
  content: string;
  assignee?: string;
  status: "pending" | "in-progress" | "completed";
  createdAt: Timestamp;
  relatedCardIds: string[]; // reference to source cards
}

// users collection (for temporary session data)
interface User {
  id: string;
  name: string;
  color: string; // for user identification
  boardId: string;
  lastActive: Timestamp;
}
```

## Implementation Phases

### Phase 3: Core Infrastructure (Week 2)

#### Milestone: Firebase Integration and Authentication

1. **Firebase Service Setup**

```typescript:src/services/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const signInAnonymousUser = async () => {
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error) {
    console.error('Error signing in anonymously:', error);
    throw error;
  }
};
```

2. **Context and Hooks for Firebase**

```typescript:src/contexts/FirebaseContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, signInAnonymousUser } from '../services/firebase';
import { User } from 'firebase/auth';

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  error: Error | null;
}

const FirebaseContext = createContext<FirebaseContextType>({
  user: null,
  loading: true,
  error: null
});

export const FirebaseProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(
      (user) => {
        setUser(user);
        setLoading(false);
      },
      (error) => {
        setError(error);
        setLoading(false);
      }
    );

    // Auto sign-in anonymously
    if (!auth.currentUser) {
      signInAnonymousUser().catch(setError);
    }

    return () => unsubscribe();
  }, []);

  return (
    <FirebaseContext.Provider value={{ user, loading, error }}>
      {children}
    </FirebaseContext.Provider>
  );
};

export const useFirebase = () => useContext(FirebaseContext);
```

3. **Data Services**

```typescript:src/services/boardService.ts
import { db } from './firebase';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, Timestamp, serverTimestamp
} from 'firebase/firestore';
import { nanoid } from 'nanoid';

// Create a new board
export const createBoard = async (name: string, creatorId?: string) => {
  // Default columns
  const columns = {
    col1: { id: 'col1', title: 'What went well', order: 0 },
    col2: { id: 'col2', title: 'What can be improved', order: 1 },
    col3: { id: 'col3', title: 'Action items', order: 2 }
  };

  const boardData = {
    name,
    createdAt: serverTimestamp(),
    isActive: true,
    columns,
    facilitatorId: creatorId || null
  };

  const boardRef = await addDoc(collection(db, 'boards'), boardData);
  return boardRef.id;
};

// Subscribe to board updates
export const subscribeToBoard = (boardId: string, callback: (board: any) => void) => {
  const boardRef = doc(db, 'boards', boardId);
  return onSnapshot(boardRef, (doc) => {
    if (doc.exists()) {
      callback({ id: doc.id, ...doc.data() });
    } else {
      callback(null);
    }
  });
};

// Additional board operations...
```

4. **Testing Infrastructure**

```typescript:src/test/setup.ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Firebase
vi.mock('../services/firebase', () => {
  return {
    db: {},
    auth: {
      currentUser: { uid: 'test-user-id' },
      onAuthStateChanged: vi.fn((callback) => {
        callback({ uid: 'test-user-id' });
        return vi.fn();
      })
    },
    signInAnonymousUser: vi.fn(() => Promise.resolve({ uid: 'test-user-id' }))
  };
});

// Mock react-beautiful-dnd
vi.mock('react-beautiful-dnd', () => {
  return {
    DragDropContext: ({ children }: { children: React.ReactNode }) => children,
    Droppable: ({ children }: any) => children({
      droppableProps: {
        'data-rbd-droppable-id': 'test-droppable-id',
        'data-rbd-droppable-context-id': 'test-context-id',
      },
      innerRef: vi.fn(),
      placeholder: null,
    }),
    Draggable: ({ children }: any) => children({
      draggableProps: {
        'data-rbd-draggable-id': 'test-draggable-id',
        'data-rbd-draggable-context-id': 'test-context-id',
      },
      innerRef: vi.fn(),
      dragHandleProps: { 'data-rbd-drag-handle-draggable-id': 'test-drag-handle-id' },
    }),
  };
});
```

### Phase 4: Core Components (Week 3)

#### Milestone: Basic UI Components with Tailwind

1. **Layout Component**

```tsx:src/components/Layout.tsx
import { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ClipboardList className="h-6 w-6 text-indigo-600" />
            <h1 className="text-xl font-semibold text-gray-900">Retro Tool</h1>
          </div>
          <nav className="flex space-x-4">
            {/* Navigation links will go here */}
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="bg-white border-t border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Retro Tool. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
```

2. **Board Component**

```tsx:src/components/Board.tsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from 'react-beautiful-dnd';
import { subscribeToBoard } from '../services/boardService';
import { subscribeToCards, updateCardPosition } from '../services/cardService';
import Column from './Column';
import CardComponent from './Card';
import { useFirebase } from '../contexts/FirebaseContext';

export default function Board() {
  const { boardId } = useParams<{ boardId: string }>();
  const { user } = useFirebase();
  const navigate = useNavigate();
  const [board, setBoard] = useState<any>(null);
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!boardId) {
      navigate('/');
      return;
    }

    // Subscribe to board changes
    const unsubscribeBoard = subscribeToBoard(boardId, (boardData) => {
      if (!boardData) {
        navigate('/not-found');
        return;
      }
      setBoard(boardData);
      setLoading(false);
    });

    // Subscribe to cards changes
    const unsubscribeCards = subscribeToCards(boardId, (cardsData) => {
      setCards(cardsData);
    });

    return () => {
      unsubscribeBoard();
      unsubscribeCards();
    };
  }, [boardId, navigate]);

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Dropped outside a valid area
    if (!destination) return;

    // Dropped in the same position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // Update card position in Firestore
    updateCardPosition(
      draggableId,
      destination.droppableId,
      destination.index,
      source.droppableId,
      cards
    );
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">{board.name}</h1>
        <div className="flex space-x-4">
          {/* Board actions will go here */}
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {board.columns && Object.values(board.columns)
            .sort((a: any, b: any) => a.order - b.order)
            .map((column: any) => (
              <Column
                key={column.id}
                id={column.id}
                title={column.title}
                boardId={boardId!}
              >
                <Droppable droppableId={column.id}>
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-3 min-h-[200px]"
                    >
                      {cards
                        .filter(card => card.columnId === column.id)
                        .sort((a, b) => a.position - b.position)
                        .map((card, index) => (
                          <Draggable key={card.id} draggableId={card.id} index={index}>
                            {(provided) => (
                              <CardComponent
                                provided={provided}
                                card={card}
                                isOwner={card.authorId === user?.uid}
                              />
                            )}
                          </Draggable>
                        ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </Column>
            ))}
        </div>
      </DragDropContext>
    </div>
  );
}
```

3. **Card Component**

```tsx:src/components/Card.tsx
import { useState } from 'react';
import { ThumbsUp, Edit2, Trash2 } from 'lucide-react';
import { updateCard, deleteCard, voteForCard } from '../services/cardService';

interface CardProps {
  provided: any;
  card: any;
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
    if (window.confirm('Are you sure you want to delete this card?')) {
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
            <div className="text-sm text-gray-500">
              {card.authorName}
            </div>
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
```

### Phase 5: Advanced Features (Week 4)

#### Milestone: Real-time Collaboration & Voting

1. **User presence indicators**
2. **Action items tracking**
3. **Meeting summary generation**

### Phase 6: Testing (Weeks 5-6)

#### Milestone: Comprehensive Test Coverage

1. **Unit Tests for Components**

```typescript:src/components/__tests__/Card.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import Card from '../Card';
import * as cardService from '../../services/cardService';

// Mock the card service
vi.mock('../../services/cardService', () => ({
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  voteForCard: vi.fn(),
}));

describe('Card component', () => {
  const mockProvided = {
    innerRef: vi.fn(),
    draggableProps: {},
    dragHandleProps: {},
  };

  const mockCard = {
    id: 'card1',
    content: 'Test card content',
    authorId: 'user1',
    authorName: 'User 1',
    votes: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders card content correctly', () => {
    render(<Card provided={mockProvided} card={mockCard} isOwner={true} />);
    expect(screen.getByText('Test card content')).toBeInTheDocument();
    expect(screen.getByText('User 1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  test('shows edit and delete buttons for card owner', () => {
    render(<Card provided={mockProvided} card={mockCard} isOwner={true} />);
    expect(screen.getByLabelText(/edit/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/delete/i)).toBeInTheDocument();
  });

  test('hides edit and delete buttons for non-owners', () => {
    render(<Card provided={mockProvided} card={mockCard} isOwner={false} />);
    expect(screen.queryByLabelText(/edit/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/delete/i)).not.toBeInTheDocument();
  });

  test('allows voting on cards', () => {
    render(<Card provided={mockProvided} card={mockCard} isOwner={false} />);
    fireEvent.click(screen.getByLabelText(/thumbs up/i));
    expect(cardService.voteForCard).toHaveBeenCalledWith('card1');
  });

  test('enters edit mode when edit button is clicked', () => {
    render(<Card provided={mockProvided} card={mockCard} isOwner={true} />);
    fireEvent.click(screen.getByLabelText(/edit/i));
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test card content')).toBeInTheDocument();
  });

  test('updates card content on save', () => {
    render(<Card provided={mockProvided} card={mockCard} isOwner={true} />);

    // Enter edit mode
    fireEvent.click(screen.getByLabelText(/edit/i));

    // Update content
    const textarea = screen.getByDisplayValue('Test card content');
    fireEvent.change(textarea, { target: { value: 'Updated content' } });

    // Save changes
    fireEvent.click(screen.getByText('Save'));

    // Verify service was called
    expect(cardService.updateCard).toHaveBeenCalledWith('card1', { content: 'Updated content' });
  });
});
```

2. **Integration Tests for pages and flows**
3. **E2E tests for critical user journeys**

### Phase 7: Deployment and Polish (Week 7)

#### Milestone: Production-Ready Application

1. **CI/CD setup with GitHub Actions**
2. **Environment Configuration**
3. **Deployment to Vercel/Netlify**
4. **Performance optimization**

## Best Practices

### 1. Real-time Collaboration

- Use Firestore's snapshot listeners for real-time updates
- Implement optimistic UI updates for better user experience
- Add user cursors/presence indicators when multiple users are viewing the same card

### 2. Security

- Set up proper Firestore security rules to prevent unauthorized access
- Implement rate limiting to prevent abuse
- Sanitize user input to prevent XSS attacks

### 3. Testing Strategy

- Unit test all core components and services
- Create integration tests for key user flows
- Test real-time functionality with mocked Firebase services
- Use Testing Library's user-event for simulating user interactions

### 4. State Management

- Use React Context for global state like user auth and theme
- Leverage Firebase real-time capabilities for shared state
- Prefer local component state for UI-specific state

### 5. Performance

- Implement pagination/virtualization for boards with many cards
- Use Firebase query limits and indexing to optimize data retrieval
- Implement proper error boundaries and fallbacks

## Breakdown of Major Components to Test

1. **Board Creation and Joining**

   - Creating a new board with default columns
   - Joining an existing board via URL
   - Error handling for invalid board IDs

2. **Card Management**

   - Adding new cards to columns
   - Editing and deleting cards
   - Voting functionality
   - Dragging and dropping cards

3. **Real-time Updates**

   - Multiple users adding/editing/voting simultaneously
   - Conflict resolution when multiple users edit the same card
   - Presence indicators and activity tracking

4. **Action Item Tracking**

   - Creating action items from cards
   - Assigning owners to action items
   - Updating action item status

5. **Meeting Summary**
   - Generating a summary of all columns and votes
   - Exporting meeting results

This roadmap provides a comprehensive plan for developing your real-time retrospective tool. The focus on Firebase for real-time capabilities will ensure smooth collaboration, while the detailed testing strategy will help you build a robust, production-ready application.
