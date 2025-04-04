import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

function Rules() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Settings
        </button>

        <h1 className="text-4xl font-bold mb-8">Rules & Regulations</h1>
        <p className="text-xl text-gray-400 mb-8">
          Welcome to the SRM Connect !
          To ensure a safe, respectful, and enjoyable experience for all users, please read and follow the rules below:
        </p>

        <div className="space-y-8">
          {/* Rule 1 */}
          <div className="bg-zinc-900 p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="text-red-500">🚫</span> 1. Respect All Users
            </h2>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>Treat others with kindness and respect.</li>
              <li>Do not use abusive, offensive, or discriminatory language.</li>
              <li>No harassment, bullying, or threats will be tolerated.</li>
            </ul>
          </div>

          {/* Rule 2 */}
          <div className="bg-zinc-900 p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span>🎓</span> 2. SRM Students Only
            </h2>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>This platform is strictly for SRM students.</li>
              <li>Only users with a verified @srmist.edu.in email can register.</li>
            </ul>
          </div>

          {/* Rule 3 */}
          <div className="bg-zinc-900 p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span>🎥</span> 3. Safe Video Chatting
            </h2>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>Use the video feature responsibly.</li>
              <li>No nudity, sexual content, or inappropriate behavior during video chats.</li>
              <li>Always be dressed appropriately and maintain a decent background.</li>
            </ul>
          </div>

          {/* Rule 4 */}
          <div className="bg-zinc-900 p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span>💬</span> 4. No Fake Profiles
            </h2>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>Do not create fake identities or impersonate others.</li>
              <li>All information provided should be real and truthful.</li>
            </ul>
          </div>

          {/* Rule 5 */}
          <div className="bg-zinc-900 p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span>📸</span> 5. Profile Picture Guidelines
            </h2>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>Upload a clear, decent profile photo.</li>
              <li>No offensive or inappropriate images allowed.</li>
            </ul>
          </div>

          {/* Rule 6 */}
          <div className="bg-zinc-900 p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span>⚠️</span> 6. Reporting and Moderation
            </h2>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>Use the Report button to report inappropriate users.</li>
              <li>Repeated violations may lead to temporary or permanent bans.</li>
              <li>Admins reserve the right to take necessary action.</li>
            </ul>
          </div>

          {/* Rule 7 */}
          <div className="bg-zinc-900 p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span>🔒</span> 7. Privacy and Safety
            </h2>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>Do not share your personal information (address, phone number, bank info).</li>
              <li>Conversations are private, but report any suspicious activity immediately.</li>
            </ul>
          </div>

          {/* Rule 8 */}
          <div className="bg-zinc-900 p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span>🧠</span> 8. Be Mindful
            </h2>
            <ul className="list-disc list-inside text-gray-400 space-y-2">
              <li>This platform is meant for making new connections – not for misuse.</li>
              <li>Avoid spamming, advertising, or promoting outside content.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Rules; 