import { fireEvent, render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import ExportModal from "../ExportModal";
import { Board, Card } from "../../services/firebase";

// Mock document.execCommand for clipboard test
document.execCommand = vi.fn();

describe("ExportModal", () => {
  const mockBoard: Board = {
    id: "board-1",
    name: "Test Retro Board",
    createdAt: { toDate: () => new Date(), toMillis: () => Date.now() } as any,
    isActive: true,
    columns: {
      col1: { id: "col1", title: "What went well", order: 0 },
      col2: { id: "col2", title: "What can be improved", order: 1 },
      col3: { id: "col3", title: "Action items", order: 2 },
    },
  };

  const mockCards: Card[] = [
    {
      id: "card-1",
      boardId: "board-1",
      columnId: "col1",
      content: "Great teamwork",
      authorId: "user-1",
      authorName: "John",
      createdAt: { toDate: () => new Date(), toMillis: () => Date.now() } as any,
      votes: 3,
      position: 0,
    },
    {
      id: "card-2",
      boardId: "board-1",
      columnId: "col2",
      content: "Communication could be better",
      authorId: "user-2",
      authorName: "Jane",
      createdAt: { toDate: () => new Date(), toMillis: () => Date.now() } as any,
      votes: 2,
      position: 0,
    },
    {
      id: "card-3",
      boardId: "board-1",
      columnId: "col3",
      content: "Create more documentation",
      authorId: "user-3",
      authorName: "Bob",
      createdAt: { toDate: () => new Date(), toMillis: () => Date.now() } as any,
      votes: 1,
      position: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should not render when isOpen is false", () => {
    render(
      <ExportModal
        isOpen={false}
        onClose={vi.fn()}
        board={mockBoard}
        cards={mockCards}
      />
    );

    expect(screen.queryByText("Export Board as Markdown")).toBeNull();
  });

  it("should render when isOpen is true", () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        board={mockBoard}
        cards={mockCards}
      />
    );

    expect(screen.getByText("Export Board as Markdown")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close panel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy to Clipboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as File" })).toBeInTheDocument();
  });

  it("should format markdown content correctly", () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        board={mockBoard}
        cards={mockCards}
      />
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    
    // Check header
    expect(textarea.value).toContain(`# ${mockBoard.name}`);
    expect(textarea.value).toContain("Date:");
    
    // Check column titles
    expect(textarea.value).toContain("## What went well");
    expect(textarea.value).toContain("## What can be improved");
    expect(textarea.value).toContain("## Action items");
    
    // Check card content
    expect(textarea.value).toContain("Great teamwork");
    expect(textarea.value).toContain("Communication could be better");
    expect(textarea.value).toContain("Create more documentation");
    
    // Check votes and authors
    expect(textarea.value).toContain("(3 votes, by John)");
    expect(textarea.value).toContain("(2 votes, by Jane)");
    expect(textarea.value).toContain("(1 votes, by Bob)");
  });

  it("should call onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <ExportModal
        isOpen={true}
        onClose={onClose}
        board={mockBoard}
        cards={mockCards}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should handle copy to clipboard", () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        board={mockBoard}
        cards={mockCards}
      />
    );

    // Trigger copy action
    fireEvent.click(screen.getByRole("button", { name: "Copy to Clipboard" }));
    
    // Check if document.execCommand was called with 'copy'
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });
}); 