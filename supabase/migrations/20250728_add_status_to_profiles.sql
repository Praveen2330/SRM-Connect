-- Migration: Add status column to profiles table for admin panel actions
ALTER TABLE public.profiles
ADD COLUMN status text DEFAULT 'active';
