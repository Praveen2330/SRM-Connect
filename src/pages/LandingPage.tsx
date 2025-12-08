import { Link } from 'react-router-dom';
import { Camera, Heart, MessageCircle, Shield } from 'lucide-react';
import logo from "../assets/srm-connect-logo.png";

function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-12">
        <header className="text-center mb-16">
          <div className="flex items-center justify-center gap-4">
            <img src={logo} alt="SRM Connect Logo" className="w-12 h-12" />
            <h1 className="text-6xl font-bold">SRM Connect</h1>
          </div>
          <p className="text-xl text-gray-400">Meet amazing people from your college</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8 mb-16">
          <div className="bg-zinc-900 p-8 rounded-xl">
            <Camera className="w-12 h-12 mb-4 mx-auto" />
            <h2 className="text-2xl font-bold mb-2 text-center">Video Chat</h2>
            <p className="text-gray-400 text-center">Connect face-to-face with real-time video calls</p>
          </div>

          <div className="bg-zinc-900 p-8 rounded-xl">
            <Heart className="w-12 h-12 mb-4 mx-auto" />
            <h2 className="text-2xl font-bold mb-2 text-center">Smart Matching</h2>
            <p className="text-gray-400 text-center">Find compatible matches based on your interests</p>
          </div>

          <div className="bg-zinc-900 p-8 rounded-xl">
            <MessageCircle className="w-12 h-12 mb-4 mx-auto" />
            <h2 className="text-2xl font-bold mb-2 text-center">Instant Chat</h2>
            <p className="text-gray-400 text-center">Real-time messaging with your matches</p>
          </div>

          <div className="bg-zinc-900 p-8 rounded-xl">
            <Shield className="w-12 h-12 mb-4 mx-auto" />
            <h2 className="text-2xl font-bold mb-2 text-center">Safe & Secure</h2>
            <p className="text-gray-400 text-center">Verified SRM students only with strict moderation</p>
          </div>
        </div>

        <div className="text-center">
          <Link
            to="/login"
            className="bg-white text-black px-8 py-4 rounded-full font-bold text-lg hover:bg-gray-200 transition-colors"
          >
            Get Started with SRM Email
          </Link>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;