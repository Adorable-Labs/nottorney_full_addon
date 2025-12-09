# Continuous Syncing & Versioning Capabilities

## What the Nottorney Addon Enables for Lovable

The Nottorney addon implementation **fully supports continuous syncing and versioning** of decks. This allows Lovable to build a system where decks can be updated over time and users automatically receive those updates.

---

## ✅ Continuous Syncing Features

### 1. **Timestamp-Based Incremental Updates**

The addon can fetch only changes since the last sync:

```python
# Addon calls:
client.get_deck_updates(
    deck_id="deck-uuid",
    since=datetime(2024, 12, 1, 14, 30, 0),  # Last sync time
    download_full_deck=False
)

# Backend returns only notes changed after that timestamp
```

**What Lovable Can Do:**
- Track `updated_at` timestamp for each note in database
- Query: `SELECT * FROM notes WHERE updated_at > $since`
- Return only changed notes (not entire deck)
- Efficient - only syncs what changed

### 2. **Automatic Version Tracking**

The addon tracks the latest update timestamp:

```python
# Addon receives:
DeckUpdates(
    notes=[...],  # Only changed notes
    latest_update=datetime(2024, 12, 15, 10, 0, 0),  # New version timestamp
    protected_fields={...},
    protected_tags=[...]
)

# Addon saves this timestamp for next sync
config.save_latest_deck_update(deck_id, latest_update)
```

**What Lovable Can Do:**
- Store version timestamps in database
- Track when each deck was last updated
- Users always get the latest version
- No manual version numbers needed

### 3. **Pagination for Large Decks**

Handles decks with thousands of notes efficiently:

```python
# Backend paginates responses:
{
  "notes": "...",  # Base85-encoded, gzipped (2000 notes)
  "latest_update": "2024-12-15T10:00:00.000000+00:00",
  "next": "/decks/{id}/updates?cursor=abc123"  # Next page
}
```

**What Lovable Can Do:**
- Process large decks in chunks (2000 notes per page)
- Use cursor-based pagination
- Efficient database queries with LIMIT/OFFSET
- Handle decks with 10,000+ notes

### 4. **Media File Synchronization**

Syncs images, audio, and other media separately:

```python
# Addon calls:
client.get_deck_media_updates(
    deck_id="deck-uuid",
    since=datetime(2024, 12, 1, 14, 30, 0)
)

# Backend returns:
{
  "media": [
    {
      "name": "image123.png",
      "file_content_hash": "abc123...",
      "modified": "2024-12-15T10:00:00.000000+00:00",
      "download_enabled": true
    }
  ],
  "latest_update": "2024-12-15T10:00:00.000000+00:00"
}
```

**What Lovable Can Do:**
- Track media file changes separately from notes
- Use file hashes to detect changes
- Only download new/updated media files
- Store media in Supabase Storage

### 5. **Note Type Versioning**

Syncs card templates separately from notes:

```python
# Addon calls:
client.get_note_types_dict_for_deck(deck_id)

# Backend returns note type definitions:
{
  "1234567890": {
    "anki_id": 1234567890,
    "name": "Cloze",
    "fields": [...],
    "templates": [...]
  }
}
```

**What Lovable Can Do:**
- Store note types (card templates) separately
- Update templates without re-downloading all notes
- Version note types independently
- Handle template changes gracefully

### 6. **Protected Fields/Tags**

Preserves user customizations during sync:

```python
# Backend returns:
{
  "protected_fields": {
    "1234567890": ["Extra", "Personal Notes"]  # Don't overwrite these
  },
  "protected_tags": ["#myedits", "#personal"]  # Don't remove these
}
```

**What Lovable Can Do:**
- Define which fields users can customize
- Preserve user edits during updates
- Allow selective syncing (some fields sync, others don't)
- Better user experience

### 7. **Deck Extensions (Optional Tags)**

Supports optional tag groups that users can subscribe to:

```python
# Addon calls:
client.get_deck_extensions()
client.get_deck_extension_updates(extension_id, since=...)

# Backend returns:
{
  "note_customizations": [
    {
      "note": "note-uuid",
      "tags": ["#AK_Overhaul::Cardiology"]
    }
  ]
}
```

**What Lovable Can Do:**
- Offer optional tag groups (e.g., "AnKing Overhaul Tags")
- Users can subscribe to additional organization systems
- Sync optional tags separately from core deck
- Enable community-driven organization

---

## 🔄 How Continuous Syncing Works

### Sync Flow

```
1. User opens Anki → Addon checks for updates
   ↓
2. Addon calls: GET /decks/{id}/updates?since=2024-12-01T14:30:00
   ↓
3. Lovable backend queries database:
   SELECT * FROM notes 
   WHERE product_id = $deck_id 
   AND updated_at > '2024-12-01T14:30:00'
   ORDER BY updated_at
   LIMIT 2000
   ↓
4. Backend returns only changed notes (compressed)
   ↓
5. Addon applies updates to local Anki collection
   ↓
6. Addon saves new latest_update timestamp
   ↓
7. Next sync uses new timestamp (only gets newer changes)
```

### Version Tracking

```sql
-- Lovable tracks versions in database:
notes table:
  - updated_at: When note was last modified
  - created_at: When note was created
  - last_update_type: 'updated_content', 'delete', etc.

-- Each sync query:
SELECT * FROM notes 
WHERE updated_at > $last_sync_time
-- Returns only notes that changed since last sync
```

---

## 📊 What This Enables

### For Deck Creators

1. **Update Decks Over Time**
   - Fix errors in existing cards
   - Add new cards to deck
   - Update card content
   - Remove outdated cards
   - Users automatically get updates

2. **Version Control**
   - Track all changes with timestamps
   - See what changed when
   - Rollback if needed
   - Maintain change history

3. **Collaborative Editing**
   - Multiple maintainers can update deck
   - Changes tracked by timestamp
   - Users get all updates automatically

### For Users

1. **Always Up-to-Date Decks**
   - Sync button gets latest changes
   - No need to re-download entire deck
   - Only changed cards are updated
   - Fast sync (seconds, not minutes)

2. **Preserve Customizations**
   - Protected fields keep user edits
   - Protected tags aren't removed
   - User changes preserved during sync

3. **Optional Features**
   - Subscribe to deck extensions
   - Get additional organization tags
   - Customize without breaking sync

---

## 🎯 Real-World Example

### Scenario: Medical School Deck Updates

**Day 1**: User purchases "USMLE Step 1 Deck" (30,000 cards)
- Downloads full deck via `.apkg` file
- Starts studying

**Day 30**: Creator fixes 50 typos, adds 200 new cards
- Creator uploads updates to Lovable backend
- Backend stores changes with `updated_at = now()`

**Day 31**: User clicks "Sync" in addon
- Addon calls: `GET /decks/{id}/updates?since=2024-11-01T00:00:00`
- Backend returns: 50 updated notes + 200 new notes (250 total)
- Addon applies only these 250 changes (not all 30,000)
- Sync completes in 10 seconds

**Day 60**: Creator updates 100 cards, adds 50 more
- User syncs again
- Gets only 150 changes (100 updates + 50 new)
- Fast sync again

**Result**: User always has latest version without re-downloading entire deck

---

## 💾 Database Requirements for Continuous Sync

Lovable needs to track:

```sql
-- Notes table with versioning
CREATE TABLE notes (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  anki_id BIGINT,
  fields JSONB,
  tags TEXT[],
  updated_at TIMESTAMPTZ DEFAULT now(),  -- ⭐ Key for incremental sync
  created_at TIMESTAMPTZ DEFAULT now(),
  last_update_type TEXT  -- 'updated_content', 'delete', etc.
);

-- Index for fast queries
CREATE INDEX idx_notes_updated_at ON notes(product_id, updated_at);

-- Query for incremental sync:
SELECT * FROM notes 
WHERE product_id = $deck_id 
  AND updated_at > $since
ORDER BY updated_at
LIMIT 2000;
```

---

## 🚀 Implementation Priority

### Phase 1: Basic Purchase/Download (Current)
- ✅ User purchases deck
- ✅ Downloads `.apkg` file
- ✅ One-time import
- ❌ No updates after purchase

### Phase 2: Continuous Syncing (What Addon Supports)
- ✅ Incremental note updates
- ✅ Media file sync
- ✅ Note type versioning
- ✅ Protected fields/tags
- ✅ Deck extensions

**The addon is ready for Phase 2** - it just needs Lovable to implement the sync endpoints.

---

## 📝 Summary

**Yes, the Nottorney addon enables continuous syncing and versioning!**

**What Lovable Can Build:**
1. ✅ **Incremental Updates** - Only sync changed notes (not entire deck)
2. ✅ **Version Tracking** - Timestamp-based versioning (no manual version numbers)
3. ✅ **Efficient Syncing** - Pagination handles large decks (10,000+ notes)
4. ✅ **Media Sync** - Separate sync for images/audio files
5. ✅ **Template Updates** - Update card templates independently
6. ✅ **User Customization** - Protected fields/tags preserve user edits
7. ✅ **Optional Features** - Deck extensions for additional organization

**The addon implementation is complete** - Lovable just needs to:
- Store notes with `updated_at` timestamps
- Implement `GET /decks/{id}/updates` endpoint
- Query database for changes since last sync
- Return paginated, compressed updates

This enables a **Netflix-style** experience: users purchase once, get continuous updates forever.

