# Admin Impersonation Quick Start

## Setup (One-time)

### 1. Run Database Migration

```bash
cd dentia/packages/prisma
pnpm prisma migrate deploy
```

### 2. Create Super Admin User

Update an existing user to super admin role:

```sql
UPDATE users 
SET role = 'super_admin' 
WHERE email = 'your-admin@example.com';
```

Or create a new super admin (requires existing Cognito user):

```sql
INSERT INTO users (id, email, role) 
VALUES (
  gen_random_uuid(), 
  'superadmin@example.com', 
  'super_admin'
);
```

### 3. Create Regular Admin User (Optional)

```sql
UPDATE users 
SET role = 'admin' 
WHERE email = 'regular-admin@example.com';
```

## Usage

### As Super Admin

1. **Access Admin Panel**
   ```
   Navigate to: /admin/accounts
   ```

2. **Search for User**
   - Type in search box (searches name, email, owner)
   - Results update automatically

3. **Start Impersonation**
   - Click "Impersonate" button next to any account
   - You'll be redirected to `/home` as that user
   - Yellow banner appears at top

4. **End Impersonation**
   - Click "Return to Admin" in yellow banner
   - Returns to `/admin/accounts`

### As Regular Admin (Need User Permission)

1. **Request Access from User**
   - Ask user to grant you access via settings

2. **User Grants Access**
   ```
   User navigates to: /home/[account]/settings/admin-access
   - Click "Grant Access"
   - Search for your email
   - Select you and click "Grant Access"
   ```

3. **Impersonate User**
   ```
   Navigate to: /admin/accounts
   - Search for the user who granted access
   - Click "Impersonate"
   ```

4. **End Session**
   - Click "Return to Admin" in banner
   - **Your access is automatically revoked**
   - Need new permission to impersonate again

### As User (Managing Admin Access)

1. **View Admin Access Settings**
   ```
   Navigate to: /home/[account]/settings/admin-access
   ```

2. **Grant Access to Admin**
   - Click "Grant Access" button
   - Search for admin by email/name
   - Select admin from results
   - Optionally add notes
   - Click "Grant Access"

3. **Revoke Admin Access**
   - Find admin in "Active Admin Access" table
   - Click "Revoke" button
   - Confirms revocation and ends any active sessions

## Key Routes

| Route | Description | Access |
|-------|-------------|--------|
| `/admin/accounts` | Admin accounts list | Admin, Super Admin |
| `/home/[account]/settings/admin-access` | Manage admin access | Account Owner |

## Quick Commands

### Check User Role
```sql
SELECT id, email, role FROM users WHERE email = 'user@example.com';
```

### List All Admins
```sql
SELECT id, email, role FROM users WHERE role IN ('admin', 'super_admin');
```

### View Active Impersonation Sessions
```sql
SELECT 
  s.id,
  a.email as admin_email,
  t.email as target_email,
  s.started_at,
  s.is_active
FROM impersonation_sessions s
JOIN users a ON s.admin_id = a.id
JOIN users t ON s.target_user_id = t.id
WHERE s.is_active = true;
```

### View Admin Access Grants
```sql
SELECT 
  aa.id,
  admin.email as admin_email,
  granter.email as granted_by_email,
  aa.granted_at,
  aa.is_revoked
FROM admin_access aa
JOIN users admin ON aa.admin_id = admin.id
JOIN users granter ON aa.granted_by_user_id = granter.id
WHERE aa.is_revoked = false;
```

### Manually Revoke Admin Access
```sql
UPDATE admin_access 
SET is_revoked = true, revoked_at = NOW() 
WHERE admin_id = 'ADMIN_USER_ID' 
AND granted_by_user_id = 'GRANTER_USER_ID';
```

### End Impersonation Session
```sql
UPDATE impersonation_sessions 
SET is_active = false, ended_at = NOW() 
WHERE session_token = 'SESSION_TOKEN';
```

## Troubleshooting

### Cannot access `/admin/accounts`
- Verify user role is `admin` or `super_admin`
- Check authentication is working
- Clear browser cache and cookies

### "You do not have permission to impersonate"
- **Super Admin:** Cannot impersonate other super admins
- **Regular Admin:** User must grant you access first
- Check admin access table for active grant

### Impersonation banner not showing
- Check browser console for errors
- Verify impersonation cookie exists
- Check session is active in database

### Access not auto-revoking
- Only applies to regular admins (not super admins)
- Verify `auto_revoke_access` flag is true in session
- Check if session ended properly

## Security Notes

- Impersonation sessions expire after 24 hours
- Only one active session per admin at a time
- All sessions are logged with timestamps
- HTTP-only cookies prevent XSS attacks
- Super admins cannot impersonate each other

## Next Steps

- Read full documentation: `docs/ADMIN_IMPERSONATION_GUIDE.md`
- Review code implementation in `dentia/apps/frontend/apps/web/`
- Test all user flows with the testing checklist
- Configure monitoring for admin actions

