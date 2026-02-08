# Agent Template System

## Overview

The Agent Template System allows admins to manage and version AI agent configurations centrally, making it easy to upgrade all clinics using a specific template version.

## Key Concepts

### Template Structure

A template contains:
- **Squad Configuration**: Routing logic and member structure
- **Assistant Configuration**: Behavior settings (first message, end call phrases, recording)
- **Model Configuration**: AI model settings (provider, model name, system prompt, temperature)
- **Tools Configuration**: Custom functions and webhooks

**User-specific settings NOT included:**
- Voice selection
- Knowledge base files
- Phone integration settings

### Template Naming

Templates use an alphanumeric identifier format:
- **Pattern**: `{category}-{version}`
- **Examples**: `receptionist-v1`, `emergency-v2`, `booking-v1.5`

This naming is used as:
1. **Tags** on Vapi assistants
2. **Metadata** in assistant names: `{Clinic Name} - {Template Display Name}`

## Database Schema

```prisma
model AgentTemplate {
  id              String   @id @default(uuid())
  name            String   @unique           // e.g., "receptionist-v1"
  displayName     String                     // e.g., "Receptionist v1"
  description     String?
  version         String                     // e.g., "v1", "v2.1"
  category        String                     // receptionist, emergency, booking
  isDefault       Boolean  @default(false)
  isActive        Boolean  @default(true)
  
  squadConfig     Json                       // Squad routing & structure
  assistantConfig Json                       // Assistant behavior (no voice, no KB)
  toolsConfig     Json?                      // Tools/functions
  modelConfig     Json                       // Model settings & system prompt
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdBy       String?
  
  accounts        Account[]                  // Clinics using this template
}

model Account {
  // ... existing fields ...
  agentTemplateId String?
  agentTemplate   AgentTemplate? @relation(fields: [agentTemplateId], references: [id])
}
```

## Admin UI

### 1. Template List (`/admin/agent-templates`)

**Features:**
- View all templates with usage stats
- See which is marked as default
- Filter by category, status
- Quick actions: Manage, Set Default, Activate/Deactivate

**Display Info:**
- Template name & display name
- Category & version
- Number of clinics using it
- Default & active status badges
- Creation date

**Actions:**
- **Fetch from Squad**: Import config from existing Vapi squad
- **Create Template**: Manually create new template
- **Manage**: View details and assign to clinics

---

### 2. Fetch from Squad (`/admin/agent-templates/fetch`)

**Purpose**: Import configuration from an existing Vapi squad to create a template.

**Workflow:**

**Step 1: Fetch Squad Configuration**
```
Input: Squad ID (e.g., squad-abc123)
↓
[Fetch Button]
↓
Fetches:
- Squad structure & routing
- Assistant(s) configuration
- Model settings
- Tools/functions
↓
Excludes (user-specific):
- Voice settings
- Knowledge base file IDs
- Server URLs with secrets
```

**Step 2: Configure Template**
```
Fields:
- Template Name (Internal)*: receptionist-v1
- Display Name*: Receptionist v1
- Category*: [Dropdown: receptionist, emergency, booking, sales, support, other]
- Version*: v1
- Description: [Optional] What this template does
- Set as Default: [Checkbox]
↓
[Save Template]
```

**Backend Process:**
1. Fetch squad from Vapi API
2. Fetch each assistant in squad
3. Extract configuration (excluding user data)
4. Store in database
5. If set as default, unset other defaults in same category

---

### 3. Template Detail (`/admin/agent-templates/[id]`)

**Sections:**

**A. Template Information**
- Name, display name, description
- Category, version, status
- Created & updated dates
- Usage stats (# of clinics)

**B. Configuration Preview**
- JSON view of:
  - Squad config
  - Assistant config
  - Model config
  - Tools config (if any)

**C. Assign Template**
- Text area for account IDs (comma or newline separated)
- Assign button
- Note: Preserves user settings

**D. Clinics Using Template**
- List of accounts
- Name, email, phone integration status
- Quick link to account details

**Actions Dropdown:**
- Set as Default
- Activate / Deactivate
- Duplicate (future)
- Delete Template

---

### 4. Duplicate Template (`/admin/agent-templates/[id]/duplicate`)

**Future Feature**

Allows creating a new template based on an existing one:
1. Load existing template
2. Pre-fill form with current config
3. User changes name, version, description
4. Creates new template (not linked to original)

Use Case: Creating v2 based on v1 with modifications.

---

## API Endpoints

### Fetch Squad from Vapi
```
POST /api/admin/agent-templates/fetch-squad
Body: { squadId: string }
Returns: {
  squad: { name, members },
  assistant: { firstMessage, endCallMessage, ... },
  model: { provider, model, systemPrompt, ... },
  tools: [...],
  assistantCount: number
}
```

### Create Template
```
POST /api/admin/agent-templates/create
Body: {
  name: string,
  displayName: string,
  description?: string,
  version: string,
  category: string,
  isDefault?: boolean,
  squadConfig: object,
  assistantConfig: object,
  toolsConfig?: object,
  modelConfig: object
}
Returns: { success: true, template }
```

### Assign Template to Clinics
```
POST /api/admin/agent-templates/assign
Body: {
  templateId: string,
  accountIds: string[]
}
Process:
1. Fetch template
2. For each account:
   a. Get current Vapi assistant ID
   b. Update assistant with new template config
   c. Preserve: voice, knowledge base, phone settings
   d. Update account.agentTemplateId
   e. Add metadata: templateVersion, templateName, lastTemplateUpdate
Returns: { success: true, updated: number, total: number }
```

### Set Template as Default
```
POST /api/admin/agent-templates/[id]/set-default
Process:
1. Unset isDefault for all templates in same category
2. Set isDefault = true for this template
```

### Toggle Template Active Status
```
POST /api/admin/agent-templates/[id]/toggle-active
```

### Delete Template
```
DELETE /api/admin/agent-templates/[id]
Note: Only allowed if no clinics are using it
```

---

## Template Upgrade Workflow

### Scenario: Upgrading all clinics from v1 to v2

**Steps:**

1. **Create New Template (v2)**
   - Admin uses "Fetch from Squad" with improved squad
   - Names it `receptionist-v2`
   - Saves as template

2. **Test with One Clinic**
   - Admin assigns `receptionist-v2` to test clinic
   - Verifies functionality
   - Confirms user settings (voice, KB) are preserved

3. **Bulk Upgrade**
   - Admin gets list of all account IDs using `receptionist-v1`
   - SQL query:
     ```sql
     SELECT id FROM accounts 
     WHERE agent_template_id = (
       SELECT id FROM agent_templates WHERE name = 'receptionist-v1'
     );
     ```
   - Copies account IDs to assign form
   - Assigns `receptionist-v2` to all accounts

4. **Verification**
   - Check update count
   - Spot-check a few clinics for correct config
   - Monitor for errors

5. **Rollback (if needed)**
   - Assign `receptionist-v1` back to affected accounts

---

## Version Tagging in Vapi

When creating/updating assistants, the template version is embedded:

**Assistant Name Format:**
```
{Clinic Name} - {Template Display Name}
Example: "Dentia Clinic - Receptionist v2"
```

**Metadata/Tags:**
```json
{
  "templateName": "receptionist-v2",
  "templateVersion": "v2",
  "templateId": "uuid-here",
  "clinicId": "account-uuid"
}
```

This allows:
- Filtering assistants by version in Vapi UI
- Identifying which clinics need upgrades
- Debugging specific template versions

---

## User-Specific Settings Preservation

When assigning a template, these settings are **preserved**:

### Voice Configuration
```json
{
  "provider": "11labs",
  "voiceId": "21m00Tcm4TlvDq8ikWAM",
  "name": "Rachel",
  "gender": "female",
  "accent": "American"
}
```

### Knowledge Base
```json
{
  "knowledgeBaseFileIds": ["file-123", "file-456"]
}
```

### Phone Integration
```json
{
  "phoneNumber": "+15551234567",
  "phoneIntegrationMethod": "sip",
  "vapiPhoneId": "phone-xyz",
  "sipCredentials": { ... }
}
```

### Template Metadata (Added/Updated)
```json
{
  "templateVersion": "v2",
  "templateName": "receptionist-v2",
  "lastTemplateUpdate": "2024-02-07T10:30:00Z"
}
```

---

## Future Enhancements

### 1. Template Versioning History
Track all changes to a template over time:
```prisma
model AgentTemplateVersion {
  id            String
  templateId    String
  version       String
  config        Json
  createdAt     DateTime
  createdBy     String
}
```

### 2. Scheduled Upgrades
Allow admins to schedule template upgrades:
- Select template version
- Select accounts
- Set date/time
- Automated rollout with monitoring

### 3. A/B Testing
Deploy different template versions to different groups:
- Compare performance metrics
- Identify best-performing version
- Gradual rollout based on success

### 4. Template Marketplace
Share templates across organizations:
- Public template library
- Community-contributed templates
- Rating & review system

### 5. Auto-Upgrade Policies
Set rules for automatic upgrades:
- "Always use latest stable"
- "Auto-upgrade minor versions only"
- "Require manual approval for major versions"

---

## Testing Checklist

### Template Creation
- [ ] Fetch squad from Vapi successfully
- [ ] Template name uniqueness enforced
- [ ] Set as default unsets others in category
- [ ] All configuration fields populated
- [ ] Template appears in list

### Template Assignment
- [ ] Assign to single clinic works
- [ ] Assign to multiple clinics works
- [ ] User settings preserved (voice, KB, phone)
- [ ] Vapi assistant updated correctly
- [ ] Account.agentTemplateId updated
- [ ] Metadata added to phoneIntegrationSettings

### Template Management
- [ ] Set as default works
- [ ] Toggle active/inactive works
- [ ] Delete template works (when no clinics using)
- [ ] Delete blocked when clinics using it
- [ ] Template detail page shows all info
- [ ] Configuration JSON displays correctly

### Edge Cases
- [ ] Fetch invalid squad ID (404 error)
- [ ] Assign to non-existent account (skip with warning)
- [ ] Assign to account without deployed agent (skip with warning)
- [ ] Duplicate template names rejected
- [ ] Missing required fields validation

---

## Migration Guide

### Adding Template System to Existing Deployments

1. **Run Database Migration**
   ```bash
   npx prisma migrate deploy
   ```

2. **Create Initial Templates**
   - For each existing agent configuration
   - Fetch from production squad
   - Create template with appropriate version

3. **Link Existing Accounts**
   ```sql
   UPDATE accounts
   SET agent_template_id = (
     SELECT id FROM agent_templates WHERE name = 'receptionist-v1'
   )
   WHERE phone_integration_method IS NOT NULL;
   ```

4. **Verify**
   - Check all accounts have template assigned
   - Verify template usage counts
   - Test template assignment on staging account

---

## Summary

✅ **Templates**: Versioned configurations for AI agents  
✅ **Fetch from Vapi**: Import squad config to create templates  
✅ **Assign**: Apply templates to clinics while preserving user settings  
✅ **Upgrade**: Easily upgrade all clinics from v1 to v2  
✅ **Default**: Mark templates as default for new deployments  
✅ **Admin UI**: Comprehensive management interface  
✅ **API**: Full programmatic access for automation
