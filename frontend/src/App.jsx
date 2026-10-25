import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import LMSPage from './pages/LMSPage';
import InstructorLMSPage from './pages/InstructorLMSPage';
import Simulation from './pages/Simulation';
import Admin from './pages/Admin'; // 🔥 Import the Admin component
import InstructorQuizBuilder from './pages/InstructorQuizBuilder';
import StudentExamTaker from './pages/StudentExamTaker';

function App() {
  return (
    <Router>
      <div>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route element={<Dashboard />}>
            <Route path="/dashboard" element={<></>} />
            <Route path="/lms" element={<LMSPage />} />
            <Route path="/lms/instructor" element={<InstructorLMSPage />} />
          </Route>
          <Route path="/simulation" element={<Simulation />} />
          <Route path="/admin" element={<Admin />} /> {/* 🔥 Add the Admin route */}
          <Route path="/lms/instructor/quiz-builder" element={<InstructorQuizBuilder />} />
          <Route path="/lms/exam/:examId" element={<StudentExamTaker />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;