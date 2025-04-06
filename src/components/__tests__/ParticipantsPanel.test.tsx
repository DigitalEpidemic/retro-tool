import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnlineUser } from "../../services/firebase";
import ParticipantsPanel from "../ParticipantsPanel";

// Mock lucide-react icons used in ParticipantsPanel
vi.mock("lucide-react", () => ({
  X: () => <div data-testid="x-icon">X</div>,
  Edit2: () => <div data-testid="edit-icon">Edit</div>,
  Check: () => <div data-testid="check-icon">Check</div>,
  Users: () => <div data-testid="users-icon">Users</div>,
}));

// Mock participants data
const mockParticipants: OnlineUser[] = [
  {
    id: "user1",
    name: "John Doe",
    color: "#ff0000",
    boardId: "board1",
    lastOnline: Date.now(),
  },
  {
    id: "user2",
    name: "Jane Smith",
    color: "#00ff00",
    boardId: "board1",
    lastOnline: Date.now(),
  },
  {
    id: "current-user",
    name: "Current User",
    color: "#0000ff",
    boardId: "board1",
    lastOnline: Date.now(),
  },
];

describe("ParticipantsPanel", () => {
  // Setup for each test
  const mockOnClose = vi.fn();
  const mockOnUpdateName = vi.fn();
  const currentUserId = "current-user";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when not open", () => {
    render(
      <ParticipantsPanel
        isOpen={false}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
      />
    );

    // Panel should not be visible
    expect(screen.queryByText("Participants")).not.toBeInTheDocument();
  });

  it("renders a list of participants when open", () => {
    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
      />
    );

    // Panel should be visible
    expect(screen.getByText("Participants")).toBeInTheDocument();

    // Header should be visible
    expect(screen.getByText("Participants")).toBeInTheDocument();

    // All participants should be listed
    mockParticipants.forEach((participant) => {
      expect(
        screen.getByText(
          participant.name + (participant.id === currentUserId ? " (You)" : "")
        )
      ).toBeInTheDocument();
    });

    // Current user should have "(You)" next to their name
    expect(screen.getByText("Current User (You)")).toBeInTheDocument();
  });

  it("closes the panel when the close button is clicked", async () => {
    const user = userEvent.setup();

    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
      />
    );

    // Find and click the close button
    const closeButton = screen.getByLabelText("Close panel");
    await user.click(closeButton);

    // Verify onClose was called
    expect(mockOnClose).toHaveBeenCalled();
  });

  it("shows edit button only for current user", () => {
    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
      />
    );

    // Current user should have an edit button
    const editButton = screen.getByLabelText("Edit your name");
    expect(editButton).toBeInTheDocument();

    // Ensure edit button is only next to Current User
    const currentUserName = screen.getByText("Current User (You)");
    expect(
      currentUserName.parentElement?.parentElement?.contains(editButton)
    ).toBe(true);

    // There should only be one edit button
    expect(screen.getAllByTestId("edit-icon")).toHaveLength(1);
  });

  it("renders empty state when there are no participants", () => {
    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={[]}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
      />
    );

    expect(screen.getByText("No participants yet")).toBeInTheDocument();
  });

  it("allows editing the current user name", async () => {
    const user = userEvent.setup();

    render(
      <ParticipantsPanel
        isOpen={true}
        onClose={mockOnClose}
        participants={mockParticipants}
        currentUserId={currentUserId}
        onUpdateName={mockOnUpdateName}
      />
    );

    // Find and click the edit button
    const editButton = screen.getByLabelText("Edit your name");
    await user.click(editButton);

    // Input should appear
    const nameInput = screen.getByRole("textbox");
    expect(nameInput).toBeInTheDocument();

    // Change the name
    await user.clear(nameInput);
    await user.type(nameInput, "New Name");

    // Save the name
    const saveButton = screen.getByLabelText("Save name");
    await user.click(saveButton);

    // Verify onUpdateName was called with correct parameters
    expect(mockOnUpdateName).toHaveBeenCalledWith("current-user", "New Name");
  });
});
