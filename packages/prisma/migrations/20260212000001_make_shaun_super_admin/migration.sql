-- Make shaun.everbridge@gmail.com a super admin
-- This runs as part of the migration

DO $$
BEGIN
  -- Add super-admin role if user exists
  UPDATE users 
  SET roles = array_append(roles, 'super-admin')
  WHERE email = 'shaun.everbridge@gmail.com' 
    AND NOT ('super-admin' = ANY(roles));
    
  IF FOUND THEN
    RAISE NOTICE 'User shaun.everbridge@gmail.com is now a super admin';
  ELSE
    RAISE NOTICE 'User shaun.everbridge@gmail.com not found or already super admin';
  END IF;
END $$;
