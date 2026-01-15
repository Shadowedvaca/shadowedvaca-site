# PATT Raid Admin System — Complete Setup Guide

## What You're Getting

A complete raid management system that:

1. **Reads your roster** from Google Sheets
2. **Calculates best raid days** based on who's available
3. **Shows top 3 days** ranked by availability with role breakdown (Tank/Healer/DPS)
4. **Generates Discord commands** for one-click event creation
5. **Flags invalid Discord names** so you can fix them
6. **Supports Discord ID mapping** for future API integration

---

## Files Overview

| File | Purpose |
|------|---------|
| `patt-raid-admin.html` | Main admin dashboard — put on your website |
| `google-apps-script-v2.js` | Updated backend with Discord validation |

---

## Setup Steps

### Step 1: Update Your Google Apps Script

If you already have the roster sheet set up:

1. Go to your Google Sheet → Extensions → Apps Script
2. **Replace** the existing code with `google-apps-script-v2.js`
3. Click Deploy → Manage deployments → Edit (pencil icon)
4. Set version to "New version" and click Deploy
5. Copy the web app URL

If starting fresh:

1. Create a new Google Sheet
2. Go to Extensions → Apps Script
3. Paste the contents of `google-apps-script-v2.js`
4. Deploy as Web App (Execute as: Me, Access: Anyone)
5. Copy the web app URL

### Step 2: Set Up the Admin Dashboard

1. Upload `patt-raid-admin.html` to your GitHub repo (or wherever you host)
2. Open the page in your browser
3. Go to **Settings** tab
4. Enter your Google Apps Script URL
5. Configure your raid defaults (title, time, duration)
6. Click **Save Settings**

### Step 3: First Data Load

1. Go back to **Schedule Raid** tab
2. Click **Refresh** (or it auto-loads)
3. The system will:
   - Pull roster data from your sheet
   - Calculate availability by day
   - Rank the best 3 days
   - Flag any Discord name issues

---

## How It Works

### Availability Calculation

The admin reads the Availability sheet where each member marked which days they can raid:

```
Discord    | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Notes
-----------|-----|-----|-----|-----|-----|-----|-----|-------
Trog       | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |     | Sundays are family time
Shadowvaca | ✓   |     | ✓   |     | ✓   | ✓   |     | 
```

It then:
1. Counts available members per day
2. Looks up each member's Main character for role info
3. Ranks days by total availability
4. Shows role breakdown (Tanks/Healers/DPS) for each day

### Discord Name Validation

When someone enters a Discord name, the system checks:

- Is it at least 2 characters?
- If it has `#`, is the discriminator 4 digits?
- Is it reasonably formatted?

Invalid or missing names get flagged in the **Discord IDs** tab so you can:
- See who has issues
- Add the correct Discord User ID (needed for API signup pre-population)

### Command Generation

When you select a raid day, it generates:

```
/create title:PATT Prog Raid date:2025-01-24 time:21:00 duration:120 template:1
```

Just copy and paste into Discord!

---

## Daily Workflow

**During your current raid:**

1. Open `patt-raid-admin.html`
2. Look at the top 3 recommended days
3. Pick one (check role breakdown looks good)
4. Copy the command
5. Paste in Discord
6. Done!

**If raid days are changing (e.g., Thu/Fri → Fri/Sat):**

1. Have members update their availability in the roster form
2. Refresh the admin dashboard
3. The new best days will appear automatically

---

## Data Sheets Created

The Apps Script creates/manages three sheets:

### 1. Availability
One row per Discord user with their weekly availability.

| Column | Description |
|--------|-------------|
| Discord | Their Discord username |
| Monday-Sunday | TRUE/FALSE for each day |
| Notes | Any scheduling notes |
| Updated | Last update timestamp |

### 2. Characters
Multiple rows per user (mains and alts).

| Column | Description |
|--------|-------------|
| Discord | Discord username |
| Character | In-game character name |
| Class | WoW class |
| Spec | Specialization |
| Role | Tank/Healer/DPS |
| Main/Alt | Which is their main |
| Updated | Last update timestamp |

### 3. DiscordIDs
Maps Discord names to User IDs (for API integration).

| Column | Description |
|--------|-------------|
| Discord Name | The name they entered |
| Discord User ID | Their actual 18-digit ID |
| Status | Verified/Pending ID/Invalid Format |
| Updated | Last update timestamp |

---

## Advanced: API Integration

If you want to use the Raid-Helper API to automatically add signups:

1. Get your Raid-Helper API key from https://raid-helper.dev/user
2. Get your Server ID, Channel ID, Voice Channel ID from Discord (Developer Mode)
3. Enter these in the Settings tab
4. For each roster member, add their Discord User ID in the Discord IDs tab

The system can then generate API calls to pre-populate signups. However, browser CORS restrictions may require you to run these via curl or a proxy.

---

## Troubleshooting

### "Not connected" status
- Check that your Apps Script URL is correct
- Make sure you deployed as a Web App with "Anyone" access
- Try redeploying with a new version

### No availability data showing
- Members need to fill out the roster form first
- Check the Availability sheet in Google Sheets directly
- Make sure the column names match exactly (case-sensitive)

### Discord name flagged incorrectly
- Go to Discord IDs tab
- Add the correct Discord User ID for that member
- The system will mark them as "Verified"

### Commands not working in Discord
- Make sure Raid-Helper bot is in your server
- Check you have the manager role for Raid-Helper
- Try the command in the correct signup channel

---

## Future Enhancements

Things we can add later:

- [ ] Actual API integration to create events programmatically
- [ ] Auto-add signups as Tentative/Absent via API
- [ ] Pull attendance history from Raid-Helper
- [ ] Sync with WoW guild roster via Battle.net API
- [ ] Calendar view of scheduled raids

---

## Quick Reference

**Roster form URL:** `https://your-site.com/roster.html`

**Admin dashboard URL:** `https://your-site.com/patt-raid-admin.html`

**Manual command format:**
```
/create title:PATT Prog Raid date:YYYY-MM-DD time:21:00 duration:120 template:1
```

**To get Discord User ID:**
1. Enable Developer Mode in Discord (Settings → App Settings → Advanced)
2. Right-click user → Copy User ID
