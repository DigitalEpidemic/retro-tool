import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Firebase
vi.mock('../services/firebase', () => {
  return {
    db: {},
    auth: {
      currentUser: { uid: 'test-user-id' },
      onAuthStateChanged: vi.fn(callback => {
        callback({ uid: 'test-user-id' });
        return vi.fn();
      }),
    },
    signInAnonymousUser: vi.fn(() => Promise.resolve({ uid: 'test-user-id' })),
  };
});

// Mock react-beautiful-dnd
vi.mock('react-beautiful-dnd', () => {
  return {
    DragDropContext: ({ children }: { children: React.ReactNode }) => children,
    Droppable: ({ children }: any) =>
      children({
        droppableProps: {
          'data-rbd-droppable-id': 'test-droppable-id',
          'data-rbd-droppable-context-id': 'test-context-id',
        },
        innerRef: vi.fn(),
        placeholder: null,
      }),
    Draggable: ({ children }: any) =>
      children({
        draggableProps: {
          'data-rbd-draggable-id': 'test-draggable-id',
          'data-rbd-draggable-context-id': 'test-context-id',
        },
        innerRef: vi.fn(),
        dragHandleProps: { 'data-rbd-drag-handle-draggable-id': 'test-drag-handle-id' },
      }),
  };
});
