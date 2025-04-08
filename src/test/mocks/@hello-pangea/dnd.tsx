import React from "react";
import { vi } from "vitest";

// This module mocks @hello-pangea/dnd components for testing
// It automatically gets used when the package is imported in tests
// due to the setup in setupTests.ts

const DragDropContext = ({ children, onDragEnd }: any) => {
  window.capturedOnDragEnd = onDragEnd;
  return <div data-testid="drag-drop-context">{children}</div>;
};

const Droppable = ({ children, droppableId }: any) => {
  const provided = {
    innerRef: vi.fn(),
    droppableProps: { "data-testid": `droppable-${droppableId}` },
    placeholder: null,
  };
  return children(provided, {});
};

const Draggable = ({ children, draggableId }: any) => {
  const provided = {
    innerRef: vi.fn(),
    draggableProps: { "data-testid": `draggable-${draggableId}` },
    dragHandleProps: {},
  };
  return children(provided, {}, {});
};

export { DragDropContext, Droppable, Draggable }; 