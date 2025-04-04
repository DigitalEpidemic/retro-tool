import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "./App"; // The component we're testing

// Mock the Board component since we only want to test routing logic in App.tsx
vi.mock("./components/Board", () => ({
  // Default export needs to be handled this way with vi.mock
  default: () => <div data-testid="mock-board">Mock Board Component</div>,
}));

describe("App Routing", () => {
  it('renders the Home component for the root path "/"', () => {
    // Render the App component wrapped in MemoryRouter, starting at the root path
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );

    // Check if the welcome text from the Home component is present
    expect(
      screen.getByText(/Welcome to the Retrospective Board/i)
    ).toBeInTheDocument();
    // Check if the link suggestion is present
    expect(
      screen.getByText(/navigate to a specific board URL/i)
    ).toBeInTheDocument();
  });

  it('renders the Board component for the "/board/:boardId" path', () => {
    const testBoardId = "test-board-123";
    // Render the App component, navigating to a specific board route
    render(
      <MemoryRouter initialEntries={[`/board/${testBoardId}`]}>
        <App />
      </MemoryRouter>
    );

    // Check if the mocked Board component's content is rendered
    expect(screen.getByTestId("mock-board")).toBeInTheDocument();
    expect(screen.getByText("Mock Board Component")).toBeInTheDocument();
  });

  it("renders the Not Found page for an unknown route", () => {
    // Render the App component, navigating to a route that doesn't exist
    render(
      <MemoryRouter initialEntries={["/some/random/path/that/does/not/exist"]}>
        <App />
      </MemoryRouter>
    );

    // Check if the "Page Not Found" text is displayed
    expect(screen.getByText(/Page Not Found/i)).toBeInTheDocument();
  });
});
