# Fix Vapi MCP Server Git Clone Error

## Problem
Vapi MCP server failing with:
```
fatal: could not open '/private/var/folders/.../tmp_pack_h4ZsfL' for reading: No such file or directory
fatal: fetch-pack: invalid index-pack output
```

## Solution

### Step 1: Clean Git Cache and Temp Directories
```bash
# Clean git cache
git gc --prune=now

# Clean npm cache (since it's using npx)
npm cache clean --force

# Clean the temp directory where it's trying to clone
rm -rf /var/folders/xl/c0_hppds7bq48s81_2t_fknm0000gn/T/vapi-docs-repo*

# Or more broadly, clean temp directories (be careful with this)
rm -rf /var/folders/xl/c0_hppds7bq48s81_2t_fknm0000gn/T/*vapi*
```

### Step 2: Check Disk Space
```bash
df -h
```

If disk space is low, free up some space.

### Step 3: Reinstall Vapi MCP Server
```bash
# Clear npx cache for this specific package
rm -rf ~/.npm/_npx/bb212a857bee1253

# Let Cursor reinstall it next time
```

### Step 4: Update Cursor Settings for Vapi MCP

If the issue persists, try using a different cache directory in your MCP config:

**Option 1: Use a specific directory**
```json
{
  "mcpServers": {
    "vapi": {
      "command": "npx",
      "args": ["-y", "@vapi-ai/mcp-docs-server"],
      "env": {
        "HOME": "/Users/shaunk",
        "TMPDIR": "/Users/shaunk/.cache/vapi-mcp"
      }
    }
  }
}
```

Create the cache directory first:
```bash
mkdir -p ~/.cache/vapi-mcp
```

**Option 2: Try a local installation instead of npx**
```bash
# Install globally
npm install -g @vapi-ai/mcp-docs-server

# Then update Cursor config to use the global installation
```

```json
{
  "mcpServers": {
    "vapi": {
      "command": "vapi-mcp-docs-server"
    }
  }
}
```

### Step 5: Restart Cursor

After making changes:
1. Close Cursor completely
2. Reopen Cursor
3. Check the MCP server logs in: Cursor Settings > Features > MCP > View Logs

## Alternative: Manual Documentation Access

If the MCP server continues to fail, you can access Vapi docs directly:
- Web: https://docs.vapi.ai
- Or use WebFetch tool in agent to pull specific API docs as needed

## Verifying the Fix

After the fix, you should see in MCP logs:
```
✅ Vapi MCP server connected
✅ Found X tools, Y prompts, and Z resources
```

Instead of:
```
❌ Failed to fetch docs structure
```
