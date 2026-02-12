-- Make shaun.everbridge@gmail.com a super admin
-- Note: 'role' is singular enum column

-- Only update if user exists
UPDATE users 
SET role = 'super_admin'
WHERE email = 'shaun.everbridge@gmail.com'
  AND role != 'super_admin';
