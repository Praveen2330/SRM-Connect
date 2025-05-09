import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { SystemSettings } from '../../types';
import { useAuth } from '../../hooks/useAuth';

const PlatformSettings: React.FC = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState('');
  
  // Form fields
  const [allowRegistrations, setAllowRegistrations] = useState(true);
  const [allowedDomains, setAllowedDomains] = useState<string[]>(['srmist.edu.in']);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [maxReportsBeforeSuspend, setMaxReportsBeforeSuspend] = useState(5);
  const [maxReportsPerDay, setMaxReportsPerDay] = useState(3);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .single();
      
      if (error) throw error;
      
      if (data) {
        setSettings(data as SystemSettings);
        setAllowRegistrations(data.allow_new_registrations);
        setAllowedDomains(data.allowed_email_domains || ['srmist.edu.in']);
        setMaintenanceMode(data.maintenance_mode);
        setMaintenanceMessage(data.maintenance_message || '');
        setMaxReportsBeforeSuspend(data.max_reports_before_auto_suspend || 5);
        setMaxReportsPerDay(data.max_reports_allowed_per_day || 3);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const updatedSettings = {
        allow_new_registrations: allowRegistrations,
        allowed_email_domains: allowedDomains,
        maintenance_mode: maintenanceMode,
        maintenance_message: maintenanceMessage,
        max_reports_before_auto_suspend: maxReportsBeforeSuspend,
        max_reports_allowed_per_day: maxReportsPerDay,
        updated_by: user?.id,
        last_updated: new Date().toISOString()
      };
      
      const { error } = await supabase
        .from('system_settings')
        .update(updatedSettings)
        .eq('id', 1);
      
      if (error) throw error;
      
      setSuccess('Platform settings updated successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
      
    } catch (error) {
      console.error('Error saving settings:', error);
      setError((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const addDomain = () => {
    if (!newDomain.trim()) return;
    
    // Check if domain already exists
    if (allowedDomains.includes(newDomain.trim())) {
      setError('This domain is already in the allowed list');
      return;
    }
    
    setAllowedDomains([...allowedDomains, newDomain.trim()]);
    setNewDomain('');
    setError(null);
  };

  const removeDomain = (domain: string) => {
    if (allowedDomains.length === 1) {
      setError('You must have at least one allowed domain');
      return;
    }
    
    setAllowedDomains(allowedDomains.filter(d => d !== domain));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Platform Settings</h2>
        
        <button
          onClick={fetchSettings}
          className="p-2 bg-indigo-800 hover:bg-indigo-700 rounded"
          title="Refresh settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      
      {error && (
        <div className="bg-red-900 bg-opacity-20 border border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}
      
      {success && (
        <div className="bg-green-900 bg-opacity-20 border border-green-800 rounded-lg p-4 mb-6">
          <p className="text-green-400">{success}</p>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Registration Settings */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">User Registration</h3>
          
          <div className="mb-4">
            <label className="flex items-center space-x-3 mb-3">
              <input
                type="checkbox"
                checked={allowRegistrations}
                onChange={(e) => setAllowRegistrations(e.target.checked)}
                className="form-checkbox h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500 bg-gray-700 border-gray-600"
              />
              <span className="text-gray-300">Allow new registrations</span>
            </label>
            <p className="text-sm text-gray-400">
              When disabled, new users will not be able to create accounts.
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-300 mb-2">Allowed Email Domains</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {allowedDomains.map(domain => (
                <div 
                  key={domain} 
                  className="bg-gray-700 text-gray-300 px-3 py-1 rounded-full flex items-center"
                >
                  <span>{domain}</span>
                  <button 
                    onClick={() => removeDomain(domain)}
                    className="ml-2 text-gray-400 hover:text-gray-200"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="Add new domain (e.g. srmist.edu.in)"
                className="w-full p-2 rounded-l bg-gray-700 border border-gray-600 text-white"
              />
              <button
                onClick={addDomain}
                className="bg-indigo-700 hover:bg-indigo-600 text-white px-4 rounded-r"
              >
                Add
              </button>
            </div>
            <p className="text-sm text-gray-400 mt-2">
              Only email addresses from these domains will be allowed to register.
            </p>
          </div>
        </div>
        
        {/* Maintenance Settings */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Maintenance Mode</h3>
          
          <div className="mb-4">
            <label className="flex items-center space-x-3 mb-3">
              <input
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                className="form-checkbox h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500 bg-gray-700 border-gray-600"
              />
              <span className="text-gray-300">Enable maintenance mode</span>
            </label>
            <p className="text-sm text-gray-400">
              When enabled, only admins can access the platform. All other users will see the maintenance message.
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-300 mb-2">Maintenance Message</label>
            <textarea
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              placeholder="Enter the message that users will see during maintenance mode..."
              className="w-full p-3 rounded bg-gray-700 border border-gray-600 text-white"
              rows={4}
            />
          </div>
        </div>
        
        {/* Report Settings */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">Report Handling</h3>
          
          <div className="mb-4">
            <label className="block text-gray-300 mb-2">
              Max reports before auto-suspend
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={maxReportsBeforeSuspend}
              onChange={(e) => setMaxReportsBeforeSuspend(parseInt(e.target.value) || 5)}
              className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
            />
            <p className="text-sm text-gray-400 mt-1">
              Users will be automatically suspended after receiving this many confirmed reports.
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-300 mb-2">
              Max reports allowed per user per day
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={maxReportsPerDay}
              onChange={(e) => setMaxReportsPerDay(parseInt(e.target.value) || 3)}
              className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
            />
            <p className="text-sm text-gray-400 mt-1">
              Limits how many reports a single user can submit per day to prevent abuse.
            </p>
          </div>
        </div>
        
        {/* Save Button */}
        <div className="bg-gray-800 rounded-lg p-6 flex items-center justify-center">
          <button
            onClick={saveSettings}
            disabled={isSaving}
            className="w-full py-3 bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg font-medium flex items-center justify-center"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                Saving Changes...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlatformSettings;
