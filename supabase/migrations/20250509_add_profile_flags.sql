-- Add missing columns to profiles table
alter table public.profiles 
  add column if not exists is_new_user boolean default true,
  add column if not exists has_accepted_rules boolean default false;
