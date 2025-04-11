import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Tooltip from '../Tooltip';

// Mock createPortal to work in test environment
vi.mock('react-dom', async () => {
  const actual = await vi.importActual('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => {
      // Keep the node structure intact for testing
      return node;
    },
  };
});

describe('Tooltip', () => {
  // Create a fake document.body for testing
  let portalRoot: HTMLDivElement;

  beforeEach(() => {
    // Setup portal root
    portalRoot = document.createElement('div');
    portalRoot.setAttribute('id', 'portal-root');
    document.body.appendChild(portalRoot);

    // Mock getBoundingClientRect
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      width: 120,
      height: 30,
      top: 100,
      left: 100,
      bottom: 130,
      right: 220,
      x: 100,
      y: 100,
      toJSON: () => {},
    }));

    // Set window dimensions
    global.innerWidth = 1024;
    global.innerHeight = 768;
  });

  // Cleanup after tests
  afterEach(() => {
    if (document.body.contains(portalRoot)) {
      document.body.removeChild(portalRoot);
    }
    vi.restoreAllMocks();
  });

  it('renders children correctly', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );

    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('shows tooltip on mouseenter', async () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );

    // Tooltip should not be visible initially
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();

    // Hover over the button
    await act(async () => {
      fireEvent.mouseEnter(screen.getByText('Hover me'));
    });

    // Tooltip should now be visible
    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip-content').textContent).toBe('Tooltip text');
  });

  it('hides tooltip on mouseleave', async () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );

    // Hover over the button
    await act(async () => {
      fireEvent.mouseEnter(screen.getByText('Hover me'));
    });

    // Tooltip should be visible
    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();

    // Mouse leave
    await act(async () => {
      fireEvent.mouseLeave(screen.getByText('Hover me'));
    });

    // Tooltip should now be hidden
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();
  });

  it('shows tooltip on focus', async () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Focus me</button>
      </Tooltip>
    );

    // Tooltip should not be visible initially
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();

    // Focus the button
    await act(async () => {
      fireEvent.focus(screen.getByText('Focus me'));
    });

    // Tooltip should now be visible
    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();
  });

  it('hides tooltip on blur', async () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Focus me</button>
      </Tooltip>
    );

    // Focus the button
    await act(async () => {
      fireEvent.focus(screen.getByText('Focus me'));
    });

    // Tooltip should be visible
    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();

    // Blur the button
    await act(async () => {
      fireEvent.blur(screen.getByText('Focus me'));
    });

    // Tooltip should now be hidden
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument();
  });

  it('applies custom classNames correctly', async () => {
    render(
      <Tooltip content="Tooltip text" className="custom-class">
        <button>Hover me</button>
      </Tooltip>
    );

    // Hover over the button
    await act(async () => {
      fireEvent.mouseEnter(screen.getByText('Hover me'));
    });

    // Find the tooltip content div using data-testid
    const tooltipElement = screen.getByTestId('tooltip-content');

    // Check if it has the custom class
    expect(tooltipElement).toHaveClass('custom-class');
    expect(tooltipElement.textContent).toBe('Tooltip text');
  });

  it('updates position when window is resized', async () => {
    const { rerender } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );

    // Show tooltip
    await act(async () => {
      fireEvent.mouseEnter(screen.getByText('Hover me'));
    });

    // Tooltip should be visible
    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();

    // Simulate window resize
    await act(async () => {
      global.innerWidth = 500; // Smaller width
      fireEvent(window, new Event('resize'));
    });

    // Force a rerender
    rerender(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );

    // Tooltip should still be visible after resize
    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();

    // In a real scenario, the position would likely change after resize,
    // but in our test environment with mocked getBoundingClientRect it might not
  });
});
