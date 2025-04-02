import { Routes, Route, Link } from "react-router-dom"; // Import routing components
import Board from "./components/Board";
import "./App.css";
import "./index.css";

// A simple component for the root path
function Home() {
  return (
    <div className="p-4 text-center">
      <h1 className="text-xl mb-4">Welcome to the Retrospective Board</h1>
      <p>
        You need to navigate to a specific board URL, e.g.,{" "}
        <Link to="/board/test-board" className="text-blue-600 hover:underline">
          /board/test-board
        </Link>
      </p>
      {/* In a real app, you might list boards or have a create button here */}
    </div>
  );
}

function App() {
  return (
    <div className="h-screen">
      <main className="h-full">
        <Routes>
          <Route path="/" element={<Home />} /> {/* Root path */}
          <Route path="/board/:boardId" element={<Board />} />{" "}
          {/* Route for specific boards */}
          {/* Add other routes as needed, e.g., a 404 page */}
          <Route
            path="*"
            element={
              <div className="p-4 text-center text-red-500">Page Not Found</div>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
