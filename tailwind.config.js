/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Scan all relevant files in src
  ],
  theme: {
    extend: {
      screens: {
        'xs': '375px', // Add extra small breakpoint for very small devices
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      spacing: {
        '18': '4.5rem', // Additional spacing options that might be useful
        '72': '18rem',
        '84': '21rem',
        '96': '24rem',
      },
      borderRadius: {
        'xs': '2px', // Smaller border radius for subtle rounded corners
      },
      fontSize: {
        'xxs': '0.625rem', // Extra small text size for tight spaces on mobile
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.05)', // Subtle shadow for mobile UI
        'touch': '0 0 0 4px rgba(59, 130, 246, 0.3)', // Touch feedback shadow
      },
      zIndex: {
        '60': 60,
        '70': 70,
      },
      transitionDuration: {
        '250': '250ms', // Custom transition durations for smoother mobile animations
      },
      height: {
        'dvh': '100dvh', // Dynamic viewport height accounts for iOS Safari/Chrome bars
      },
      minHeight: {
        'dvh': '100dvh', // Dynamic viewport height for min-height
      },
      maxHeight: {
        'dvh': '100dvh', // Dynamic viewport height for max-height
      }
    },
  },
  plugins: [],
};
