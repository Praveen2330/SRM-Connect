const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

router.post('/admin/createUser', async (req, res) => {
  try {
    const { requesterId, email, password, name, gender, isAdmin, adminRole } = req.body;

    if (!requesterId) {
      return res.status(400).json({ success: false, error: 'Missing requesterId' });
    }

    // Verify requester is a super admin
    const { data: adminCheck, error: adminCheckError } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', requesterId)
      .single();

    if (adminCheckError) {
      console.error('Error checking admin role:', adminCheckError);
      return res.status(500).json({ success: false, error: 'Failed to verify admin role' });
    }

    if (!adminCheck || adminCheck.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Only super admins can invite external emails'
      });
    }

    // Create user in Supabase Auth with service role
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, gender }
    });

    if (createError || !newUser || !newUser.user) {
      console.error('Error creating auth user:', createError);
      return res.status(400).json({
        success: false,
        error: createError?.message || 'Failed to create user'
      });
    }

    const userId = newUser.user.id;

    // Create profile row
    const { error: profileError } = await supabase.from('profiles').insert([
      {
        id: userId,
        display_name: name,
        gender: gender || 'unknown',
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

    if (profileError) {
      console.error('Error creating profile:', profileError);
      return res.status(500).json({
        success: false,
        error: 'User created but failed to create profile'
      });
    }

    // If admin flag set, create admin_users row
    if (isAdmin) {
      const { error: adminError } = await supabase.from('admin_users').insert([
        {
          user_id: userId,
          role: adminRole || 'moderator',
          created_by: requesterId,
          created_at: new Date().toISOString()
        }
      ]);

      if (adminError) {
        console.error('Error creating admin record:', adminError);
        return res.status(500).json({
          success: false,
          error: 'User created but failed to assign admin role'
        });
      }
    }

    return res.status(200).json({ success: true, userId });
  } catch (err) {
    console.error('Unexpected error in /admin/createUser:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/admin/users', async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const perPage = parseInt(req.query.perPage, 10) || 10;
      const sortBy = req.query.sortBy || 'created_at';
      const sortDirection = req.query.sortDirection === 'asc' ? 'asc' : 'desc';
  
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
  
      const { data: profiles, error: profilesError, count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .order(sortBy, { ascending: sortDirection === 'asc' })
        .range(from, to);
  
      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        return res.status(500).json({ success: false, error: profilesError.message });
      }
  
      if (!profiles || profiles.length === 0) {
        return res.json({ success: true, total: 0, users: [] });
      }
  
      const userIds = profiles.map((p) => p.id);
  
      const { data: authData, error: authError } = await supabase
        .from('auth.users')
        .select('id, email, created_at, last_sign_in_at, user_metadata')
        .in('id', userIds);
  
      if (authError) {
        console.error('Error fetching auth users:', authError);
      }
  
      const authMap = new Map();
      if (authData && Array.isArray(authData)) {
        authData.forEach((u) => {
          authMap.set(u.id, u);
        });
      }
  
      const users = profiles.map((profile) => {
        const authUser = authMap.get(profile.id) || {};
        return {
          id: profile.id,
          name: profile.display_name || profile.name || 'Anonymous',
          email: authUser.email || '',
          created_at: authUser.created_at || profile.created_at,
          last_sign_in_at: authUser.last_sign_in_at || null,
          gender: profile.gender || 'unknown',
          status: profile.status || 'active',
          user_metadata: authUser.user_metadata || null,
          avatar_url: profile.avatar_url || null,
        };
      });
  
      return res.json({ success: true, total: count || users.length, users });
    } catch (err) {
      console.error('Unexpected error in /admin/users:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

module.exports = router;