import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import Simulation from './pages/Simulation';
import Admin from './pages/Admin'; // 🔥 Import the Admin component

function App() {
  return (
    <Router>
      <div>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/simulation" element={<Simulation />} />
          <Route path="/admin" element={<Admin />} /> {/* 🔥 Add the Admin route */}
        </Routes>
      </div>
    </Router>
  );
}

export default App;