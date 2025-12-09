# AnkiHub Capabilities Decision Guide for Nottorney

## Complete Feature Analysis & Recommendations

This document lists all AnkiHub addon capabilities and helps you decide which to implement in Nottorney based on your use case.

---

## 📋 Complete AnkiHub Feature List

### 🔴 CORE SYNC FEATURES (Essential for Continuous Updates)

#### 1. **Incremental Deck Updates** ⭐ ESSENTIAL
**What it does:**
- Syncs only changed notes since last sync
- Uses timestamp-based versioning
- Paginated (2000 notes per page)

**Nottorney Implementation Status:** ✅ **Already Implemented**
- `get_deck_updates()` method exists
- Supports `since` parameter
- Handles pagination

**Recommendation:** ✅ **IMPLEMENT**
- **Why:** Core feature for continuous updates
- **Complexity:** Medium (database queries + compression)
- **Value:** High - enables "Netflix-style" updates

---

#### 2. **Media File Synchronization** ⭐ ESSENTIAL
**What it does:**
- Syncs images/audio separately from notes
- Hash-based change detection
- Background download

**Nottorney Implementation Status:** ✅ **Already Implemented**
- `get_deck_media_updates()` method exists
- `download_media()` method exists

**Recommendation:** ✅ **IMPLEMENT**
- **Why:** Essential for decks with images/audio
- **Complexity:** Medium (storage + hash tracking)
- **Value:** High - users need updated media

---

#### 3. **Note Type Management** ⭐ ESSENTIAL
**What it does:**
- Syncs card templates separately
- Updates templates without re-downloading notes
- Handles template changes gracefully

**Nottorney Implementation Status:** ✅ **Already Implemented**
- `get_note_types_dict_for_deck()` method exists

**Recommendation:** ✅ **IMPLEMENT**
- **Why:** Templates need to be updatable
- **Complexity:** Low (just return note type definitions)
- **Value:** High - enables template improvements

---

#### 4. **Protected Fields/Tags** ⭐ ESSENTIAL
**What it does:**
- Preserves user customizations during sync
- Some fields don't sync (user edits preserved)
- Protected tags aren't removed

**Nottorney Implementation Status:** ✅ **Already Implemented**
- `get_protected_fields()` method exists
- `get_protected_tags()` method exists

**Recommendation:** ✅ **IMPLEMENT**
- **Why:** Critical for user experience
- **Complexity:** Low (just return config)
- **Value:** Very High - users hate losing edits

---

### 🟡 COLLABORATIVE FEATURES (Nice-to-Have)

#### 5. **Suggestion System** ⚠️ DECISION NEEDED
**What it does:**
- Users can suggest changes to deck content
- Suggestions reviewed by deck creator
- Collaborative editing workflow

**AnkiHub Methods:**
- `create_change_note_suggestion()` - Suggest changes to existing notes
- `create_new_note_suggestion()` - Suggest new notes
- `create_suggestions_in_bulk()` - Bulk suggestions

**Nottorney Implementation Status:** ❌ **Not Implemented**

**Recommendation:** ⚠️ **DECIDE BASED ON USE CASE**

**Implement If:**
- ✅ You want community-driven improvements
- ✅ Deck creators want user feedback
- ✅ You want collaborative editing
- ✅ You have moderation/review system

**Skip If:**
- ❌ Decks are creator-only (no user contributions)
- ❌ You want simpler system
- ❌ No moderation resources
- ❌ Focus is on purchase/download only

**Complexity:** High (requires review workflow, moderation UI)
**Value:** Medium (nice feature, but not essential)

---

#### 6. **Deck Extensions (Optional Tags)** ⚠️ DECISION NEEDED
**What it does:**
- Optional tag groups users can subscribe to
- Additional organization systems
- Community-driven features

**Nottorney Implementation Status:** ✅ **Already Implemented**
- `get_deck_extensions()` method exists
- `get_deck_extension_updates()` method exists

**Recommendation:** ⚠️ **DECIDE BASED ON USE CASE**

**Implement If:**
- ✅ You want optional features users can add
- ✅ Community wants additional organization
- ✅ You have tag group creators

**Skip If:**
- ❌ Decks are complete as-is
- ❌ No need for optional features
- ❌ Simpler is better

**Complexity:** Medium (tag management + sync)
**Value:** Low-Medium (nice feature, but niche)

---

### 🟢 USER EXPERIENCE FEATURES

#### 7. **Deck Subscriptions** ✅ ESSENTIAL
**What it does:**
- Users subscribe to decks for continuous updates
- Manage subscription list
- Unsubscribe from decks

**Nottorney Implementation Status:** ✅ **Already Implemented**
- `get_deck_subscriptions()` method exists
- `subscribe_to_deck()` / `unsubscribe_from_deck()` methods exist

**Recommendation:** ✅ **IMPLEMENT**
- **Why:** Core to continuous sync model
- **Complexity:** Low (just database records)
- **Value:** High - enables sync workflow

---

#### 8. **Pending Notes Actions** ⚠️ OPTIONAL
**What it does:**
- Backend can trigger actions (e.g., unsuspend cards)
- Useful for special deck features

**Nottorney Implementation Status:** ✅ **Already Implemented**
- `get_pending_notes_actions_for_deck()` method exists

**Recommendation:** ⚠️ **OPTIONAL**
- **Why:** Useful for special features
- **Complexity:** Low
- **Value:** Low (niche use case)

---

### 🔵 ANALYTICS & TRACKING (Optional)

#### 9. **Card Review Data** ⚠️ OPTIONAL
**What it does:**
- Sends user study statistics to backend
- Tracks review activity
- Analytics for deck creators

**AnkiHub Methods:**
- `send_card_review_data()` - Send review statistics
- `send_daily_card_review_summaries()` - Daily summaries

**Nottorney Implementation Status:** ❌ **Not Implemented**

**Recommendation:** ⚠️ **OPTIONAL**
- **Why:** Privacy concerns, not essential
- **Complexity:** Medium (data collection + privacy)
- **Value:** Low (nice for analytics, but not essential)

**Implement If:**
- ✅ You want analytics for deck creators
- ✅ Users opt-in to data sharing
- ✅ You have privacy policy

**Skip If:**
- ❌ Privacy-first approach
- ❌ Not essential for core functionality
- ❌ GDPR/compliance concerns

---

### 🟣 DECK CREATION FEATURES (Creator Tools)

#### 10. **Deck Upload** ⚠️ DECISION NEEDED
**What it does:**
- Creators upload decks to AnkiHub
- Converts Anki deck to AnkiHub format
- Initial deck creation workflow

**AnkiHub Methods:**
- `upload_deck()` - Upload new deck
- `upload_media()` - Upload media files

**Nottorney Implementation Status:** ❌ **Not Implemented**

**Recommendation:** ⚠️ **DECIDE BASED ON WORKFLOW**

**Implement If:**
- ✅ Creators upload via addon
- ✅ You want addon-based upload workflow

**Skip If:**
- ✅ Creators upload via web app (recommended)
- ✅ Web app handles all uploads
- ✅ Addon is consumer-only

**Complexity:** High (upload + conversion logic)
**Value:** Medium (convenient, but web app can do this)

**Recommendation:** **SKIP** - Use web app for uploads instead

---

#### 11. **Note Type Creation/Updates** ⚠️ DECISION NEEDED
**What it does:**
- Creators can create/update note types via API
- Template management

**AnkiHub Methods:**
- `create_note_type()` - Create new note type
- `update_note_type()` - Update existing note type

**Nottorney Implementation Status:** ❌ **Not Implemented**

**Recommendation:** ⚠️ **DECIDE BASED ON WORKFLOW**

**Implement If:**
- ✅ Creators manage note types via API
- ✅ Programmatic note type management

**Skip If:**
- ✅ Note types managed via web app
- ✅ Note types included in deck upload

**Recommendation:** **SKIP** - Handle via web app/deck upload

---

### 🟠 ADVANCED FEATURES (Advanced)

#### 12. **Feature Flags** ⚠️ OPTIONAL
**What it does:**
- Backend controls feature availability
- A/B testing
- Gradual feature rollouts

**AnkiHub Methods:**
- `get_feature_flags()` - Get available features

**Nottorney Implementation Status:** ❌ **Not Implemented**

**Recommendation:** ⚠️ **OPTIONAL**
- **Why:** Useful for gradual rollouts
- **Complexity:** Low
- **Value:** Low (nice-to-have, not essential)

---

#### 13. **User Details** ⚠️ OPTIONAL
**What it does:**
- Get user account information
- Check user permissions
- Profile data

**AnkiHub Methods:**
- `get_user_details()` - Get user info

**Nottorney Implementation Status:** ❌ **Not Implemented**

**Recommendation:** ⚠️ **OPTIONAL**
- **Why:** Useful for account management
- **Complexity:** Low
- **Value:** Low (can get from login response)

---

## 🎯 Recommended Implementation Plan

### Phase 1: Essential Sync Features (Must Have)

✅ **IMPLEMENT:**
1. ✅ Incremental Deck Updates (`get_deck_updates`)
2. ✅ Media File Synchronization (`get_deck_media_updates`)
3. ✅ Note Type Management (`get_note_types_dict_for_deck`)
4. ✅ Protected Fields/Tags (`get_protected_fields`, `get_protected_tags`)
5. ✅ Deck Subscriptions (`get_deck_subscriptions`, `subscribe_to_deck`)

**Why:** These are core to continuous syncing. Without these, you can't provide updates to users.

**Complexity:** Medium
**Timeline:** 2-3 weeks
**Value:** Very High

---

### Phase 2: Optional Features (Nice to Have)

⚠️ **DECIDE:**
1. ⚠️ Suggestion System - Only if you want collaborative editing
2. ⚠️ Deck Extensions - Only if you want optional tag groups
3. ⚠️ Pending Notes Actions - Only if you need special features

**Why:** These add value but aren't essential for basic sync.

**Complexity:** Medium-High
**Timeline:** 1-2 weeks each
**Value:** Medium

---

### Phase 3: Advanced Features (Skip Initially)

❌ **SKIP (For Now):**
1. ❌ Card Review Data - Privacy concerns, not essential
2. ❌ Deck Upload via Addon - Use web app instead
3. ❌ Note Type Creation via API - Use web app instead
4. ❌ Feature Flags - Can add later if needed
5. ❌ User Details - Can get from login response

**Why:** These are either not essential, have privacy concerns, or can be handled by web app.

**Complexity:** Varies
**Timeline:** Can add later
**Value:** Low

---

## 💡 Decision Framework

### For Each Feature, Ask:

1. **Is it essential for continuous syncing?**
   - ✅ Yes → Implement
   - ❌ No → Continue to question 2

2. **Does it significantly improve user experience?**
   - ✅ Yes → Consider implementing
   - ❌ No → Skip

3. **Is it complex to build?**
   - ✅ Yes → Defer to Phase 2
   - ❌ No → Consider Phase 1

4. **Can the web app handle it instead?**
   - ✅ Yes → Skip in addon
   - ❌ No → Consider implementing

---

## 📊 Feature Comparison Matrix

| Feature | Essential? | Complexity | Value | Phase | Recommendation |
|---------|-----------|------------|-------|-------|----------------|
| **Incremental Updates** | ✅ Yes | Medium | Very High | 1 | ✅ Implement |
| **Media Sync** | ✅ Yes | Medium | High | 1 | ✅ Implement |
| **Note Type Management** | ✅ Yes | Low | High | 1 | ✅ Implement |
| **Protected Fields/Tags** | ✅ Yes | Low | Very High | 1 | ✅ Implement |
| **Deck Subscriptions** | ✅ Yes | Low | High | 1 | ✅ Implement |
| **Suggestion System** | ❌ No | High | Medium | 2 | ⚠️ Decide |
| **Deck Extensions** | ❌ No | Medium | Low-Medium | 2 | ⚠️ Decide |
| **Pending Actions** | ❌ No | Low | Low | 2 | ⚠️ Optional |
| **Review Data** | ❌ No | Medium | Low | 3 | ❌ Skip |
| **Deck Upload** | ❌ No | High | Medium | 3 | ❌ Skip (use web) |
| **Feature Flags** | ❌ No | Low | Low | 3 | ❌ Skip |

---

## 🎯 My Recommendations for Nottorney

### **Must Implement (Phase 1):**
1. ✅ Incremental Deck Updates
2. ✅ Media Synchronization
3. ✅ Note Type Management
4. ✅ Protected Fields/Tags
5. ✅ Deck Subscriptions

**Why:** These are the core of continuous syncing. Without these, you can't provide updates.

### **Consider Implementing (Phase 2):**
1. ⚠️ Suggestion System - **Only if** you want collaborative editing
2. ⚠️ Deck Extensions - **Only if** you want optional tag groups

**Why:** These add value but aren't essential. Decide based on your product vision.

### **Skip (For Now):**
1. ❌ Card Review Data - Privacy concerns
2. ❌ Deck Upload via Addon - Use web app
3. ❌ Note Type Creation - Use web app
4. ❌ Feature Flags - Can add later
5. ❌ User Details - Get from login

**Why:** These can be handled by web app or aren't essential.

---

## 🤔 Questions to Help You Decide

### 1. **What's Your Product Vision?**
- **Marketplace Only:** Focus on Phase 1 (essential sync)
- **Collaborative Platform:** Add Phase 2 (suggestions, extensions)
- **Analytics Platform:** Add review data tracking

### 2. **Who Updates Decks?**
- **Creators Only:** Skip suggestion system
- **Community-Driven:** Implement suggestion system

### 3. **How Do Creators Upload?**
- **Via Web App:** Skip addon upload features
- **Via Addon:** Implement upload features

### 4. **Privacy Concerns?**
- **Privacy-First:** Skip review data tracking
- **Analytics-Focused:** Implement with opt-in

---

## 📝 Next Steps

1. **Review this guide** - Understand all features
2. **Decide on Phase 1** - Essential sync features (recommended: implement all)
3. **Decide on Phase 2** - Optional features (decide based on vision)
4. **Skip Phase 3** - Advanced features (can add later)

The addon is already implemented for Phase 1 features - you just need to build the backend endpoints!

