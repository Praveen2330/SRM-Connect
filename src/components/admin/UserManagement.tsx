import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ExtendedUserProfile, AdminRole } from '../../types';
import { useAuth } from '../../hooks/useAuth';

interface UserManagementProps {
  canManage: boolean;
}

const UserManagement: React.FC<UserManagementProps> = ({ canManage }) => {
  const { user } = useAuth();

  // Add user modal state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserGender, setNewUserGender] = useState('male');
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole>('viewer');
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);
  const [addUserSuccess, setAddUserSuccess] = useState<string | null>(null);

  // Users table state
  const [users, setUsers] = useState<ExtendedUserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<ExtendedUserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedUser, setSelectedUser] = useState<ExtendedUserProfile | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [page, setPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const usersPerPage = 10;

  // Fetch users when the component mounts / pagination / sorting changes
  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortBy, sortDirection]);

  // Filtering logic
  useEffect(() => {
    if (!users) return;

    let filtered = [...users];

    // Search by name or email
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((user) =>
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
      );
    }

    // Filter by gender
    if (genderFilter !== 'all') {
      filtered = filtered.filter(
        (user) => user.gender?.toLowerCase() === genderFilter
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter((user) => user.status === statusFilter);
    }

    setFilteredUsers(filtered);
  }, [users, searchTerm, genderFilter, statusFilter]);

  // Handler for admin manual user creation
  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserLoading(true);
    setAddUserError(null);
    setAddUserSuccess(null);

    try {
      // 1) Create user in Supabase Auth
      const { data: signUpData, error: signUpError } =
        await supabase.auth.admin.createUser({
          email: newUserEmail,
          password: newUserPassword,
          email_confirm: true,
          user_metadata: { name: newUserName, gender: newUserGender }
        });

      if (signUpError || !signUpData || !signUpData.user) {
        throw signUpError || new Error('Failed to create user');
      }

      const userId = signUpData.user.id;

      // 2) Create profile row
      const { error: profileError } = await supabase.from('profiles').insert([
        {
          id: userId,
          display_name: newUserName,
          gender: newUserGender,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_new_user: true,
          has_accepted_rules: false,
          is_online: false,
          last_seen: null,
          bio: '',
          interests: [],
          avatar_url: null,
          language: 'en',
          age: 18,
          gender_preference: 'any'
        }
      ]);

      if (profileError) throw profileError;

      // 3) If admin selected, create admin_users row
      if (isAdminUser) {
        const { error: adminError } = await supabase
          .from('admin_users')
          .insert([
            {
              user_id: userId,
              role: adminRole,
              created_by: user?.id ?? null,
              created_at: new Date().toISOString()
            }
          ]);

        if (adminError) throw adminError;
      }

      setAddUserSuccess('User created successfully!');
      setTimeout(() => {
        setShowAddUserModal(false);
        setNewUserName('');
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserGender('male');
        setIsAdminUser(false);
        setAdminRole('viewer');
        setAddUserSuccess(null);
        fetchUsers();
      }, 1500);
    } catch (error: any) {
      setAddUserError(error?.message || 'Failed to create user');
    } finally {
      setAddUserLoading(false);
    }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First approach: profiles only
      try {
        const { count, error: countError } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        if (countError) throw countError;
        setTotalUsers(count || 0);

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order(sortBy, { ascending: sortDirection === 'asc' })
          .range((page - 1) * usersPerPage, page * usersPerPage - 1);

        if (error) throw error;

        if (data) {
          // Transform data to match ExtendedUserProfile
          const transformedUsers: ExtendedUserProfile[] = data.map((profile: any) => ({
            id: profile.id,
            name: profile.display_name || profile.name || 'Anonymous',
            email: profile.users?.email || '',
            created_at: profile.users?.created_at || profile.created_at,
            last_sign_in_at: profile.users?.last_sign_in_at,
            gender: profile.gender || 'unknown',
            status: profile.status || 'active',
            user_metadata: profile.users?.user_metadata,
            avatar_url: profile.avatar_url
          }));

          setUsers(transformedUsers);
          setFilteredUsers(transformedUsers);
          return;
        }
      } catch (joinError) {
        console.error('Error with join query:', joinError);

        // Second approach: profiles + auth.users separately
        try {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .order(sortBy, { ascending: sortDirection === 'asc' })
            .range((page - 1) * usersPerPage, page * usersPerPage - 1);

          if (profilesError) throw profilesError;

          if (profilesData && profilesData.length > 0) {
            const userIds = profilesData.map((profile: any) => profile.id);

            // NOTE: auth.users isn't directly queryable via supabase-js this way in newer versions,
            // but keeping this for your current fallback pattern.
            const { data: authData, error: authError } = await supabase
              .from('auth.users' as any)
              .select('id, email, created_at, last_sign_in_at, user_metadata')
              .in('id', userIds);

            const authMap = new Map<string, any>();
            if (!authError && authData) {
              (authData as any[]).forEach((authUser) => {
                authMap.set(authUser.id, authUser);
              });
            }

            const transformedUsers: ExtendedUserProfile[] = profilesData.map((profile: any) => {
              const authUser = authMap.get(profile.id);
              return {
                id: profile.id,
                name: profile.display_name || profile.name || 'Anonymous',
                email: authUser?.email || '',
                created_at: authUser?.created_at || profile.created_at,
                last_sign_in_at: authUser?.last_sign_in_at,
                gender: profile.gender || 'unknown',
                status: profile.status || 'active',
                user_metadata: authUser?.user_metadata,
                avatar_url: profile.avatar_url
              };
            });

            setUsers(transformedUsers);
            setFilteredUsers(transformedUsers);
            return;
          }
        } catch (separateQueryError) {
          console.error('Error with separate queries:', separateQueryError);
        }
      }

      // Fallback demo data
      console.log('Using fallback user data due to database errors');
      const fallbackUsers: ExtendedUserProfile[] = [
        {
          id: 'e1f9caeb-ae74-41af-984a-b44230ac7491',
          name: 'Admin User',
          email: 'pn7054@srmist.edu.in',
          created_at: '2025-03-29T12:31:19.255746Z',
          last_sign_in_at: new Date().toISOString(),
          gender: 'male',
          status: 'active',
          user_metadata: { name: 'Admin' },
          avatar_url: null
        },
        {
          id: '00000000-0000-0000-0000-000000000001',
          name: 'Test User 1',
          email: 'test1@srmist.edu.in',
          created_at: '2025-04-01T10:00:00Z',
          last_sign_in_at: '2025-05-09T14:30:00Z',
          gender: 'female',
          status: 'active',
          user_metadata: { name: 'Test User 1' },
          avatar_url: null
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          name: 'Test User 2',
          email: 'test2@srmist.edu.in',
          created_at: '2025-04-02T11:00:00Z',
          last_sign_in_at: '2025-05-08T09:15:00Z',
          gender: 'male',
          status: 'active',
          user_metadata: { name: 'Test User 2' },
          avatar_url: null
        }
      ];

      setTotalUsers(fallbackUsers.length);
      setUsers(fallbackUsers);
      setFilteredUsers(fallbackUsers);
      setError('Database relationship error. Using demo data.');
    } catch (error) {
      console.error('Error fetching users:', error);
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('desc');
    }
  };

  const handleUserAction = async (
    userId: string,
    action: 'suspend' | 'activate' | 'delete'
  ) => {
    if (!canManage) return;

    setActionInProgress(true);
    try {
      let updates: Record<string, any> = {};

      if (action === 'suspend') {
        updates = { status: 'suspended' };
      } else if (action === 'activate') {
        updates = { status: 'active' };
      } else if (action === 'delete') {
        // Soft-delete by status + anonymise profile fields (adjust to match your schema!)
        updates = {
          status: 'deleted',
          display_name: 'Deleted User',
          avatar_url: null
        };
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (error) throw error;

      fetchUsers();

      if (isUserModalOpen) {
        setIsUserModalOpen(false);
        setSelectedUser(null);
      }
    } catch (error) {
      console.error(`Error ${action}ing user:`, error);
      setError(`Failed to ${action} user: ${(error as Error).message}`);
    } finally {
      setActionInProgress(false);
    }
  };

  const exportUserData = () => {
    const dataToExport = filteredUsers.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      gender: user.gender,
      status: user.status,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at
    }));

    const dataStr = JSON.stringify(dataToExport, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(
      dataStr
    )}`;

    const exportFileDefaultName = `srm_connect_users_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const totalPages = Math.ceil(totalUsers / usersPerPage);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">User Management</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => fetchUsers()}
            className="p-2 rounded-lg bg-blue-900 hover:bg-blue-800 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <button
            onClick={exportUserData}
            className="flex items-center bg-green-900 text-white px-4 py-2 rounded hover:bg-green-800 transition-colors"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export Users
          </button>
          {canManage && (
            <button
              onClick={() => setShowAddUserModal(true)}
              className="flex items-center bg-indigo-900 text-white px-4 py-2 rounded hover:bg-indigo-800 transition-colors"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Person
            </button>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-zinc-900 rounded-lg p-8 w-full max-w-md relative">
            <button
              className="absolute top-2 right-2 text-gray-400 hover:text-white"
              onClick={() => setShowAddUserModal(false)}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <h3 className="text-xl font-semibold mb-4">Add New Person</h3>
            <form onSubmit={handleAddUserSubmit} className="space-y-4">
              <div>
                <label className="block text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1">Password</label>
                <input
                  type="password"
                  className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-gray-400 mb-1">Gender</label>
                <select
                  className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
                  value={newUserGender}
                  onChange={(e) => setNewUserGender(e.target.value)}
                  required
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Role selection: normal vs admin */}
              <div>
                <label className="block text-gray-400 mb-1">Role</label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      className="form-radio text-indigo-600"
                      checked={!isAdminUser}
                      onChange={() => setIsAdminUser(false)}
                    />
                    <span className="text-gray-200 text-sm">Normal user</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      className="form-radio text-indigo-600"
                      checked={isAdminUser}
                      onChange={() => setIsAdminUser(true)}
                    />
                    <span className="text-gray-200 text-sm">Admin user</span>
                  </label>
                </div>

                {isAdminUser && (
                  <div className="mt-3">
                    <label className="block text-gray-400 mb-1 text-sm">
                      Admin Role
                    </label>
                    <select
                      className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white text-sm"
                      value={adminRole}
                      onChange={(e) =>
                        setAdminRole(e.target.value as AdminRole)
                      }
                    >
                      <option value="viewer">Viewer (read-only)</option>
                      <option value="moderator">Moderator</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Admin users can access the admin panel. Role controls
                      what they can do there.
                    </p>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={addUserLoading}
                className="w-full bg-indigo-700 hover:bg-indigo-600 text-white py-2 rounded font-semibold transition-colors mt-4"
              >
                {addUserLoading ? 'Creating...' : 'Create User'}
              </button>
              {addUserError && (
                <div className="text-red-400 text-sm mt-2">{addUserError}</div>
              )}
              {addUserSuccess && (
                <div className="text-green-400 text-sm mt-2">
                  {addUserSuccess}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900 text-white p-4 mb-4 rounded">
          <div className="flex items-center">
            <div className="mr-3 text-xl">⚠️</div>
            <div>
              <p className="font-semibold">Database Schema Error</p>
              <p className="text-sm">{error}</p>
              <p className="text-sm mt-1">
                Using fallback data. Full functionality is limited until
                database issues are resolved.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label
            htmlFor="search"
            className="block text-sm font-medium text-gray-400 mb-1"
          >
            Search
          </label>
          <input
            type="text"
            id="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or email"
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          />
        </div>

        <div>
          <label
            htmlFor="gender"
            className="block text-sm font-medium text-gray-400 mb-1"
          >
            Gender
          </label>
          <select
            id="gender"
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          >
            <option value="all">All Genders</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="status"
            className="block text-sm font-medium text-gray-400 mb-1"
          >
            Status
          </label>
          <select
            id="status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="sort"
            className="block text-sm font-medium text-gray-400 mb-1"
          >
            Sort By
          </label>
          <select
            id="sort"
            value={`${sortBy}_${sortDirection}`}
            onChange={(e) => {
              const [field, direction] = e.target.value.split('_');
              setSortBy(field);
              setSortDirection(direction as 'asc' | 'desc');
            }}
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white"
          >
            <option value="created_at_desc">Newest First</option>
            <option value="created_at_asc">Oldest First</option>
            <option value="name_asc">Name (A-Z)</option>
            <option value="name_desc">Name (Z-A)</option>
            <option value="last_sign_in_at_desc">Recently Active</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-md">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider"
              >
                User
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('created_at')}
              >
                <div className="flex items-center">
                  Joined
                  {sortBy === 'created_at' && (
                    <svg
                      className={`w-4 h-4 ml-1 ${
                        sortDirection === 'asc' ? 'transform rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  )}
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider"
              >
                Gender
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider"
              >
                Last Activity
              </th>
              {canManage && (
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider"
                >
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {isLoading ? (
              <tr>
                <td
                  colSpan={canManage ? 6 : 5}
                  className="px-6 py-4 text-center text-gray-400"
                >
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-indigo-500" />
                  </div>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td
                  colSpan={canManage ? 6 : 5}
                  className="px-6 py-4 text-center text-gray-400"
                >
                  No users found
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        {user.avatar_url ? (
                          <img
                            className="h-10 w-10 rounded-full object-cover"
                            src={user.avatar_url}
                            alt={user.name}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center">
                            <span className="text-xl text-gray-300">
                              {user.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-white">
                          {user.name}
                        </div>
                        <div className="text-sm text-gray-400">
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full
                      ${
                        user.status === 'active'
                          ? 'bg-green-900 text-green-300'
                          : user.status === 'suspended'
                          ? 'bg-yellow-900 text-yellow-300'
                          : 'bg-red-900 text-red-300'
                      }`}
                    >
                      {user.status === 'active'
                        ? 'Active'
                        : user.status === 'suspended'
                        ? 'Suspended'
                        : 'Deleted'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {user.gender === 'male'
                      ? 'Male'
                      : user.gender === 'female'
                      ? 'Female'
                      : user.gender === 'other'
                      ? 'Other'
                      : 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {user.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleString()
                      : 'Never logged in'}
                  </td>
                  {canManage && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setIsUserModalOpen(true);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 mr-3"
                      >
                        Details
                      </button>

                      {user.status === 'active' ? (
                        <button
                          onClick={() => handleUserAction(user.id, 'suspend')}
                          className="text-yellow-400 hover:text-yellow-300 mr-3"
                          disabled={actionInProgress}
                        >
                          Suspend
                        </button>
                      ) : user.status === 'suspended' ? (
                        <button
                          onClick={() => handleUserAction(user.id, 'activate')}
                          className="text-green-400 hover:text-green-300 mr-3"
                          disabled={actionInProgress}
                        >
                          Activate
                        </button>
                      ) : null}

                      {user.status !== 'deleted' && (
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Are you sure you want to delete ${user.name}? This action cannot be undone.`
                              )
                            ) {
                              handleUserAction(user.id, 'delete');
                            }
                          }}
                          className="text-red-400 hover:text-red-300"
                          disabled={actionInProgress}
                        >
                          Delete
                        </button>
                      )}
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
          Showing {filteredUsers.length} of {totalUsers} users
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => setPage((prevPage) => Math.max(prevPage - 1, 1))}
            disabled={page === 1}
            className={`px-3 py-1 rounded ${
              page === 1
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            Previous
          </button>

          <span className="px-3 py-1 bg-gray-800 rounded">
            Page {page} of {totalPages || 1}
          </span>

          <button
            onClick={() => setPage((prevPage) => prevPage + 1)}
            disabled={page >= totalPages}
            className={`px-3 py-1 rounded ${
              page >= totalPages
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            Next
          </button>
        </div>
      </div>

      {/* User Details Modal */}
      {isUserModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-2xl">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-xl font-bold">User Details</h3>
              <button
                onClick={() => {
                  setIsUserModalOpen(false);
                  setSelectedUser(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="flex items-center mb-6">
              <div className="mr-4">
                {selectedUser.avatar_url ? (
                  <img
                    src={selectedUser.avatar_url}
                    alt={selectedUser.name}
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center">
                    <span className="text-2xl text-white">
                      {selectedUser.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-xl font-semibold">{selectedUser.name}</h4>
                <p className="text-gray-400">{selectedUser.email}</p>
                <div className="flex items-center mt-1">
                  <span
                    className={`px-2 mr-2 inline-flex text-xs leading-5 font-semibold rounded-full
                    ${
                      selectedUser.status === 'active'
                        ? 'bg-green-900 text-green-300'
                        : selectedUser.status === 'suspended'
                        ? 'bg-yellow-900 text-yellow-300'
                        : 'bg-red-900 text-red-300'
                    }`}
                  >
                    {selectedUser.status === 'active'
                      ? 'Active'
                      : selectedUser.status === 'suspended'
                      ? 'Suspended'
                      : 'Deleted'}
                  </span>

                  <span className="text-gray-400 text-sm">
                    {selectedUser.gender === 'male'
                      ? 'Male'
                      : selectedUser.gender === 'female'
                      ? 'Female'
                      : selectedUser.gender === 'other'
                      ? 'Other'
                      : 'Unknown'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <h5 className="text-sm font-medium text-gray-400 mb-2">
                  Account Information
                </h5>
                <div className="bg-gray-800 rounded p-4">
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">User ID</div>
                    <div className="text-sm">{selectedUser.id}</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">Created</div>
                    <div className="text-sm">
                      {new Date(selectedUser.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Last Sign In</div>
                    <div className="text-sm">
                      {selectedUser.last_sign_in_at
                        ? new Date(
                            selectedUser.last_sign_in_at
                          ).toLocaleString()
                        : 'Never logged in'}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h5 className="text-sm font-medium text-gray-400 mb-2">
                  User Statistics
                </h5>
                <div className="bg-gray-800 rounded p-4">
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">Reports Filed</div>
                    <div className="text-sm">Loading...</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-gray-500">Times Reported</div>
                    <div className="text-sm">Loading...</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Video Chats</div>
                    <div className="text-sm">Loading...</div>
                  </div>
                </div>
              </div>
            </div>

            {canManage && (
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-800">
                {selectedUser.status === 'active' ? (
                  <button
                    onClick={() =>
                      handleUserAction(selectedUser.id, 'suspend')
                    }
                    className="px-4 py-2 bg-yellow-800 hover:bg-yellow-700 rounded"
                    disabled={actionInProgress}
                  >
                    {actionInProgress ? 'Processing...' : 'Suspend User'}
                  </button>
                ) : selectedUser.status === 'suspended' ? (
                  <button
                    onClick={() =>
                      handleUserAction(selectedUser.id, 'activate')
                    }
                    className="px-4 py-2 bg-green-800 hover:bg-green-700 rounded"
                    disabled={actionInProgress}
                  >
                    {actionInProgress ? 'Processing...' : 'Activate User'}
                  </button>
                ) : null}

                {selectedUser.status !== 'deleted' && (
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          `Are you sure you want to delete ${selectedUser.name}? This action cannot be undone.`
                        )
                      ) {
                        handleUserAction(selectedUser.id, 'delete');
                      }
                    }}
                    className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded"
                    disabled={actionInProgress}
                  >
                    {actionInProgress ? 'Processing...' : 'Delete User'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;