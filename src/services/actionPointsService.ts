import { nanoid } from "nanoid";
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "./firebase";
import { ActionPoint } from "../components/ActionPointsPanel";

/**
 * Add a new action point to a board
 */
export const addActionPoint = async (
  boardId: string,
  text: string,
): Promise<ActionPoint> => {
  // Create a new action point object
  const newActionPoint: ActionPoint = {
    id: nanoid(),
    text,
    completed: false,
  };

  // Get reference to board document
  const boardRef = doc(db, "boards", boardId);

  try {
    // First check if the board exists
    const boardSnap = await getDoc(boardRef);
    
    if (!boardSnap.exists()) {
      throw new Error(`Board with ID ${boardId} does not exist`);
    }

    // Get the current action points
    const boardData = boardSnap.data();
    const currentActionPoints = boardData.actionPoints || [];
    
    // Add the new action point to the array
    const updatedActionPoints = [...currentActionPoints, newActionPoint];
    
    // Update the document with the new array
    await updateDoc(boardRef, {
      actionPoints: updatedActionPoints,
    });

    return newActionPoint;
  } catch (error) {
    console.error("Error adding action point:", error);
    throw error;
  }
};

/**
 * Toggle the completed status of an action point
 */
export const toggleActionPoint = async (
  boardId: string,
  actionPointId: string
): Promise<void> => {
  // Get reference to board document
  const boardRef = doc(db, "boards", boardId);

  try {
    // Get the current board data
    const boardSnap = await getDoc(boardRef);
    
    if (!boardSnap.exists()) {
      throw new Error(`Board with ID ${boardId} does not exist`);
    }

    const boardData = boardSnap.data();
    const actionPoints = boardData.actionPoints || [];
    
    // Find the action point to toggle
    const actionPointIndex = actionPoints.findIndex(
      (ap: ActionPoint) => ap.id === actionPointId
    );
    
    if (actionPointIndex === -1) {
      throw new Error(`Action point with ID ${actionPointId} not found`);
    }
    
    // Create a copy of the action points array
    const updatedActionPoints = [...actionPoints];
    
    // Toggle the completed status
    updatedActionPoints[actionPointIndex] = {
      ...updatedActionPoints[actionPointIndex],
      completed: !updatedActionPoints[actionPointIndex].completed,
    };
    
    // Update the action points in Firestore
    await updateDoc(boardRef, {
      actionPoints: updatedActionPoints,
    });
  } catch (error) {
    console.error("Error toggling action point:", error);
    throw error;
  }
};

/**
 * Delete an action point
 */
export const deleteActionPoint = async (
  boardId: string,
  actionPointId: string
): Promise<void> => {
  // Get reference to board document
  const boardRef = doc(db, "boards", boardId);

  try {
    // Get the current board data
    const boardSnap = await getDoc(boardRef);
    
    if (!boardSnap.exists()) {
      throw new Error(`Board with ID ${boardId} does not exist`);
    }

    const boardData = boardSnap.data();
    const actionPoints = boardData.actionPoints || [];
    
    // Find the action point to delete
    const actionPointToDelete = actionPoints.find(
      (ap: ActionPoint) => ap.id === actionPointId
    );
    
    if (!actionPointToDelete) {
      throw new Error(`Action point with ID ${actionPointId} not found`);
    }
    
    // Remove the action point from the array
    await updateDoc(boardRef, {
      actionPoints: arrayRemove(actionPointToDelete),
    });
  } catch (error) {
    console.error("Error deleting action point:", error);
    throw error;
  }
};

/**
 * Get all action points for a board
 */
export const getActionPoints = async (
  boardId: string
): Promise<ActionPoint[]> => {
  // Get reference to board document
  const boardRef = doc(db, "boards", boardId);

  try {
    // Get the board data
    const boardSnap = await getDoc(boardRef);
    
    if (!boardSnap.exists()) {
      throw new Error(`Board with ID ${boardId} does not exist`);
    }

    const boardData = boardSnap.data();
    
    // Return the action points array, or an empty array if none exist
    return boardData.actionPoints || [];
  } catch (error) {
    console.error("Error getting action points:", error);
    throw error;
  }
}; 