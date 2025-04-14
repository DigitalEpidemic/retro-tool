import { Clipboard, Copy, Link, QrCode, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  boardId: string;
}

export default function ShareModal({ isOpen, onClose, boardId }: ShareModalProps) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const boardUrl = `${window.location.origin}/board/${boardId}`;

  // Handle copying to clipboard
  const handleCopyToClipboard = () => {
    if (linkInputRef.current) {
      linkInputRef.current.select();
      document.execCommand('copy');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  // Toggle QR code display
  const toggleQrCode = () => {
    setShowQrCode(!showQrCode);
  };

  // Generate QR code URL using a third-party API
  const getQrCodeUrl = (url: string) => {
    // Using QR Server API which doesn't require authentication
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
      url
    )}`;
  };

  // Focus the input field when the modal opens
  useEffect(() => {
    if (isOpen && linkInputRef.current) {
      setTimeout(() => {
        linkInputRef.current?.select();
      }, 100);
    }
  }, [isOpen]);

  // Add an effect to prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-gray-500/30 p-2 sm:p-4"
      onClick={e => {
        // Close modal when clicking outside the modal content
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center border-b border-gray-200 p-4">
          <h2 className="text-xl font-semibold text-gray-800">Share Board</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 active:text-gray-900 cursor-pointer p-2 -mr-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors duration-300 touch-feedback"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto">
          <label htmlFor="board-link" className="block text-sm font-medium text-gray-700 mb-2">
            Board Link
          </label>
          <div className="flex items-center space-x-2 mb-4">
            <div className="relative flex-grow">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Link className="h-4 w-4 text-gray-400" />
              </div>
              <input
                ref={linkInputRef}
                id="board-link"
                type="text"
                value={boardUrl}
                readOnly
                className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleCopyToClipboard}
              className="flex items-center justify-center p-2.5 bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[40px] min-h-[40px] transition-colors duration-300 touch-feedback"
              aria-label="Copy to clipboard"
            >
              <Copy className="h-5 w-5" />
            </button>
          </div>

          {copySuccess && (
            <div className="flex items-center text-green-600 text-sm mb-4">
              <Clipboard className="h-4 w-4 mr-1" />
              <span>Link copied to clipboard!</span>
            </div>
          )}

          <div className="mt-5">
            <button
              onClick={toggleQrCode}
              className="flex items-center text-sm text-blue-600 hover:text-blue-800 active:text-blue-900 cursor-pointer py-2 px-1 rounded hover:bg-blue-50 active:bg-blue-100 transition-colors duration-300 touch-feedback"
            >
              <QrCode className="h-5 w-5 mr-1.5" />
              <span className="font-medium">{showQrCode ? 'Hide QR Code' : 'Show QR Code'}</span>
            </button>

            {showQrCode && (
              <div className="mt-4 flex justify-center border border-gray-200 rounded-md p-4 bg-gray-50">
                <img
                  src={getQrCodeUrl(boardUrl)}
                  alt="QR Code for board link"
                  className="w-56 h-56 max-w-full"
                />
              </div>
            )}
          </div>

          <p className="text-sm text-gray-600 mt-5">
            Share this link with your team members to collaborate on this retrospective board.
            {showQrCode && ' Mobile users can scan the QR code to join instantly.'}
          </p>
        </div>
      </div>
    </div>
  );
}
