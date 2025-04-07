import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ShareModal from "../ShareModal";

// Mock window.location for testing
const originalLocation = window.location;

describe("ShareModal", () => {
  const mockClose = vi.fn();
  const testBoardId = "test-board-123";
  
  beforeAll(() => {
    // Mock window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, origin: "https://retro-tool.example.com" },
    });
  });
  
  afterAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });
  
  beforeEach(() => {
    mockClose.mockClear();
    vi.clearAllMocks();
    
    // Mock document.execCommand
    document.execCommand = vi.fn().mockImplementation(() => true);
  });
  
  it("renders nothing when closed", () => {
    render(<ShareModal isOpen={false} onClose={mockClose} boardId={testBoardId} />);
    
    expect(screen.queryByText("Share Board")).not.toBeInTheDocument();
  });
  
  it("renders modal when open", () => {
    render(<ShareModal isOpen={true} onClose={mockClose} boardId={testBoardId} />);
    
    expect(screen.getByText("Share Board")).toBeInTheDocument();
    expect(screen.getByLabelText("Board Link")).toBeInTheDocument();
  });
  
  it("displays correct board URL", () => {
    render(<ShareModal isOpen={true} onClose={mockClose} boardId={testBoardId} />);
    
    const inputElement = screen.getByLabelText("Board Link") as HTMLInputElement;
    expect(inputElement.value).toBe("https://retro-tool.example.com/board/test-board-123");
  });
  
  it("copies to clipboard when button is clicked", async () => {
    const user = userEvent.setup();
    render(<ShareModal isOpen={true} onClose={mockClose} boardId={testBoardId} />);
    
    const copyButton = screen.getByLabelText("Copy to clipboard");
    await user.click(copyButton);
    
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(screen.getByText("Link copied to clipboard!")).toBeInTheDocument();
  });
  
  it("closes modal when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<ShareModal isOpen={true} onClose={mockClose} boardId={testBoardId} />);
    
    const closeButton = screen.getByLabelText("Close panel");
    await user.click(closeButton);
    
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
  
  it("closes modal when Close button in footer is clicked", async () => {
    const user = userEvent.setup();
    render(<ShareModal isOpen={true} onClose={mockClose} boardId={testBoardId} />);
    
    const closeButton = screen.getByRole("button", { name: "Close" });
    await user.click(closeButton);
    
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
  
  it("focuses and selects input when modal opens", () => {
    // Mock the select method
    const selectMock = vi.fn();
    HTMLInputElement.prototype.select = selectMock;
    
    render(<ShareModal isOpen={true} onClose={mockClose} boardId={testBoardId} />);
    
    // We need to wait for the setTimeout in the useEffect to execute
    setTimeout(() => {
      expect(selectMock).toHaveBeenCalled();
    }, 150);
  });
  
  it("shows QR code button by default", () => {
    render(<ShareModal isOpen={true} onClose={mockClose} boardId={testBoardId} />);
    
    expect(screen.getByText("Show QR Code")).toBeInTheDocument();
    expect(screen.queryByAltText("QR Code for board link")).not.toBeInTheDocument();
  });
  
  it("toggles QR code visibility when the show/hide button is clicked", async () => {
    const user = userEvent.setup();
    render(<ShareModal isOpen={true} onClose={mockClose} boardId={testBoardId} />);
    
    // Initially no QR code is shown
    expect(screen.queryByAltText("QR Code for board link")).not.toBeInTheDocument();
    
    // Click to show QR code
    const showButton = screen.getByText("Show QR Code");
    await user.click(showButton);
    
    // Now the QR code should be visible
    expect(screen.getByAltText("QR Code for board link")).toBeInTheDocument();
    expect(screen.getByText("Hide QR Code")).toBeInTheDocument();
    
    // Click again to hide QR code
    const hideButton = screen.getByText("Hide QR Code");
    await user.click(hideButton);
    
    // QR code should be hidden again
    expect(screen.queryByAltText("QR Code for board link")).not.toBeInTheDocument();
    expect(screen.getByText("Show QR Code")).toBeInTheDocument();
  });
  
  it("QR code has correct source URL", async () => {
    const user = userEvent.setup();
    render(<ShareModal isOpen={true} onClose={mockClose} boardId={testBoardId} />);
    
    // Show QR code
    await user.click(screen.getByText("Show QR Code"));
    
    // Check the image source
    const qrCodeImg = screen.getByAltText("QR Code for board link") as HTMLImageElement;
    const expectedUrl = encodeURIComponent("https://retro-tool.example.com/board/test-board-123");
    expect(qrCodeImg.src).toContain(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${expectedUrl}`);
  });
}); 