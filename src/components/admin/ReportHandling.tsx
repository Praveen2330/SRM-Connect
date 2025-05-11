import React, { useState } from 'react';
import ChatReportViewer from './ChatReportViewer';
import VideoChatReportViewer from './VideoChatReportViewer';
import { MessageCircle, Video, Shield, AlertCircle } from 'lucide-react';

interface ReportHandlingProps {
  canManage: boolean;
}

type ReportTab = 'video' | 'chat' | 'all';

const ReportHandling: React.FC<ReportHandlingProps> = ({ canManage }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('all');
  const [reportCounts, setReportCounts] = useState({
    video: 0,
    chat: 0
  });

  // Function to update report counts (can be called by child components)
  const updateReportCount = (type: 'video' | 'chat', count: number) => {
    setReportCounts(prev => ({
      ...prev,
      [type]: count
    }));
  };

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2 flex items-center">
          <Shield className="mr-2" size={24} />
          Platform Reports
        </h1>
        <p className="text-gray-400">
          Monitor and manage user reports across different platform features.
        </p>
      </div>

      <div className="flex border-b border-gray-800 mb-6">
        <button
          className={`px-4 py-2 flex items-center ${activeTab === 'all' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-gray-400 hover:text-white'}`}
          onClick={() => setActiveTab('all')}
        >
          <AlertCircle className="mr-2" size={16} />
          All Reports
        </button>
        <button
          className={`px-4 py-2 flex items-center ${activeTab === 'video' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-gray-400 hover:text-white'}`}
          onClick={() => setActiveTab('video')}
        >
          <Video className="mr-2" size={16} />
          Video Chat
          {reportCounts.video > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-red-900 text-red-200 rounded-full">
              {reportCounts.video}
            </span>
          )}
        </button>
        <button
          className={`px-4 py-2 flex items-center ${activeTab === 'chat' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-gray-400 hover:text-white'}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageCircle className="mr-2" size={16} />
          Instant Chat
          {reportCounts.chat > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-red-900 text-red-200 rounded-full">
              {reportCounts.chat}
            </span>
          )}
        </button>
      </div>
      
      {(activeTab === 'video' || activeTab === 'all') && (
        <div className={activeTab === 'all' ? 'mb-10' : ''}>
          {activeTab === 'all' && (
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <Video className="mr-2" size={20} />
              Video Chat Reports
            </h2>
          )}
          <VideoChatReportViewer 
            canManage={canManage} 
            updateCount={(count) => updateReportCount('video', count)}
            showFilters={true}
          />
        </div>
      )}
      
      {(activeTab === 'chat' || activeTab === 'all') && (
        <div>
          {activeTab === 'all' && (
            <h2 className="text-xl font-semibold mb-4 flex items-center">
              <MessageCircle className="mr-2" size={20} />
              Instant Chat Reports
            </h2>
          )}
          <ChatReportViewer 
            canManage={canManage} 
            updateCount={(count) => updateReportCount('chat', count)}
          />
        </div>
      )}
    </div>
  );
};

export default ReportHandling;
