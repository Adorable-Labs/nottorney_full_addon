# What the Nottorney Addon Enables for Lovable

## Executive Summary

The Nottorney addon implementation **fully supports continuous syncing and versioning**. This enables Lovable to build a system where:

1. **Users purchase decks once** → Get continuous updates forever
2. **Deck creators can update content** → Users automatically receive updates
3. **Efficient syncing** → Only changed content is downloaded (not entire deck)
4. **Version tracking** → Automatic versioning via timestamps (no manual version numbers)

---

## 🎯 Core Capabilities Enabled

### 1. Continuous Syncing ✅

**What It Means:**
- Users can sync their purchased decks to get latest updates
- Only changed notes are downloaded (not entire deck)
- Fast sync times (seconds, not minutes)
- Works for decks with 10,000+ notes

**How It Works:**
```python
# Addon tracks last sync time
last_sync = config.deck_config(deck_id).latest_update
# Example: 2024-12-01T14:30:00.000000+00:00

# Addon requests updates since last sync
updates = client.get_deck_updates(
    deck_id=deck_id,
    since=last_sync  # Only get changes after this time
)

# Backend returns only changed notes
# If 30,000 card deck, but only 50 cards changed → only 50 cards downloaded
```

**What Lovable Needs to Do:**
- Store `updated_at` timestamp for each note
- Query: `SELECT * FROM notes WHERE updated_at > $since`
- Return only changed notes (paginated, compressed)

---

### 2. Automatic Versioning ✅

**What It Means:**
- No manual version numbers needed (v1.0, v1.1, etc.)
- Timestamps automatically track versions
- Each sync gets the "latest" version
- Version history is preserved in database

**How It Works:**
```python
# Each note has version timestamp
notes table:
  - updated_at: "2024-12-15T10:00:00.000000+00:00"  # Version timestamp

# Addon tracks latest version seen
config.save_latest_deck_update(deck_id, latest_update)

# Next sync starts from that version
# Automatically gets "next version" (anything newer)
```

**What Lovable Needs to Do:**
- Update `notes.updated_at` when note changes
- Return `latest_update` timestamp in API response
- No version numbers needed - timestamps are versions

---

### 3. Incremental Updates ✅

**What It Means:**
- First sync: Downloads full deck (if needed)
- Subsequent syncs: Only changed content
- Efficient bandwidth usage
- Fast sync times

**How It Works:**
```python
# First time (no previous sync)
updates = client.get_deck_updates(deck_id, since=None)
# Returns: All notes (or full CSV download)

# Second time (after 1 week)
updates = client.get_deck_updates(deck_id, since=last_week)
# Returns: Only notes changed in past week

# Third time (after 1 day)
updates = client.get_deck_updates(deck_id, since=yesterday)
# Returns: Only notes changed today
```

**What Lovable Needs to Do:**
- Support `since=None` for full deck download
- Support `since=timestamp` for incremental updates
- Efficient database queries with indexed timestamps

---

### 4. Media File Synchronization ✅

**What It Means:**
- Images, audio files sync separately from notes
- Only new/changed media files downloaded
- Hash-based change detection
- Efficient media management

**How It Works:**
```python
# Addon syncs media separately
media_updates = client.get_deck_media_updates(
    deck_id=deck_id,
    since=last_media_sync
)

# Backend returns:
{
  "media": [
    {
      "name": "image123.png",
      "file_content_hash": "abc123...",  # Detects changes
      "modified": "2024-12-15T10:00:00.000000+00:00",
      "download_enabled": true
    }
  ]
}
```

**What Lovable Needs to Do:**
- Store media files in Supabase Storage
- Track `modified` timestamp for each file
- Calculate file hashes for change detection
- Generate presigned URLs for downloads

---

### 5. Note Type Versioning ✅

**What It Means:**
- Card templates (note types) can be updated
- Templates sync separately from notes
- Users get updated card formats
- Handles template changes gracefully

**How It Works:**
```python
# Addon fetches note types
note_types = client.get_note_types_dict_for_deck(deck_id)

# Backend returns:
{
  "1234567890": {
    "anki_id": 1234567890,
    "name": "Cloze",
    "fields": [...],  # Field definitions
    "templates": [...]  # Card templates
  }
}
```

**What Lovable Needs to Do:**
- Store note types in `note_types` table
- Update templates when deck creator changes them
- Return note type definitions in API

---

### 6. Protected Fields/Tags ✅

**What It Means:**
- Users can customize some fields without breaking sync
- Protected fields preserve user edits
- Protected tags aren't removed during sync
- Better user experience

**How It Works:**
```python
# Backend defines protected fields
protected_fields = {
  "1234567890": ["Extra", "Personal Notes"]  # Don't overwrite these
}

# During sync:
# - Sync updates "Front" and "Back" fields
# - Preserves "Extra" and "Personal Notes" (user's edits)
```

**What Lovable Needs to Do:**
- Store protected field definitions per deck
- Return in API response
- Addon handles protection logic

---

### 7. Deck Extensions (Optional Tags) ✅

**What It Means:**
- Optional tag groups users can subscribe to
- Additional organization systems
- Sync separately from core deck
- Community-driven features

**How It Works:**
```python
# User subscribes to "AnKing Overhaul Tags" extension
extensions = client.get_deck_extensions()

# Sync extension tags
extension_updates = client.get_deck_extension_updates(
    extension_id=123,
    since=last_sync
)
```

**What Lovable Needs to Do:**
- Store deck extensions in database
- Track extension tag customizations
- Sync separately from core deck

---

## 📊 Comparison: Static vs. Continuous Sync

| Feature | Static Deck (Phase 1) | Continuous Sync (Phase 2) |
|---------|----------------------|---------------------------|
| **Initial Download** | Full `.apkg` file | Full deck (CSV or `.apkg`) |
| **Updates** | ❌ None | ✅ Incremental updates |
| **Sync Time** | N/A | Seconds (only changes) |
| **Bandwidth** | Full deck each time | Only changed content |
| **Versioning** | Manual (v1.0, v1.1) | Automatic (timestamps) |
| **Media Updates** | ❌ None | ✅ Separate media sync |
| **Template Updates** | ❌ None | ✅ Note type versioning |
| **User Edits** | ❌ Lost on re-download | ✅ Protected fields/tags |

---

## 🎬 Real-World Use Cases

### Use Case 1: Medical School Deck

**Scenario:**
- Deck: "USMLE Step 1" (30,000 cards)
- Creator updates deck monthly with new research
- Users want latest medical information

**With Continuous Sync:**
1. User purchases deck (downloads 30,000 cards once)
2. Creator adds 200 new cards, fixes 50 typos
3. User clicks "Sync" → Gets 250 changes in 10 seconds
4. User always has latest medical information

**Without Continuous Sync:**
1. User purchases deck
2. Creator updates deck
3. User must re-download entire 30,000 card deck
4. User loses all customizations
5. Slow download (minutes)

### Use Case 2: Language Learning Deck

**Scenario:**
- Deck: "Spanish Vocabulary" (5,000 cards)
- Creator adds audio pronunciations
- Users want updated audio files

**With Continuous Sync:**
1. User purchases deck
2. Creator adds audio files to 1,000 cards
3. User syncs → Only new audio files download
4. Fast media sync

**Without Continuous Sync:**
1. User must re-download entire deck
2. Slow download
3. Loses progress/customizations

---

## 🔧 Technical Implementation

### Database Schema for Continuous Sync

```sql
-- Notes with versioning
CREATE TABLE notes (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  anki_id BIGINT,
  note_type_id BIGINT,
  fields JSONB,
  tags TEXT[],
  guid TEXT,
  last_update_type TEXT,  -- 'updated_content', 'delete', etc.
  updated_at TIMESTAMPTZ DEFAULT now(),  -- ⭐ Version timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast incremental queries
CREATE INDEX idx_notes_sync 
ON notes(product_id, updated_at);

-- Query for incremental sync
SELECT * FROM notes 
WHERE product_id = $deck_id 
  AND updated_at > $since
ORDER BY updated_at
LIMIT 2000;
```

### API Endpoint Implementation

```typescript
// GET /decks/{id}/updates
export async function getDeckUpdates(deckId: string, since: string | null) {
  const query = supabase
    .from('notes')
    .select('*')
    .eq('product_id', deckId)
    .order('updated_at', { ascending: true })
    .limit(2000);
  
  if (since) {
    query.gt('updated_at', since);  // Only changes after timestamp
  }
  
  const { data: notes } = await query;
  
  // Compress and encode
  const compressed = compressNotes(notes);
  
  return {
    notes: compressed,  // Base85-encoded, gzipped
    latest_update: notes[notes.length - 1]?.updated_at,
    protected_fields: await getProtectedFields(deckId),
    protected_tags: await getProtectedTags(deckId),
    next: hasMore ? cursor : null
  };
}
```

---

## ✅ Summary

**The Nottorney addon enables Lovable to build:**

1. ✅ **Continuous Syncing** - Users get updates automatically
2. ✅ **Automatic Versioning** - Timestamp-based (no manual versions)
3. ✅ **Incremental Updates** - Only changed content downloaded
4. ✅ **Efficient Syncing** - Fast sync times (seconds)
5. ✅ **Media Synchronization** - Separate media file updates
6. ✅ **Template Versioning** - Card templates can be updated
7. ✅ **User Customization** - Protected fields/tags preserve edits
8. ✅ **Optional Features** - Deck extensions for additional organization

**The addon implementation is complete** - it supports all these features. Lovable just needs to:

1. Store notes with `updated_at` timestamps
2. Implement sync endpoints (`GET /decks/{id}/updates`)
3. Query database for changes since last sync
4. Return paginated, compressed updates

**Result**: Users purchase once, get continuous updates forever (like Netflix, but for Anki decks).

