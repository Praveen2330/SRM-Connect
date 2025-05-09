import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { UserReport, UserProfile } from '../../types';

interface ReportHandlingProps {
  canManage: boolean;
}

const ReportHandling: React.FC<ReportHandlingProps> = ({ canManage }) => {
  const [reports, setReports] = useState<UserReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<UserReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('reported_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedReport, setSelectedReport] = useState<UserReport | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);
  const [page, setPage] = useState(1);
  const [totalReports, setTotalReports] = useState(0);
  const reportsPerPage = 10;

  // Fetch reports when component mounts and when filters change
  useEffect(() => {
    fetchReports();
  }, [page, statusFilter, sortBy, sortDirection]);

  // Apply search filtering
  useEffect(() => {
    if (!reports) return;
    
    let filtered = [...reports];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(report => 
        report.reporter?.name?.toLowerCase().includes(term) || 
        report.reported_user?.name?.toLowerCase().includes(term) ||
        report.reason.toLowerCase().includes(term)
      );
    }
    
    setFilteredReports(filtered);
  }, [reports, searchTerm]);

  const fetchReports = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get total count first (with status filter)
      const { count, error: countError } = await supabase
        .from('user_reports')
        .select('*', { count: 'exact', head: true })
        .eq(statusFilter !== 'all' ? 'status' : 'id', statusFilter !== 'all' ? statusFilter : 'id');
      
      if (countError) throw countError;
      setTotalReports(count || 0);
      
      // Then get paginated data with joined profiles
      const { data, error } = await supabase
        .from('user_reports')
        .select(`
          *,
          reporter:reporter_id(id, name, avatar_url),
          reported_user:reported_user_id(id, name, avatar_url)
        `)
        .eq(statusFilter !== 'all' ? 'status' : 'id', statusFilter !== 'all' ? statusFilter : 'id')
        .order(sortBy, { ascending: sortDirection === 'asc' })
        .range((page - 1) * reportsPerPage, page * reportsPerPage - 1);
      
      if (error) throw error;
      
      if (data) {
        setReports(data as UserReport[]);
        setFilteredReports(data as UserReport[]);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      // Toggle sort direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field and default to descending
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  const handleReportAction = async (reportId: string, action: 'in_review' | 'resolved' | 'dismissed') => {
    if (!canManage) return;
    
    setActionInProgress(true);
    try {
      const updates: { status: string; admin_notes?: string; resolved_at?: string } = { 
        status: action
      };
      
      if (action === 'resolved' || action === 'dismissed') {
        updates.resolved_at = new Date().toISOString();
      }
      
      if (adminNotes.trim()) {
        updates.admin_notes = adminNotes.trim();
      }
      
      const { error } = await supabase
        .from('user_reports')
        .update(updates)
        .eq('id', reportId);
      
      if (error) throw error;
      
      // If we're resolving a report, also check if we need to take action on the reported user
      if (action === 'resolved' && selectedReport) {
        // Check if user has multiple reports
        const { data: reportCount, error: countError } = await supabase
          .from('user_reports')
          .select('id', { count: 'exact' })
          .eq('reported_user_id', selectedReport.reported_user_id)
          .eq('status', 'resolved');
        
        if (countError) throw countError;
        
        // If user has been reported multiple times (3+), auto-suspend
        if (reportCount && reportCount >= 3) {
          const { error: userError } = await supabase
            .from('profiles')
            .update({ status: 'suspended' })
            .eq('id', selectedReport.reported_user_id);
          
          if (userError) throw userError;
        }
      }
      
      // Refresh report list
      fetchReports();
      
      // Close modal if open
      if (isReportModalOpen) {
        setIsReportModalOpen(false);
        setSelectedReport(null);
        setAdminNotes('');
      }
      
    } catch (error) {
      console.error(`Error handling report:`, error);
      setError(`Failed to update report: ${(error as Error).message}`);
    } finally {
      setActionInProgress(false);
    }
  };

  const totalPages = Math.ceil(totalReports / reportsPerPage);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Report Handling</h2>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchReports}
            className="p-2 bg-indigo-800 hover:bg-indigo-700 rounded"
            title="Refresh reports"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-900 bg-opacity-20 border border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}
      
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label htmlFor="search" className="block text-sm font-medium text-gray-400 mb-1">
            Search
          </label>
          <input
            type="text"
            id="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or reason"
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          />
        </div>
        
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-400 mb-1">
            Status
          </label>
          <select
            id="status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1); // Reset to first page
            }}
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          >
            <option value="all">All Reports</option>
            <option value="pending">Pending</option>
            <option value="in_review">In Review</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
        
        <div>
          <label htmlFor="sort" className="block text-sm font-medium text-gray-400 mb-1">
            Sort By
          </label>
          <select
            id="sort"
            value={`${sortBy}_${sortDirection}`}
            onChange={(e) => {
              const [field, direction] = e.target.value.split('_');
              setSortBy(field);
              setSortDirection(direction);
            }}
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          >
            <option value="reported_at_desc">Newest First</option>
            <option value="reported_at_asc">Oldest First</option>
          </select>
        </div>
      </div>
      
      {/* Reports Table */}
      <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-md">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Reporter
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Reported User
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('reported_at')}
              >
                <div className="flex items-center">
                  Reported On
                  {sortBy === 'reported_at' && (
                    <svg className={`w-4 h-4 ml-1 ${sortDirection === 'asc' ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Reason
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
              {canManage && (
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="px-6 py-4 text-center text-gray-400">
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500"></div>
                  </div>
                </td>
              </tr>
            ) : filteredReports.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="px-6 py-4 text-center text-gray-400">
                  No reports found
                </td>
              </tr>
            ) : (
              filteredReports.map(report => (
                <tr key={report.id} className="hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8">
                        {report.reporter?.avatar_url ? (
                          <img 
                            className="h-8 w-8 rounded-full object-cover" 
                            src={report.reporter.avatar_url} 
                            alt={report.reporter?.name || 'Reporter'} 
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                            <span className="text-sm text-gray-300">
                              {(report.reporter?.name || 'A').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-white">
                          {report.reporter?.name || 'Anonymous'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-8 w-8">
                        {report.reported_user?.avatar_url ? (
                          <img 
                            className="h-8 w-8 rounded-full object-cover" 
                            src={report.reported_user.avatar_url} 
                            alt={report.reported_user?.name || 'Reported User'} 
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
                            <span className="text-sm text-gray-300">
                              {(report.reported_user?.name || 'U').charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-white">
                          {report.reported_user?.name || 'Unknown User'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {new Date(report.reported_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300">
                    <div className="truncate max-w-xs">
                      {report.reason}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                      ${report.status === 'pending' ? 'bg-yellow-900 text-yellow-300' : 
                        report.status === 'in_review' ? 'bg-blue-900 text-blue-300' : 
                        report.status === 'resolved' ? 'bg-green-900 text-green-300' : 
                        'bg-gray-700 text-gray-300'}`}
                    >
                      {report.status === 'pending' ? 'Pending' :
                        report.status === 'in_review' ? 'In Review' :
                        report.status === 'resolved' ? 'Resolved' : 'Dismissed'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedReport(report);
                          setIsReportModalOpen(true);
                          setAdminNotes(report.admin_notes || '');
                        }}
                        className="text-indigo-400 hover:text-indigo-300"
                      >
                        Review
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      <div className="flex justify-between items-center mt-6">
        <div className="text-sm text-gray-400">
          Showing {filteredReports.length} of {totalReports} reports
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setPage(prevPage => Math.max(prevPage - 1, 1))}
            disabled={page === 1}
            className={`px-3 py-1 rounded ${page === 1 
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
              : 'bg-gray-700 text-white hover:bg-gray-600'}`}
          >
            Previous
          </button>
          
          <span className="px-3 py-1 bg-gray-800 rounded">
            Page {page} of {totalPages || 1}
          </span>
          
          <button
            onClick={() => setPage(prevPage => prevPage + 1)}
            disabled={page >= totalPages}
            className={`px-3 py-1 rounded ${page >= totalPages 
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
              : 'bg-gray-700 text-white hover:bg-gray-600'}`}
          >
            Next
          </button>
        </div>
      </div>
      
      {/* Report Details Modal */}
      {isReportModalOpen && selectedReport && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-2xl">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xl font-bold">Report Details</h3>
              <button
                onClick={() => {
                  setIsReportModalOpen(false);
                  setSelectedReport(null);
                  setAdminNotes('');
                }}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <h5 className="text-sm font-medium text-gray-400 mb-2">Reporter</h5>
                <div className="bg-gray-800 rounded p-4 flex items-center">
                  <div className="flex-shrink-0 mr-3">
                    {selectedReport.reporter?.avatar_url ? (
                      <img 
                        className="h-10 w-10 rounded-full object-cover" 
                        src={selectedReport.reporter.avatar_url} 
                        alt={selectedReport.reporter?.name || 'Reporter'} 
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center">
                        <span className="text-lg text-gray-300">
                          {(selectedReport.reporter?.name || 'A').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium">{selectedReport.reporter?.name || 'Anonymous'}</div>
                    <div className="text-sm text-gray-400">ID: {selectedReport.reporter_id}</div>
                  </div>
                </div>
              </div>
              
              <div>
                <h5 className="text-sm font-medium text-gray-400 mb-2">Reported User</h5>
                <div className="bg-gray-800 rounded p-4 flex items-center">
                  <div className="flex-shrink-0 mr-3">
                    {selectedReport.reported_user?.avatar_url ? (
                      <img 
                        className="h-10 w-10 rounded-full object-cover" 
                        src={selectedReport.reported_user.avatar_url} 
                        alt={selectedReport.reported_user?.name || 'Reported User'} 
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center">
                        <span className="text-lg text-gray-300">
                          {(selectedReport.reported_user?.name || 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium">{selectedReport.reported_user?.name || 'Unknown User'}</div>
                    <div className="text-sm text-gray-400">ID: {selectedReport.reported_user_id}</div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mb-6">
              <h5 className="text-sm font-medium text-gray-400 mb-2">Report Details</h5>
              <div className="bg-gray-800 rounded p-4">
                <div className="mb-3">
                  <div className="text-xs text-gray-500">Report ID</div>
                  <div className="text-sm">{selectedReport.id}</div>
                </div>
                <div className="mb-3">
                  <div className="text-xs text-gray-500">Submitted At</div>
                  <div className="text-sm">{new Date(selectedReport.reported_at).toLocaleString()}</div>
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
                      {selectedReport.status === 'pending' ? 'Pending' :
                        selectedReport.status === 'in_review' ? 'In Review' :
                        selectedReport.status === 'resolved' ? 'Resolved' : 'Dismissed'}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Reason</div>
                  <div className="text-sm bg-gray-900 p-3 rounded mt-1">{selectedReport.reason}</div>
                </div>
              </div>
            </div>
            
            {canManage && (
              <>
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
                
                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-800">
                  {selectedReport.status === 'pending' && (
                    <button
                      onClick={() => handleReportAction(selectedReport.id, 'in_review')}
                      className="px-4 py-2 bg-blue-800 hover:bg-blue-700 rounded"
                      disabled={actionInProgress}
                    >
                      {actionInProgress ? 'Processing...' : 'Mark as In Review'}
                    </button>
                  )}
                  
                  {(selectedReport.status === 'pending' || selectedReport.status === 'in_review') && (
                    <>
                      <button
                        onClick={() => handleReportAction(selectedReport.id, 'resolved')}
                        className="px-4 py-2 bg-green-800 hover:bg-green-700 rounded"
                        disabled={actionInProgress}
                      >
                        {actionInProgress ? 'Processing...' : 'Resolve Report'}
                      </button>
                      
                      <button
                        onClick={() => handleReportAction(selectedReport.id, 'dismissed')}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                        disabled={actionInProgress}
                      >
                        {actionInProgress ? 'Processing...' : 'Dismiss Report'}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportHandling;
