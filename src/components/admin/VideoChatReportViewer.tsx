import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

interface VideoChatReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  created_at: string;
  reported_at?: string;
  status: 'pending' | 'in_review' | 'resolved' | 'dismissed';
  // new optional fields for names
  reporter_name?: string;
  reported_user_name?: string;
}

interface VideoChatReportViewerProps {
  canManage: boolean;
  updateCount?: (count: number) => void;
  showFilters?: boolean;
}

const VideoChatReportViewer: React.FC<VideoChatReportViewerProps> = ({
  canManage,
  updateCount,
  showFilters = true,
}) => {
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

  useEffect(() => {
    if (updateCount) {
      const pendingReports = reports.filter((report) => report.status === 'pending').length;
      updateCount(pendingReports);
    }
  }, [reports, updateCount]);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1) Get all reports (no joins here)
      const { data, error } = await supabase
        .from('user_reports')
        .select('*')
        .order('reported_at', { ascending: false });

      if (error) throw error;
      if (!data) {
        setReports([]);
        return;
      }

      // 2) Collect unique user IDs (reporter + reported user)
      const userIds = Array.from(
        new Set(
          data
            .flatMap((r: any) => [r.reporter_id, r.reported_user_id])
            .filter((id): id is string => Boolean(id))
        )
      );

      // 3) Build a map of id -> display_name from profiles table
      const nameMap = new Map<string, string>();

      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name');

        if (!profilesError && profiles) {
          profiles.forEach((p: any) => {
            nameMap.set(p.id, p.display_name || 'Unknown User');
          });
        }
      }

      // 4) Attach names onto each report
      const reportsWithNames: VideoChatReport[] = data.map((r: any) => ({
        ...r,
        reporter_name: nameMap.get(r.reporter_id) || 'Unknown User',
        reported_user_name: nameMap.get(r.reported_user_id) || 'Unknown User',
      }));

      setReports(reportsWithNames);

      if (updateCount) {
        updateCount(reportsWithNames.length);
      }
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleReportAction = async (
    reportId: string,
    status: 'in_review' | 'resolved' | 'dismissed'
  ) => {
    if (!canManage) return;

    setActionInProgress(true);
    try {
      const updates = { status };

      const { error } = await supabase
        .from('user_reports')
        .update(updates)
        .eq('id', reportId);

      if (error) throw error;

      await fetchReports();
      setSelectedReport(null);
    } catch (err) {
      console.error('Error updating report:', err);
      setError('Failed to update report. Please try again.');
    } finally {
      setActionInProgress(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString();
  };

  const filteredReports =
    filterStatus === 'all'
      ? reports
      : reports.filter((report) => report.status === filterStatus);

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
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        report.status === 'pending'
                          ? 'bg-yellow-900 text-yellow-300'
                          : report.status === 'in_review'
                          ? 'bg-blue-900 text-blue-300'
                          : report.status === 'resolved'
                          ? 'bg-green-900 text-green-300'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {report.status.replace('_', ' ')}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {formatDate(report.reported_at || report.created_at)}
                    </span>
                  </div>
                  <h3 className="font-medium mt-1">Reason: {report.reason}</h3>
                  <div className="mt-2 text-sm space-y-1">
                    <div>
                      <span className="text-gray-400">Reporter: </span>
                      {report.reporter_name || 'Unknown User'}{' '}
                      <span className="text-xs text-gray-500">({report.reporter_id})</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Reported User: </span>
                      {report.reported_user_name || 'Unknown User'}{' '}
                      <span className="text-xs text-gray-500">({report.reported_user_id})</span>
                    </div>
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
              {/* Reporter */}
              <div>
                <h5 className="text-sm font-medium text-gray-400 mb-2">Reporter</h5>
                <div className="bg-gray-800 rounded p-4">
                  <div className="text-sm mb-1 font-semibold">
                    {selectedReport.reporter_name || 'Unknown User'}
                  </div>
                  <div className="text-xs text-gray-500 break-all">
                    ID: {selectedReport.reporter_id}
                  </div>
                </div>
              </div>

              {/* Reported User */}
              <div>
                <h5 className="text-sm font-medium text-gray-400 mb-2">Reported User</h5>
                <div className="bg-gray-800 rounded p-4">
                  <div className="text-sm mb-1 font-semibold">
                    {selectedReport.reported_user_name || 'Unknown User'}
                  </div>
                  <div className="text-xs text-gray-500 break-all">
                    ID: {selectedReport.reported_user_id}
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="md:col-span-2">
                <h5 className="text-sm font-medium text-gray-400 mb-2">Report Details</h5>
                <div className="bg-gray-800 rounded p-4">
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">Report ID</div>
                    <div className="text-sm break-all">{selectedReport.id}</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">Submitted At</div>
                    <div className="text-sm">
                      {formatDate(selectedReport.reported_at || selectedReport.created_at)}
                    </div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">Current Status</div>
                    <div className="text-sm">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                        ${
                          selectedReport.status === 'pending'
                            ? 'bg-yellow-900 text-yellow-300'
                            : selectedReport.status === 'in_review'
                            ? 'bg-blue-900 text-blue-300'
                            : selectedReport.status === 'resolved'
                            ? 'bg-green-900 text-green-300'
                            : 'bg-gray-700 text-gray-300'
                        }`}
                      >
                        {selectedReport.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Reason</div>
                    <div className="text-sm bg-gray-900 p-3 rounded mt-1">
                      {selectedReport.reason}
                    </div>
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