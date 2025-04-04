import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Profile from './pages/Profile';
import VideoChat from './pages/VideoChat';
import Messages from './pages/Messages';
import Settings from './pages/Settings';
import Rules from './pages/Rules';

// 404 Page Component
const NotFound = () => (
  <div className="min-h-screen bg-black text-white flex items-center justify-center flex-col">
    <h1 className="text-4xl mb-4">404 - Page Not Found</h1>
    <p className="mb-4">The page you're looking for doesn't exist.</p>
    <a href="/dashboard" className="text-blue-500 hover:text-blue-400">
      Return to Dashboard
    </a>
  </div>
);

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-black text-white">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/video-chat" element={<VideoChat />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;