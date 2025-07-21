import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

interface VideoChatReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  reported_at: string;
  status: 'pending' | 'in_review' | 'resolved' | 'dismissed';
  reporter?: {
    email?: string;
    display_name?: string;
  };
  reported_user?: {
    email?: string;
    display_name?: string;
  };
}

interface VideoChatReportViewerProps {
  canManage: boolean;
  updateCount?: (count: number) => void;
  showFilters?: boolean;
}

const VideoChatReportViewer: React.FC<VideoChatReportViewerProps> = ({ canManage, updateCount, showFilters = true }) => {
  const [reports, setReports] = useState<VideoChatReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<VideoChatReport | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    fetchReports();
  }, [filterStatus]);
  
  // Update the parent component with the count of pending reports
  useEffect(() => {
    if (updateCount) {
      const pendingReports = reports.filter(report => report.status === 'pending').length;
      updateCount(pendingReports);
    }
  }, [reports, updateCount]);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    
    try {
      let query = supabase
        .from('user_reports')
        .select(`
          *,
          reporter:reporter_id(email, display_name),
          reported_user:reported_user_id(email, display_name)
        `);
      
      // Apply status filter if not 'all'
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }
      
      // Order by most recent first
      query = query.order('reported_at', { ascending: false });
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      setReports(data || []);
    } catch (err) {
      console.error('Error fetching video chat reports:', err);
      setError('Failed to load reports. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReportAction = async (reportId: string, status: 'in_review' | 'resolved' | 'dismissed') => {
    if (!canManage) return;
    
    setActionInProgress(true);
    try {
      const updates = {
        status,
        admin_notes: adminNotes.trim() || null,
        reviewed_at: new Date().toISOString()
      };
      
      const { error } = await supabase
        .from('user_reports')
        .update(updates)
        .eq('id', reportId);
      
      if (error) throw error;
      
      // Refresh reports after successful update
      fetchReports();
      setSelectedReport(null);
    } catch (err) {
      console.error('Error updating report:', err);
      setError('Failed to update report. Please try again.');
    } finally {
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
          Video Chat Reports
        </h2>
        <div className="flex items-center space-x-2">
          {showFilters && (
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
            >
              <option value="all">All Reports</option>
              <option value="pending">Pending</option>
              <option value="in_review">In Review</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          )}
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
                setAdminNotes('');
              }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      report.status === 'pending' ? 'bg-yellow-900 text-yellow-300' :
                      report.status === 'in_review' ? 'bg-blue-900 text-blue-300' :
                      report.status === 'resolved' ? 'bg-green-900 text-green-300' :
                      'bg-gray-700 text-gray-300'
                    }`}>
                      {report.status.replace('_', ' ')}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {formatDate(report.reported_at)}
                    </span>
                  </div>
                  <h3 className="font-medium mt-1">Reason: {report.reason}</h3>
                  <div className="mt-2 text-sm">
                    <div><span className="text-gray-400">Reporter:</span> {report.reporter?.display_name || report.reporter?.email || report.reporter_id}</div>
                    <div><span className="text-gray-400">Reported User:</span> {report.reported_user?.display_name || report.reported_user?.email || report.reported_user_id}</div>
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
                    <div>{selectedReport.reporter_id}</div>
                  </div>
                  {selectedReport.reporter && (
                    <>
                      {selectedReport.reporter.email && (
                        <div className="mt-2 text-sm">
                          <div className="text-xs text-gray-500">Email</div>
                          <div>{selectedReport.reporter.email}</div>
                        </div>
                      )}
                      {selectedReport.reporter.display_name && (
                        <div className="mt-2 text-sm">
                          <div className="text-xs text-gray-500">Display Name</div>
                          <div>{selectedReport.reporter.display_name}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              <div>
                <h5 className="text-sm font-medium text-gray-400 mb-2">Reported User</h5>
                <div className="bg-gray-800 rounded p-4">
                  <div className="text-sm">
                    <div className="text-xs text-gray-500">User ID</div>
                    <div>{selectedReport.reported_user_id}</div>
                  </div>
                  {selectedReport.reported_user && (
                    <>
                      {selectedReport.reported_user.email && (
                        <div className="mt-2 text-sm">
                          <div className="text-xs text-gray-500">Email</div>
                          <div>{selectedReport.reported_user.email}</div>
                        </div>
                      )}
                      {selectedReport.reported_user.display_name && (
                        <div className="mt-2 text-sm">
                          <div className="text-xs text-gray-500">Display Name</div>
                          <div>{selectedReport.reported_user.display_name}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
              
              <div className="md:col-span-2">
                <h5 className="text-sm font-medium text-gray-400 mb-2">Report Details</h5>
                <div className="bg-gray-800 rounded p-4">
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">Report ID</div>
                    <div className="text-sm">{selectedReport.id}</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">Submitted At</div>
                    <div className="text-sm">{formatDate(selectedReport.reported_at)}</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">Current Status</div>
                    <div className="text-sm">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                        ${selectedReport.status === 'pending' ? 'bg-yellow-900 text-yellow-300' : 
                          selectedReport.status === 'in_review' ? 'bg-blue-900 text-blue-300' : 
                          selectedReport.status === 'resolved' ? 'bg-green-900 text-green-300' : 
                          'bg-gray-700 text-gray-300'}`}
                      >
                        {selectedReport.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Reason</div>
                    <div className="text-sm bg-gray-900 p-3 rounded mt-1">{selectedReport.reason}</div>
                  </div>
                </div>
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
                    onClick={() => handleReportAction(selectedReport.id, 'in_review')}
                    className="px-4 py-2 bg-blue-800 hover:bg-blue-700 rounded flex items-center"
                    disabled={actionInProgress}
                  >
                    <CheckCircle size={16} className="mr-2" />
                    {actionInProgress ? 'Processing...' : 'Mark as In Review'}
                  </button>
                  
                  <button
                    onClick={() => handleReportAction(selectedReport.id, 'resolved')}
                    className="px-4 py-2 bg-green-800 hover:bg-green-700 rounded flex items-center"
                    disabled={actionInProgress}
                  >
                    <CheckCircle size={16} className="mr-2" />
                    {actionInProgress ? 'Processing...' : 'Resolve Report'}
                  </button>
                  
                  <button
                    onClick={() => handleReportAction(selectedReport.id, 'dismissed')}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center"
                    disabled={actionInProgress}
                  >
                    <XCircle size={16} className="mr-2" />
                    {actionInProgress ? 'Processing...' : 'Dismiss Report'}
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

export default VideoChatReportViewer;
