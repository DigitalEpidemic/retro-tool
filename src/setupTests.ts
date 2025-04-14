import type { DropResult } from '@hello-pangea/dnd';
import '@testing-library/jest-dom';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

// Configure React Testing Library
configure({
  asyncUtilTimeout: 5000, // Increase timeout for async operations
});

// Extend Vitest's expect method with methods from react-testing-library
expect.extend(matchers);

// Run cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});

// Mock IntersectionObserver which is not available in the test environment
class IntersectionObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock,
});

// Mock ResizeObserver which is not available in the test environment
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserverMock,
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    // Simulate desktop view to ensure only one set of controls is visible during tests
    matches: query.includes('(min-width:') || !query.includes('max-width:'),
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Set up the global mock for @hello-pangea/dnd
// This tells Vitest to use our mock implementation for all tests
vi.mock('@hello-pangea/dnd', async () => {
  // Import the mock implementation
  const actual = await import('./test/mocks/@hello-pangea/dnd');
  return actual;
});

// Disable DnD development warnings
window['__react-beautiful-dnd-disable-dev-warnings'] = true;

// Suppress console errors during tests
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  // Ignore certain errors that are expected in test environment
  const ignoredErrors = [
    'Error: Not implemented: navigation',
    'Warning: ReactDOM.render is no longer supported',
    // Add DnD related warnings here if needed
    'Unable to find draggable with id',
    'Invariant failed: Draggable',
  ];

  if (!args.some(arg => ignoredErrors.some(ignored => String(arg).includes(ignored)))) {
    originalConsoleError(...args);
  }
};

// Global type declaration for drag and drop testing
declare global {
  interface Window {
    capturedOnDragEnd: ((result: DropResult) => void) | null;
    '__react-beautiful-dnd-disable-dev-warnings': boolean;
  }
}
