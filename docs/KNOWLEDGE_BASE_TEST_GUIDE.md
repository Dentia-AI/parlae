# Knowledge Base Upload - Quick Test Guide

## What Was Fixed

Previously, the knowledge base upload was **fake** - files appeared to upload but nothing actually went to Vapi. Now it's **real** - files are uploaded to Vapi and attached to the assistant.

## Quick Test

### 1. Upload a Test File

```bash
# Create a simple test file
echo "Business Hours: Monday-Friday 9AM-5PM
Phone: (555) 123-4567
Services: General Consultation, Emergency Care
Insurance: We accept all major insurance providers" > ~/Downloads/test-knowledge.txt
```

### 2. Run the Setup Wizard

1. **Start dev server** (if not running):
   ```bash
   cd /Users/shaunk/Projects/Parlae-AI/parlae
   ./dev.sh
   ```

2. **Go to setup**:
   - Navigate to: `http://localhost:3000/home/receptionist/setup`

3. **Select voice**:
   - Choose any voice (Rachel recommended)
   - Click "Continue"

4. **Upload knowledge base**:
   - Click "Select Files" or drag & drop
   - Select `test-knowledge.txt` from Downloads
   - **Watch the upload happen in real-time**
   - Should see progress bar → "✓ Uploaded"

5. **Continue to review**:
   - Skip integrations
   - Click "Deploy AI Receptionist"

### 3. Check Logs

You should see in the terminal:

```
[Vapi Upload] Received file upload request
  fileName: "test-knowledge.txt"
  fileType: "text/plain"
  fileSize: 123

[Vapi] Uploading binary file
  fileName: "test-knowledge.txt"

[Vapi] Successfully uploaded binary file
  fileId: "abc123-some-vapi-file-id"

[Receptionist] Creating assistant with knowledge base
  hasFiles: true
  fileCount: 1
  fileIds: ["abc123-some-vapi-file-id"]

[Vapi] Creating assistant
[Vapi] Successfully created assistant
  assistantId: "xyz789"
```

### 4. Verify in Vapi Dashboard

1. Go to: https://dashboard.vapi.ai/
2. Click "Files" in sidebar
3. **Should see `test-knowledge.txt` listed!** ✅
4. Click "Assistants" in sidebar
5. Find your receptionist (should be named like "Test Account - Receptionist")
6. Open the assistant
7. Scroll to "Knowledge Base" section
8. **Should see the file attached!** ✅

### 5. Test with a Call (Optional)

If you have a Twilio phone number configured:

1. Call the receptionist phone number
2. Ask: "What are your business hours?"
3. The AI should respond with: "Monday-Friday 9AM-5PM"
4. This means it's using the knowledge base! ✅

---

## What to Look For

### ✅ Success Indicators

**In UI:**
- Progress bar moves from 0% → 100%
- Status changes to "✓ Uploaded"
- File card shows green/success state
- Toast: "test-knowledge.txt uploaded successfully"

**In Logs:**
- `[Vapi Upload] Received file upload request`
- `[Vapi] Successfully uploaded binary file`
- `[Receptionist] Creating assistant with knowledge base`
- `fileCount: 1` (not 0!)
- `fileIds: ["..."]` (not empty!)

**In Vapi Dashboard:**
- File appears in Files list
- File is attached to assistant
- Assistant shows "Knowledge Base" section

### ❌ Error Indicators

**Upload Failed:**
- Status shows "✗ Upload failed"
- Toast: "Failed to upload..."
- File card shows red/error state

**Not Attached:**
- Logs show `fileCount: 0`
- Logs show `fileIds: []`
- Vapi dashboard shows no files

**Common Causes:**
- Vapi API key not configured
- Network error
- File too large (>10MB)
- Unsupported file type

---

## Quick Fixes

### If upload fails:

1. **Check Vapi API key**:
   ```bash
   grep VAPI_API_KEY .env.local
   ```
   Should show: `VAPI_API_KEY=...`

2. **Check logs for error**:
   Look for `[Vapi Upload] Exception` or `Failed to upload`

3. **Try a smaller file**:
   Create a tiny test file:
   ```bash
   echo "Test" > ~/Downloads/tiny.txt
   ```

4. **Restart dev server**:
   ```bash
   # Ctrl+C to stop
   ./dev.sh
   ```

### If files don't attach to assistant:

1. **Check session storage**:
   - Open browser DevTools
   - Go to Application → Session Storage
   - Find `knowledgeBaseFiles`
   - Should have `[{"id":"vapi-file-id","name":"..."}]`

2. **Check deployment logs**:
   - Look for `[Receptionist] Creating assistant with knowledge base`
   - Verify `fileIds` is not empty

3. **Verify file was uploaded**:
   - Check Vapi dashboard Files section
   - Copy the file ID
   - Compare with logs

---

## File Types to Test

**Recommended test files:**

1. **Text File (.txt)** - Simplest, always works
   ```bash
   echo "Business info here" > test.txt
   ```

2. **PDF (.pdf)** - Most common, good to test
   - Use any existing PDF
   - Or create one in Preview/Word

3. **Word Doc (.docx)** - Common format
   - Create in Microsoft Word or Google Docs

**Avoid for initial test:**
- Very large files (>5MB)
- Complex PDFs with images
- Encrypted documents

---

## Expected Behavior

### Upload Phase
1. User selects file → **Immediate** "Uploading..." status
2. File uploads to `/api/vapi/upload-file` → **~1-2 seconds**
3. API uploads to Vapi → **~2-5 seconds**
4. Returns file ID → **Status: "✓ Uploaded"**

### Deploy Phase
1. User clicks "Deploy" → Assistant creation starts
2. File IDs sent with assistant config → Attached to assistant
3. Assistant created → **Knowledge base active**

### Total Time
- Small file (<1MB): **~3-7 seconds** to upload
- Large file (5MB): **~10-15 seconds** to upload
- Deployment: **~5-10 seconds** for full setup

---

## Troubleshooting Commands

```bash
# Check if formdata-node is installed
pnpm list formdata-node

# View upload API route
cat apps/frontend/apps/web/app/api/vapi/upload-file/route.ts

# Test Vapi API key
curl -H "Authorization: Bearer $VAPI_API_KEY" https://api.vapi.ai/file

# Check session storage (in browser console)
console.log(sessionStorage.getItem('knowledgeBaseFiles'))
```

---

## Summary

**Before:** ❌ Fake upload, no files in Vapi  
**After:** ✅ Real upload, files attached to assistant  

**Key Changes:**
1. Added `VapiService.uploadBinaryFile()` method
2. Created `/api/vapi/upload-file` endpoint
3. Updated knowledge base page to call API
4. Files now have `vapiFileId` stored
5. Deployment uses real Vapi file IDs

**Test Result Expected:**
- ✅ File uploads in ~5 seconds
- ✅ File visible in Vapi dashboard
- ✅ File attached to assistant
- ✅ AI can answer questions from file

**Ready to test!** 🚀
