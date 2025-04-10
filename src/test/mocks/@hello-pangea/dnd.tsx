import React, { ReactNode } from 'react';
import { vi } from 'vitest';

// This module mocks @hello-pangea/dnd components for testing
// It automatically gets used when the package is imported in tests
// due to the setup in setupTests.ts

type DragDropContextProps = {
  children: ReactNode;
  onDragEnd: (result: unknown) => void;
};

const DragDropContext = ({ children, onDragEnd }: DragDropContextProps) => {
  window.capturedOnDragEnd = onDragEnd;
  return <div data-testid="drag-drop-context">{children}</div>;
};

type DroppableProvided = {
  innerRef: ReturnType<typeof vi.fn>;
  droppableProps: { 'data-testid': string; [key: string]: unknown };
  placeholder: React.ReactNode;
};

type DroppableProps = {
  children: (provided: DroppableProvided, snapshot: Record<string, unknown>) => React.ReactNode;
  droppableId: string;
};

const Droppable = ({ children, droppableId }: DroppableProps) => {
  const provided = {
    innerRef: vi.fn(),
    droppableProps: { 'data-testid': `droppable-${droppableId}` },
    placeholder: null,
  };
  return children(provided, {});
};

type DraggableProvided = {
  innerRef: ReturnType<typeof vi.fn>;
  draggableProps: { 'data-testid': string; [key: string]: unknown };
  dragHandleProps: Record<string, unknown>;
};

type DraggableProps = {
  children: (
    provided: DraggableProvided, 
    snapshot: Record<string, unknown>,
    rubric: Record<string, unknown>
  ) => React.ReactNode;
  draggableId: string;
};

const Draggable = ({ children, draggableId }: DraggableProps) => {
  const provided = {
    innerRef: vi.fn(),
    draggableProps: { 'data-testid': `draggable-${draggableId}` },
    dragHandleProps: {},
  };
  return children(provided, {}, {});
};

export { DragDropContext, Droppable, Draggable };
