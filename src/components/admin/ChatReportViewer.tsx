import React, { useState, useEffect, useRef } from 'react';
import socketIO from 'socket.io-client';
import { Shield, AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

// Choose Socket.IO server based on environment
const SOCKET_URL =
  import.meta.env.MODE === 'production'
    ? 'https://srm-connect-socketio.onrender.com'
    : (import.meta.env.VITE_SOCKET_URL || 'http://localhost:3002');

interface ChatReport {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: string;
  description?: string;
  timestamp: string;
  chatTranscript?: any[];
  status: 'pending' | 'reviewed' | 'ignored' | 'warning_issued' | 'user_banned';
  adminNotes?: string;
  reviewedAt?: string;
}

interface ChatReportViewerProps {
  canManage: boolean;
  updateCount?: (count: number) => void;
}

const ChatReportViewer: React.FC<ChatReportViewerProps> = ({ canManage, updateCount }) => {
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<ChatReport | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const socketRef = useRef<any>(null);

  useEffect(() => {
    // Connect to Socket.IO server
    socketRef.current = socketIO(SOCKET_URL, {
      transports: ['polling', 'websocket']
    });

    // Set up event listeners
    socketRef.current.on('connect', () => {
      console.log('Connected to Socket.IO server for admin reports');
      fetchReports();
    });

    socketRef.current.on('admin_reports', (data: ChatReport[]) => {
      console.log('Received reports:', data);
      setReports(data);
      setLoading(false);
      
      // Update the parent component with the count of pending reports
      if (updateCount) {
        const pendingReports = data.filter(report => report.status === 'pending').length;
        updateCount(pendingReports);
      }
    });

    socketRef.current.on('admin_report_updated', (response: any) => {
      if (response.success) {
        // Refresh reports after update
        fetchReports();
        setActionInProgress(false);
        setSelectedReport(null);
      } else {
        setError(response.error || 'Failed to update report');
        setActionInProgress(false);
      }
    });

    socketRef.current.on('connect_error', (err: any) => {
      console.error('Socket.IO connection error:', err);
      setError('Failed to connect to the server. Please try again later.');
      setLoading(false);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const fetchReports = () => {
    setLoading(true);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('admin_get_reports');
    } else {
      setError('Not connected to server');
      setLoading(false);
    }
  };

  const handleReportAction = (reportId: string, status: string) => {
    setActionInProgress(true);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('admin_update_report', {
        reportId,
        status,
        adminNotes: adminNotes.trim() || undefined
      });
    } else {
      setError('Not connected to server');
      setActionInProgress(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const filteredReports = filterStatus === 'all'
    ? reports
    : reports.filter(report => report.status === filterStatus);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center">
          <Shield className="mr-2" size={20} />
          Instant Chat Reports
        </h2>
        <div className="flex items-center space-x-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
          >
            <option value="all">All Reports</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="ignored">Ignored</option>
            <option value="warning_issued">Warning Issued</option>
            <option value="user_banned">User Banned</option>
          </select>
          <button
            onClick={fetchReports}
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-full"
            title="Refresh reports"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900 bg-opacity-20 border border-red-800 rounded-lg p-4 text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No reports found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredReports.map((report) => (
            <div
              key={report.id}
              className={`bg-gray-800 rounded-lg p-4 cursor-pointer transition-colors hover:bg-gray-750 ${
                selectedReport?.id === report.id ? 'ring-2 ring-indigo-500' : ''
              }`}
              onClick={() => {
                setSelectedReport(report);
                setAdminNotes(report.adminNotes || '');
              }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      report.status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                      report.status === 'reviewed' ? 'bg-blue-900 text-blue-300' :
                      report.status === 'ignored' ? 'bg-gray-700 text-gray-300' :
                      report.status === 'warning_issued' ? 'bg-orange-900 text-orange-300' :
                      'bg-red-900 text-red-300'
                    }`}>
                      {report.status.replace('_', ' ')}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {formatDate(report.timestamp)}
                    </span>
                  </div>
                  <h3 className="font-medium mt-1">Reason: {report.reason}</h3>
                  <div className="mt-2 text-sm">
                    <div><span className="text-gray-400">Reporter ID:</span> {report.reporterId}</div>
                    <div><span className="text-gray-400">Reported User ID:</span> {report.reportedUserId}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Report Details</h3>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1 hover:bg-gray-800 rounded-full"
              >
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <h5 className="text-sm font-medium text-gray-400 mb-2">Reporter</h5>
                <div className="bg-gray-800 rounded p-4">
                  <div className="text-sm">
                    <div className="text-xs text-gray-500">User ID</div>
                    <div>{selectedReport.reporterId}</div>
                  </div>
                </div>
              </div>
              
              <div>
                <h5 className="text-sm font-medium text-gray-400 mb-2">Reported User</h5>
                <div className="bg-gray-800 rounded p-4">
                  <div className="text-sm">
                    <div className="text-xs text-gray-500">User ID</div>
                    <div>{selectedReport.reportedUserId}</div>
                  </div>
                </div>
              </div>
              
              <div>
                <h5 className="text-sm font-medium text-gray-400 mb-2">Report Details</h5>
                <div className="bg-gray-800 rounded p-4">
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">Report ID</div>
                    <div className="text-sm">{selectedReport.id}</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">Submitted At</div>
                    <div className="text-sm">{formatDate(selectedReport.timestamp)}</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">Current Status</div>
                    <div className="text-sm">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                        ${selectedReport.status === 'pending' ? 'bg-yellow-900 text-yellow-300' : 
                          selectedReport.status === 'reviewed' ? 'bg-blue-900 text-blue-300' : 
                          selectedReport.status === 'ignored' ? 'bg-gray-700 text-gray-300' : 
                          selectedReport.status === 'warning_issued' ? 'bg-orange-900 text-orange-300' :
                          'bg-red-900 text-red-300'}`}
                      >
                        {selectedReport.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Reason</div>
                    <div className="text-sm bg-gray-900 p-3 rounded mt-1">{selectedReport.reason}</div>
                  </div>
                  {selectedReport.description && (
                    <div className="mt-3">
                      <div className="text-xs text-gray-500">Description</div>
                      <div className="text-sm bg-gray-900 p-3 rounded mt-1">{selectedReport.description}</div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="md:col-span-2">
                <div className="flex justify-between items-center mb-2">
                  <h5 className="text-sm font-medium text-gray-400">Chat Transcript</h5>
                  <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
                  </button>
                </div>
                
                {showTranscript && (
                  <div className="bg-gray-800 rounded-lg p-4 max-h-[300px] overflow-y-auto">
                    {selectedReport.chatTranscript && selectedReport.chatTranscript.length > 0 ? (
                      <div className="space-y-4">
                        {selectedReport.chatTranscript.map((message: any, index: number) => (
                          <div 
                            key={index} 
                            className={`flex ${message.senderId === selectedReport.reportedUserId ? 'justify-end' : 'justify-start'}`}
                          >
                            <div 
                              className={`max-w-[70%] rounded-lg px-4 py-2 ${
                                message.senderId === selectedReport.reportedUserId ? 'bg-red-900/50' : 'bg-gray-700'
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">{message.content}</p>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-gray-400">
                                  {message.senderId === selectedReport.reportedUserId ? 'Reported User' : 'Reporter'}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {new Date(message.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-400">No transcript available</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {canManage && (
              <div className="mb-6">
                <h5 className="text-sm font-medium text-gray-400 mb-2">Admin Notes</h5>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add notes about this report..."
                  className="w-full p-3 rounded bg-gray-800 border border-gray-700 text-white"
                  rows={4}
                />
              </div>
            )}
            
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-800">
              {canManage && selectedReport.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleReportAction(selectedReport.id, 'reviewed')}
                    className="px-4 py-2 bg-blue-800 hover:bg-blue-700 rounded flex items-center"
                    disabled={actionInProgress}
                  >
                    <CheckCircle size={16} className="mr-2" />
                    {actionInProgress ? 'Processing...' : 'Mark as Reviewed'}
                  </button>
                  
                  <button
                    onClick={() => handleReportAction(selectedReport.id, 'ignored')}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center"
                    disabled={actionInProgress}
                  >
                    <XCircle size={16} className="mr-2" />
                    {actionInProgress ? 'Processing...' : 'Ignore Report'}
                  </button>
                  
                  <button
                    onClick={() => handleReportAction(selectedReport.id, 'warning_issued')}
                    className="px-4 py-2 bg-orange-800 hover:bg-orange-700 rounded flex items-center"
                    disabled={actionInProgress}
                  >
                    <AlertTriangle size={16} className="mr-2" />
                    {actionInProgress ? 'Processing...' : 'Issue Warning'}
                  </button>
                  
                  <button
                    onClick={() => handleReportAction(selectedReport.id, 'user_banned')}
                    className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded flex items-center"
                    disabled={actionInProgress}
                  >
                    <Shield size={16} className="mr-2" />
                    {actionInProgress ? 'Processing...' : 'Ban User'}
                  </button>
                </>
              )}
              {!canManage && (
                <div className="text-gray-400 text-sm italic">
                  You don't have permission to take action on reports.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatReportViewer;
