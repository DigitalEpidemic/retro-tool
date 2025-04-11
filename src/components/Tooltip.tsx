import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tooltip component that shows a tooltip on hover
 * @param children The element that will trigger the tooltip
 * @param content The content to display in the tooltip
 * @param className Optional additional classes for tooltip positioning
 */
const Tooltip = ({
  children,
  content,
  className = '',
}: {
  children: React.ReactNode;
  content: string;
  className?: string;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Calculate position when visibility changes or on resize/scroll
  useEffect(() => {
    const calculatePosition = () => {
      if (!isVisible || !triggerRef.current || !tooltipRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();

      // Default position is above the element
      let top = triggerRect.top - tooltipRect.height - 5;
      let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;

      // Check if tooltip would go off the top of the screen
      if (top < 5) {
        // Position below the element
        top = triggerRect.bottom + 5;
      }

      // Check if tooltip would go off the left of the screen
      if (left < 5) {
        left = 5;
      }

      // Check if tooltip would go off the right of the screen
      if (left + tooltipRect.width > window.innerWidth - 5) {
        left = window.innerWidth - tooltipRect.width - 5;
      }

      setPosition({ top, left });
    };

    // Calculate position when tooltip becomes visible
    if (isVisible) {
      calculatePosition();

      // Recalculate on scroll or resize
      window.addEventListener('scroll', calculatePosition, true);
      window.addEventListener('resize', calculatePosition);

      return () => {
        window.removeEventListener('scroll', calculatePosition, true);
        window.removeEventListener('resize', calculatePosition);
      };
    }
  }, [isVisible]);

  return (
    <div
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            className={`fixed z-[1000] px-2 py-1 text-xs font-medium text-white bg-gray-800 rounded shadow-sm whitespace-nowrap ${className}`}
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
            }}
            data-testid="tooltip-content"
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  );
};

export default Tooltip;
