import { useState } from "react";
import DashboardPage from "./pages/DashboardPage";
import LandingPage from "./pages/LandingPage";

export default function App() {
  const [entered, setEntered] = useState(false);
  if (!entered) {
    return <LandingPage onEnter={() => setEntered(true)} />;
  }
  return <DashboardPage />;
}
