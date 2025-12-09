"""Nottorney API client for deck purchases, downloads, and incremental sync."""

import base64
import csv
import gzip
import json
import os
import uuid
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional, Set, TypedDict, Union

import requests
import structlog
import time
from requests.exceptions import ConnectionError, Timeout

from .ankihub_client.models import (
    ANKIHUB_DATETIME_FORMAT_STR,
    CardReviewData,
    ChangeNoteSuggestion,
    DailyCardReviewSummary,
    Deck,
    DeckExtension,
    DeckExtensionUpdateChunk,
    DeckMedia,
    DeckMediaUpdateChunk,
    DeckUpdates,
    DeckUpdatesChunk,
    Field,
    NewNoteSuggestion,
    NoteInfo,
    NoteSuggestion,
    NotesAction,
    UserDeckRelation,
)

LOGGER = structlog.stdlib.get_logger("nottorney")

NOTTORNEY_API_URL = "https://tpsaalbgdfjtzsnwswki.supabase.co/functions/v1/addon-auth"

CONNECTION_TIMEOUT = 10
STANDARD_READ_TIMEOUT = 30
LONG_READ_TIMEOUT = 600  # For file downloads

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds

# Incremental sync constants
DECK_UPDATE_PAGE_SIZE = 2000
DECK_EXTENSION_UPDATE_PAGE_SIZE = 2000
DECK_MEDIA_UPDATE_PAGE_SIZE = 2000

CSV_DELIMITER = ";"


class NottorneyHTTPError(Exception):
    """An unexpected HTTP code was returned in response to a request by the Nottorney client."""

    def __init__(self, response: requests.Response):
        self.response = response
        self.status_code = response.status_code
        self.error_code = None
        self.message = None
        
        # Try to parse detailed error from response
        try:
            error_data = response.json()
            self.error_code = error_data.get("error", "unknown")
            self.message = error_data.get("message", response.reason)
        except (ValueError, KeyError):
            # If JSON parsing fails, use basic error info
            self.error_code = "unknown"
            self.message = response.reason

    def __str__(self):
        if self.error_code and self.message:
            return f"Nottorney API error ({self.error_code}): {self.message}"
        return f"Nottorney API error: {self.status_code} {self.response.reason}"


class API(Enum):
    """API endpoint types for Nottorney."""

    NOTTORNEY = "nottorney"
    S3 = "s3"


class NottorneyClient:
    """Client for interacting with the Nottorney API with full incremental sync support."""

    def __init__(
        self,
        token: Optional[str] = None,
        api_url: Optional[str] = None,
        s3_bucket_url: Optional[str] = None,
        local_media_dir_path_cb: Optional[Callable[[], Path]] = None,
    ):
        self.token = token
        self.api_url = api_url or NOTTORNEY_API_URL
        self.s3_bucket_url = s3_bucket_url
        self.local_media_dir_path_cb = local_media_dir_path_cb

    def _get_headers(self, include_auth: bool = True) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
        }
        if include_auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _send_request(
        self,
        method: str,
        api: API,
        url_suffix: str,
        json=None,
        data=None,
        files=None,
        params=None,
        stream=False,
        is_long_running=False,
    ) -> requests.Response:
        """Send a request to the Nottorney API or S3 with automatic retry on transient failures."""
        if api == API.NOTTORNEY:
            url = f"{self.api_url}{url_suffix}" if url_suffix.startswith("/") else f"{self.api_url}/{url_suffix}"
        elif api == API.S3:
            if not self.s3_bucket_url:
                raise ValueError("S3 bucket URL not configured")
            url = f"{self.s3_bucket_url}{url_suffix}"
        else:
            raise ValueError(f"Unknown API: {api}")

        headers = self._get_headers(include_auth=(api == API.NOTTORNEY))

        timeout = LONG_READ_TIMEOUT if is_long_running else STANDARD_READ_TIMEOUT
        timeout_tuple = (CONNECTION_TIMEOUT, timeout)

        # Retry logic for transient network failures
        last_exception = None
        for attempt in range(MAX_RETRIES):
            try:
                response = requests.request(
                    method=method,
                    url=url,
                    json=json,
                    data=data,
                    files=files,
                    params=params,
                    headers=headers,
                    stream=stream,
                    timeout=timeout_tuple,
                )
                return response
            except (ConnectionError, Timeout) as e:
                last_exception = e
                if attempt < MAX_RETRIES - 1:
                    LOGGER.warning(
                        "Request failed, retrying",
                        attempt=attempt + 1,
                        max_retries=MAX_RETRIES,
                        error=str(e),
                    )
                    time.sleep(RETRY_DELAY)
                else:
                    LOGGER.error("Request failed after all retries", error=str(e))
                    raise

        # Should never reach here, but just in case
        if last_exception:
            raise last_exception
        raise RuntimeError("Request failed for unknown reason")

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """
        Authenticate user and get access token + purchased decks.

        Args:
            email: User email address
            password: User password

        Returns:
            {
                "success": True,
                "access_token": "...",
                "user": {"id": "...", "email": "...", "display_name": "..."},
                "purchased_decks": [...]
            }

        Raises:
            NottorneyHTTPError: If login fails
        """
        LOGGER.info("Logging in user", email=email)
        response = requests.post(
            f"{self.api_url}/login",
            json={"email": email, "password": password},
            headers=self._get_headers(include_auth=False),
            timeout=(CONNECTION_TIMEOUT, STANDARD_READ_TIMEOUT),
        )

        if response.status_code != 200:
            LOGGER.error("Login failed", status_code=response.status_code)
            raise NottorneyHTTPError(response)

        data = response.json()
        self.token = data.get("access_token")
        purchased_decks_count = len(data.get("purchased_decks", []))
        LOGGER.info("Login successful", purchased_decks_count=purchased_decks_count)
        return data

    def get_purchased_decks(self) -> List[Dict[str, Any]]:
        """
        Fetch user's purchased decks.

        Returns:
            List of deck objects with: id, title, description, category, card_count, apkg_path

        Raises:
            ValueError: If not authenticated
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        LOGGER.info("Fetching purchased decks")
        response = requests.get(
            f"{self.api_url}/decks",
            headers=self._get_headers(),
            timeout=(CONNECTION_TIMEOUT, STANDARD_READ_TIMEOUT),
        )

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        purchased_decks = data.get("purchased_decks", [])
        LOGGER.info("Fetched purchased decks", count=len(purchased_decks))
        return purchased_decks

    def get_download_url(self, product_id: str) -> Dict[str, Any]:
        """
        Get a signed download URL for a purchased deck.

        Args:
            product_id: UUID of the product/deck

        Returns:
            {
                "success": True,
                "download_url": "https://...",
                "deck_title": "...",
                "expires_in": 3600
            }

        Raises:
            ValueError: If not authenticated
            NottorneyHTTPError: If request fails (403 if not purchased, 401 if not authenticated)
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        LOGGER.info("Getting download URL for product", product_id=product_id)
        response = requests.post(
            f"{self.api_url}/download",
            json={"product_id": product_id},
            headers=self._get_headers(),
            timeout=(CONNECTION_TIMEOUT, STANDARD_READ_TIMEOUT),
        )

        if response.status_code == 403:
            LOGGER.error("User has not purchased this deck", product_id=product_id)
            raise NottorneyHTTPError(response)
        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        LOGGER.info("Got download URL", deck_title=data.get("deck_title"))
        return data

    def download_deck(self, product_id: str, save_path: Path) -> Path:
        """
        Download a deck file to the specified path.

        Args:
            product_id: UUID of the product/deck
            save_path: Path where to save the .apkg file

        Returns:
            Path to the downloaded file

        Raises:
            ValueError: If not authenticated
            NottorneyHTTPError: If download fails
        """
        url_data = self.get_download_url(product_id)
        download_url = url_data["download_url"]
        deck_title = url_data.get("deck_title", "Unknown")

        LOGGER.info("Downloading deck", deck_title=deck_title, product_id=product_id)
        response = requests.get(download_url, stream=True, timeout=(CONNECTION_TIMEOUT, LONG_READ_TIMEOUT))

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        # Ensure parent directory exists
        save_path.parent.mkdir(parents=True, exist_ok=True)

        # Download file in chunks
        with open(save_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)

        file_size = save_path.stat().st_size
        LOGGER.info("Deck downloaded", deck_title=deck_title, file_size=file_size, path=str(save_path))
        return save_path

    def signout(self) -> None:
        """Clear the authentication token."""
        self.token = None
        LOGGER.info("User signed out")

    # ==================== Incremental Sync Methods ====================

    def get_deck_subscriptions(self) -> List[Deck]:
        """
        Fetch user's deck subscriptions.

        Returns:
            List of Deck objects the user is subscribed to

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        LOGGER.info("Fetching deck subscriptions")
        response = self._send_request("GET", API.NOTTORNEY, "/decks/subscriptions/")

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        decks = [Deck.from_dict(deck["deck"]) for deck in data]
        LOGGER.info("Fetched deck subscriptions", count=len(decks))
        return decks

    def subscribe_to_deck(self, deck_id: Union[str, uuid.UUID]) -> None:
        """
        Subscribe to a deck.

        Args:
            deck_id: UUID of the deck to subscribe to

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        deck_id_str = str(deck_id)
        LOGGER.info("Subscribing to deck", deck_id=deck_id_str)
        response = self._send_request(
            "POST", API.NOTTORNEY, "/decks/subscriptions/", json={"deck": deck_id_str}
        )

        if response.status_code != 201:
            raise NottorneyHTTPError(response)

        LOGGER.info("Subscribed to deck", deck_id=deck_id)

    def unsubscribe_from_deck(self, deck_id: Union[str, uuid.UUID]) -> None:
        """
        Unsubscribe from a deck.

        Args:
            deck_id: UUID of the deck to unsubscribe from

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        deck_id_str = str(deck_id)
        LOGGER.info("Unsubscribing from deck", deck_id=deck_id_str)
        response = self._send_request("DELETE", API.NOTTORNEY, f"/decks/{deck_id_str}/subscriptions/")

        if response.status_code not in (204, 404):
            raise NottorneyHTTPError(response)

        LOGGER.info("Unsubscribed from deck", deck_id=deck_id)

    def get_deck_by_id(self, deck_id: Union[str, uuid.UUID]) -> Deck:
        """
        Get deck information by ID.

        Args:
            deck_id: UUID of the deck

        Returns:
            Deck object

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        deck_id_str = str(deck_id)
        LOGGER.info("Fetching deck", deck_id=deck_id_str)
        response = self._send_request("GET", API.NOTTORNEY, f"/decks/{deck_id_str}/")

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        deck = Deck.from_dict(data)
        LOGGER.info("Fetched deck", deck_id=deck_id, name=deck.name)
        return deck

    def get_deck_updates(
        self,
        deck_id: Union[str, uuid.UUID],
        since: Optional[datetime],
        download_full_deck: bool = False,
        updates_download_progress_cb: Optional[Callable[[int], None]] = None,
        deck_download_progress_cb: Optional[Callable[[int], None]] = None,
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> Optional[DeckUpdates]:
        """
        Fetch incremental updates for a deck.

        Args:
            deck_id: UUID of the deck
            since: Timestamp to fetch updates since (None for all updates)
            download_full_deck: If True, download full deck instead of incremental updates
            updates_download_progress_cb: Callback for progress updates (notes count)
            deck_download_progress_cb: Callback for full deck download progress (percentage)
            should_cancel: Callback to check if operation should be cancelled

        Returns:
            DeckUpdates object with notes and metadata, or None if cancelled

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        notes_data_from_csv = []
        notes_data_from_json = []
        latest_update = None
        protected_fields = {}
        protected_tags = []

        deck_id_str = str(deck_id)
        for chunk in self._get_deck_updates_inner(
            deck_id_str,
            since,
            download_full_deck,
            updates_download_progress_cb,
            deck_download_progress_cb,
        ):
            if should_cancel and should_cancel():
                return None

            if not chunk.notes:
                continue

            if chunk.from_csv:
                notes_data_from_csv = chunk.notes
            else:
                notes_data_from_json.extend(chunk.notes)

            latest_update = max(chunk.latest_update, latest_update) if latest_update else chunk.latest_update
            protected_fields = chunk.protected_fields
            protected_tags = chunk.protected_tags

        # When a note is both in CSV and JSON, JSON version is more recent
        ah_nids_from_json = {note.ah_nid for note in notes_data_from_json}
        filtered_notes_data_from_csv = [
            note for note in notes_data_from_csv if note.ah_nid not in ah_nids_from_json
        ]
        notes_data = notes_data_from_json + filtered_notes_data_from_csv

        return DeckUpdates(
            notes=notes_data,
            latest_update=latest_update,
            protected_fields=protected_fields,
            protected_tags=protected_tags,
        )

    def _get_deck_updates_inner(
        self,
        deck_id: str,
        since: Optional[datetime],
        download_full_deck: bool,
        updates_download_progress_cb: Optional[Callable[[int], None]],
        deck_download_progress_cb: Optional[Callable[[int], None]],
    ) -> Iterator[DeckUpdatesChunk]:
        """Internal method to fetch deck updates in chunks."""
        class Params(TypedDict, total=False):
            since: str
            size: int
            full_deck: bool

        params: Params = {
            "since": since.strftime(ANKIHUB_DATETIME_FORMAT_STR) if since else None,
            "size": DECK_UPDATE_PAGE_SIZE,
            "full_deck": download_full_deck,
        }
        url_suffix = f"/decks/{deck_id}/updates"
        notes_count = 0
        first_request = True

        while url_suffix is not None:
            response = self._send_request(
                "GET",
                API.NOTTORNEY,
                url_suffix,
                params=params if first_request else None,
                is_long_running=True,
            )

            if response.status_code != 200:
                raise NottorneyHTTPError(response)

            data = response.json()
            url_suffix = data.get("next")
            if url_suffix:
                # Extract path from full URL if needed
                if "/api" in url_suffix:
                    url_suffix = url_suffix.split("/api", maxsplit=1)[1]

            if data.get("external_notes_url"):
                # Full deck download via CSV
                notes_data_deck = self._download_deck_from_url(
                    data["external_notes_url"], deck_download_progress_cb
                )
                chunk = DeckUpdatesChunk.from_dict({**data, "from_csv": True})
                chunk.notes = notes_data_deck
                yield chunk

                # Get remaining updates after CSV
                yield from self._get_deck_updates_inner(
                    deck_id=deck_id,
                    since=chunk.latest_update,
                    download_full_deck=False,
                    updates_download_progress_cb=updates_download_progress_cb,
                    deck_download_progress_cb=deck_download_progress_cb,
                )
                return
            elif data.get("notes") is None:
                raise ValueError("No notes in the response")

            # Decompress and transform notes data
            notes_data_base85 = data["notes"]
            notes_data_gzipped = base64.b85decode(notes_data_base85)
            notes_data = json.loads(gzip.decompress(notes_data_gzipped).decode("utf-8"))
            data["notes"] = self._transform_notes_data(notes_data)

            note_updates = DeckUpdatesChunk.from_dict({**data, "from_csv": False})
            yield note_updates

            notes_count += len(note_updates.notes)

            if updates_download_progress_cb:
                updates_download_progress_cb(notes_count)

            first_request = False

    def _download_deck_from_url(
        self, url: str, progress_cb: Optional[Callable[[int], None]]
    ) -> List[NoteInfo]:
        """Download and parse deck from CSV URL."""
        response = self._send_request("GET", API.S3, url, stream=True, is_long_running=True)

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        if progress_cb:
            total_size = int(response.headers.get("content-length", 0))
            content = b""
            chunk_size = int(min(total_size * 0.05, 10**6)) if total_size > 0 else 8192
            for i, chunk in enumerate(response.iter_content(chunk_size=chunk_size), start=1):
                if chunk:
                    if total_size > 0:
                        percent = int(i * chunk_size / total_size * 100)
                        progress_cb(percent)
                    content += chunk
        else:
            content = response.content

        # Parse CSV
        csv_filename = url.split("?")[0].split("/")[-1]
        if csv_filename.endswith(".gz"):
            deck_csv_content = gzip.decompress(content).decode("utf-8")
        else:
            deck_csv_content = content.decode("utf-8")

        reader = csv.DictReader(deck_csv_content.splitlines(), delimiter=CSV_DELIMITER, quotechar="'")
        notes_data_raw = [row for row in reader]
        notes_data_raw = self._transform_notes_data(notes_data_raw)
        notes_data = [NoteInfo.from_dict(row) for row in notes_data_raw]

        return notes_data

    def _transform_notes_data(self, notes_data: List[Dict]) -> List[Dict]:
        """Transform notes data from API format to NoteInfo format."""
        result = []
        for note_data in notes_data:
            transformed = {
                **note_data,
                "fields": (
                    json.loads(note_data["fields"]) if isinstance(note_data["fields"], str) else note_data["fields"]
                ),
                "anki_id": int(note_data["anki_id"]),
                "note_id": note_data.get("note_id", note_data.get("ankihub_id", note_data.get("id"))),
                "note_type_id": int(note_data["note_type_id"]),
                "tags": (
                    json.loads(note_data["tags"]) if isinstance(note_data["tags"], str) else note_data["tags"]
                ),
                "last_update_type": (
                    "delete" if note_data.get("deleted") else note_data.get("last_update_type")
                ),
            }
            result.append(transformed)
        return result

    def get_deck_media_updates(
        self, deck_id: Union[str, uuid.UUID], since: Optional[datetime]
    ) -> Iterator[DeckMediaUpdateChunk]:
        """
        Fetch incremental media updates for a deck.

        Args:
            deck_id: UUID of the deck
            since: Timestamp to fetch updates since (None for all updates)

        Yields:
            DeckMediaUpdateChunk objects with media files

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        class Params(TypedDict, total=False):
            since: str
            size: int

        deck_id_str = str(deck_id)
        params: Params = {
            "since": since.strftime(ANKIHUB_DATETIME_FORMAT_STR) if since else None,
            "size": DECK_MEDIA_UPDATE_PAGE_SIZE,
        }
        url_suffix = f"/decks/{deck_id_str}/media/list/"
        first_request = True

        while url_suffix is not None:
            response = self._send_request(
                "GET",
                API.NOTTORNEY,
                url_suffix,
                params=params if first_request else None,
                is_long_running=True,
            )

            if response.status_code != 200:
                raise NottorneyHTTPError(response)

            data = response.json()
            url_suffix = data.get("next")
            if url_suffix and "/api" in url_suffix:
                url_suffix = url_suffix.split("/api", maxsplit=1)[1]

            media_updates = DeckMediaUpdateChunk.from_dict(data)
            yield media_updates

            first_request = False

    def get_protected_fields(self, deck_id: Union[str, uuid.UUID]) -> Dict[int, List[str]]:
        """
        Get protected fields for a deck.

        Args:
            deck_id: UUID of the deck

        Returns:
            Dict mapping note type IDs to lists of protected field names

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        deck_id_str = str(deck_id)
        LOGGER.info("Fetching protected fields", deck_id=deck_id_str)
        response = self._send_request("GET", API.NOTTORNEY, f"/decks/{deck_id_str}/protected-fields/")

        if response.status_code == 404:
            return {}
        elif response.status_code != 200:
            raise NottorneyHTTPError(response)

        protected_fields_raw = response.json().get("fields", {})
        result = {int(field_id): field_names for field_id, field_names in protected_fields_raw.items()}
        LOGGER.info("Fetched protected fields", deck_id=deck_id, count=len(result))
        return result

    def get_protected_tags(self, deck_id: Union[str, uuid.UUID]) -> List[str]:
        """
        Get protected tags for a deck.

        Args:
            deck_id: UUID of the deck

        Returns:
            List of protected tag names

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        deck_id_str = str(deck_id)
        LOGGER.info("Fetching protected tags", deck_id=deck_id_str)
        response = self._send_request("GET", API.NOTTORNEY, f"/decks/{deck_id_str}/protected-tags/")

        if response.status_code == 404:
            return []
        elif response.status_code != 200:
            raise NottorneyHTTPError(response)

        result = response.json().get("tags", [])
        result = [x for x in result if x.strip()]
        LOGGER.info("Fetched protected tags", deck_id=deck_id, count=len(result))
        return result

    def get_note_types_dict_for_deck(self, deck_id: Union[str, uuid.UUID]) -> Dict[int, Dict[str, Any]]:
        """
        Get note types for a deck.

        Args:
            deck_id: UUID of the deck

        Returns:
            Dict mapping note type IDs to note type dictionaries

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        deck_id_str = str(deck_id)
        LOGGER.info("Fetching note types", deck_id=deck_id_str)
        response = self._send_request("GET", API.NOTTORNEY, f"/decks/{deck_id_str}/note-types/")

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        result = {}
        for note_type_data in data:
            anki_id = note_type_data["anki_id"]
            # Transform to Anki format
            note_type = {
                "id": anki_id,
                "name": note_type_data["name"],
                "flds": note_type_data.get("fields", []),
                "tmpls": note_type_data.get("templates", []),
                **{k: v for k, v in note_type_data.items() if k not in ["anki_id", "fields", "templates"]},
            }
            result[anki_id] = note_type

        LOGGER.info("Fetched note types", deck_id=deck_id, count=len(result))
        return result

    def get_note_by_id(self, note_id: str) -> NoteInfo:
        """
        Get a single note by ID.

        Args:
            note_id: UUID of the note

        Returns:
            NoteInfo object

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        LOGGER.info("Fetching note", note_id=note_id)
        response = self._send_request("GET", API.NOTTORNEY, f"/notes/{note_id}")

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        note = NoteInfo.from_dict(data)
        LOGGER.info("Fetched note", note_id=note_id)
        return note

    def generate_presigned_url(self, key: str, action: str, many: bool = False) -> str:
        """
        Generate a presigned URL for S3 operations.

        Args:
            key: S3 key/path
            action: "upload" or "download"
            many: Whether this is for multiple files

        Returns:
            Presigned URL string

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        LOGGER.info("Generating presigned URL", key=key, action=action, many=many)
        response = self._send_request(
            "GET",
            API.NOTTORNEY,
            "/decks/generate-presigned-url",
            params={"key": key, "type": action, "many": "true" if many else "false"},
        )

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        url = response.json().get("pre_signed_url")
        LOGGER.info("Generated presigned URL", key=key)
        return url

    def download_media(self, media_names: List[str], deck_id: Union[str, uuid.UUID]) -> None:
        """
        Download media files for a deck.

        Args:
            media_names: List of media file names to download
            deck_id: UUID of the deck

        Raises:
            NottorneyHTTPError: If download fails
        """
        if not self.local_media_dir_path_cb:
            raise ValueError("local_media_dir_path_cb not configured")

        if not self.s3_bucket_url:
            raise ValueError("S3 bucket URL not configured")

        deck_id_str = str(deck_id)
        deck_media_remote_dir = f"/deck_assets/{deck_id_str}/"
        media_dir_path = self.local_media_dir_path_cb()

        downloaded_count = 0
        for media_name in media_names:
            media_path = media_dir_path / media_name
            media_remote_path = deck_media_remote_dir + media_name

            try:
                response = self._send_request("GET", API.S3, media_remote_path, stream=True)
                if response.status_code == 200:
                    media_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(media_path, "wb") as f:
                        for chunk in response.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                    downloaded_count += 1
                else:
                    LOGGER.warning(
                        "Unable to download media file",
                        media_remote_path=media_remote_path,
                        status_code=response.status_code,
                    )
            except Exception as e:
                LOGGER.warning("Error downloading media file", media_name=media_name, error=str(e))

        LOGGER.info(
            "Downloaded media from Nottorney",
            deck_id=deck_id,
            attempted_count=len(media_names),
            downloaded_count=downloaded_count,
        )

    def get_deck_extensions(self) -> List[DeckExtension]:
        """
        Get deck extensions (optional tags) for the user.

        Returns:
            List of DeckExtension objects

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        LOGGER.info("Fetching deck extensions")
        response = self._send_request("GET", API.NOTTORNEY, "/users/deck_extensions")

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        extension_dicts = data.get("deck_extensions", [])
        result = [DeckExtension.from_dict(d) for d in extension_dicts]
        LOGGER.info("Fetched deck extensions", count=len(result))
        return result

    def get_deck_extensions_by_deck_id(self, deck_id: Union[str, uuid.UUID]) -> List[DeckExtension]:
        """
        Get deck extensions for a specific deck.

        Args:
            deck_id: UUID of the deck

        Returns:
            List of DeckExtension objects for the deck

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        deck_id_str = str(deck_id)
        LOGGER.info("Fetching deck extensions for deck", deck_id=deck_id_str)
        response = self._send_request(
            "GET", API.NOTTORNEY, "/users/deck_extensions", params={"deck_id": deck_id_str}
        )

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        extension_dicts = data.get("deck_extensions", [])
        result = [DeckExtension.from_dict(d) for d in extension_dicts]
        LOGGER.info("Fetched deck extensions for deck", deck_id=deck_id_str, count=len(result))
        return result

    def get_deck_extension_updates(
        self,
        deck_extension_id: int,
        since: Optional[datetime],
        download_progress_cb: Optional[Callable[[int], None]] = None,
    ) -> Iterator[DeckExtensionUpdateChunk]:
        """
        Fetch incremental updates for a deck extension.

        Args:
            deck_extension_id: ID of the deck extension
            since: Timestamp to fetch updates since (None for all updates)
            download_progress_cb: Callback for progress updates

        Yields:
            DeckExtensionUpdateChunk objects

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        class Params(TypedDict, total=False):
            since: str
            size: int

        params: Params = {
            "since": since.strftime(ANKIHUB_DATETIME_FORMAT_STR) if since else None,
            "size": DECK_EXTENSION_UPDATE_PAGE_SIZE,
        }
        url = f"/deck_extensions/{deck_extension_id}/note_customizations/"

        i = 0
        customizations_count = 0
        while url is not None:
            response = self._send_request(
                "GET",
                API.NOTTORNEY,
                url,
                params=params if i == 0 else None,
                is_long_running=True,
            )

            if response.status_code != 200:
                raise NottorneyHTTPError(response)

            data = response.json()
            url = data.get("next")
            if url and "/api" in url:
                url = url.split("/api", maxsplit=1)[1]

            note_updates = DeckExtensionUpdateChunk.from_dict(data)
            yield note_updates

            i += 1
            customizations_count += len(note_updates.note_customizations)

            if download_progress_cb:
                download_progress_cb(customizations_count)

    def get_pending_notes_actions_for_deck(self, deck_id: Union[str, uuid.UUID]) -> List[NotesAction]:
        """
        Get pending notes actions for a deck (e.g., unsuspend notes).

        Args:
            deck_id: UUID of the deck

        Returns:
            List of NotesAction objects

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        deck_id_str = str(deck_id)
        LOGGER.info("Fetching pending notes actions", deck_id=deck_id_str)
        response = self._send_request(
            "GET", API.NOTTORNEY, f"/decks/{deck_id_str}/notes-actions/", is_long_running=True
        )

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        result = [NotesAction.from_dict(action) for action in data]
        LOGGER.info("Fetched pending notes actions", deck_id=deck_id_str, count=len(result))
        return result

    # ==================== SUGGESTION SYSTEM ====================

    def create_change_note_suggestion(
        self,
        change_note_suggestion: ChangeNoteSuggestion,
        auto_accept: bool = False,
    ) -> None:
        """
        Create a suggestion to change an existing note.

        Args:
            change_note_suggestion: The suggestion data
            auto_accept: Whether to auto-accept the suggestion (if user has permission)

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        LOGGER.info("Creating change note suggestion", note_id=str(change_note_suggestion.ah_nid))
        response = self._send_request(
            "POST",
            API.NOTTORNEY,
            f"/notes/{change_note_suggestion.ah_nid}/suggestion/",
            json={**change_note_suggestion.to_dict(), "auto_accept": auto_accept},
        )

        if response.status_code != 201:
            raise NottorneyHTTPError(response)

        LOGGER.info("Created change note suggestion", note_id=str(change_note_suggestion.ah_nid))

    def create_new_note_suggestion(
        self,
        new_note_suggestion: NewNoteSuggestion,
        auto_accept: bool = False,
    ) -> None:
        """
        Create a suggestion to add a new note.

        Args:
            new_note_suggestion: The suggestion data
            auto_accept: Whether to auto-accept the suggestion (if user has permission)

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        LOGGER.info("Creating new note suggestion", deck_id=str(new_note_suggestion.ah_did))
        response = self._send_request(
            "POST",
            API.NOTTORNEY,
            f"/decks/{new_note_suggestion.ah_did}/note-suggestion/",
            json={**new_note_suggestion.to_dict(), "auto_accept": auto_accept},
        )

        if response.status_code != 201:
            raise NottorneyHTTPError(response)

        LOGGER.info("Created new note suggestion", deck_id=str(new_note_suggestion.ah_did))

    def create_suggestions_in_bulk(
        self,
        new_note_suggestions: List[NewNoteSuggestion] = None,
        change_note_suggestions: List[ChangeNoteSuggestion] = None,
        auto_accept: bool = False,
    ) -> Dict[int, Dict[str, List[str]]]:
        """
        Create multiple suggestions in bulk.

        Args:
            new_note_suggestions: List of new note suggestions
            change_note_suggestions: List of change note suggestions
            auto_accept: Whether to auto-accept suggestions (if user has permission)

        Returns:
            Dict mapping anki_nid to validation errors (if any)

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        if new_note_suggestions is None:
            new_note_suggestions = []
        if change_note_suggestions is None:
            change_note_suggestions = []

        errors_for_change_suggestions = self._create_suggestion_in_bulk_inner(
            suggestions=change_note_suggestions,
            url="/notes/bulk-change-suggestions/",
            auto_accept=auto_accept,
        )

        errors_for_new_note_suggestions = self._create_suggestion_in_bulk_inner(
            suggestions=new_note_suggestions,
            url="/notes/bulk-new-note-suggestions/",
            auto_accept=auto_accept,
        )

        return {
            **errors_for_change_suggestions,
            **errors_for_new_note_suggestions,
        }

    def _create_suggestion_in_bulk_inner(
        self, suggestions: List[NoteSuggestion], url: str, auto_accept: bool
    ) -> Dict[int, Dict[str, List[str]]]:
        """Internal method to create suggestions in bulk."""
        if not suggestions:
            return {}

        response = self._send_request(
            "POST",
            API.NOTTORNEY,
            url,
            json={
                "suggestions": [s.to_dict() for s in suggestions],
                "auto_accept": auto_accept,
            },
            is_long_running=True,
        )

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        errors_by_anki_nid = {
            suggestion.anki_nid: d["validation_errors"]
            for d, suggestion in zip(data, suggestions)
            if d.get("validation_errors")
        }
        return errors_by_anki_nid

    # ==================== REVIEW DATA TRACKING ====================

    def send_card_review_data(self, card_review_data: List[CardReviewData]) -> None:
        """
        Send card review statistics to the backend.

        Args:
            card_review_data: List of review data per deck

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        LOGGER.info("Sending card review data", count=len(card_review_data))
        response = self._send_request(
            "POST",
            API.NOTTORNEY,
            "/users/card-review-data/",
            json=[review.to_dict() for review in card_review_data],
            is_long_running=True,
        )

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        LOGGER.info("Sent card review data successfully")

    def send_daily_card_review_summaries(self, daily_card_review_summaries: List[DailyCardReviewSummary]) -> None:
        """
        Send daily card review summaries to the backend.

        Args:
            daily_card_review_summaries: List of daily review summaries

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        LOGGER.info("Sending daily card review summaries", count=len(daily_card_review_summaries))
        response = self._send_request(
            "POST",
            API.NOTTORNEY,
            "/users/daily-card-review-summary/",
            json=[summary.to_dict() for summary in daily_card_review_summaries],
            is_long_running=True,
        )

        if response.status_code != 201:
            raise NottorneyHTTPError(response)

        LOGGER.info("Sent daily card review summaries successfully")

    # ==================== DECK UPLOAD ====================

    def upload_deck(
        self,
        deck_name: str,
        notes_data: List[NoteInfo],
        note_types_data: List[Dict[str, Any]],
        anki_deck_id: int,
        private: bool = False,
    ) -> uuid.UUID:
        """
        Upload a new deck to Nottorney.

        Args:
            deck_name: Name of the deck
            notes_data: List of notes in the deck
            note_types_data: List of note type definitions
            anki_deck_id: Anki deck ID
            private: Whether the deck is private

        Returns:
            UUID of the created deck

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        import re
        deck_name_normalized = re.sub(r'[\\/?<>:*|"^]', "_", deck_name)
        deck_file_name = f"{deck_name_normalized}-{uuid.uuid4()}.json.gz"

        # Get presigned URL for upload
        presigned_url = self.generate_presigned_url(key=deck_file_name, action="upload", many=False)
        presigned_url_suffix = presigned_url.split(self.s3_bucket_url)[1] if self.s3_bucket_url else presigned_url

        # Prepare notes data
        from .ankihub_client.models import note_info_for_upload
        notes_data_transformed = [note_info_for_upload(note_data).to_dict() for note_data in notes_data]

        # Compress data
        import gzip
        data = gzip.compress(
            json.dumps(
                {
                    "notes": notes_data_transformed,
                    "note_types": note_types_data,
                }
            ).encode("utf-8")
        )

        # Upload to storage
        LOGGER.info("Uploading deck to storage", deck_name=deck_name, file_name=deck_file_name)
        s3_response = self._send_request(
            "PUT",
            API.S3,
            presigned_url_suffix,
            data=data,
            is_long_running=True,
        )

        if s3_response.status_code != 200:
            raise NottorneyHTTPError(s3_response)

        # Create deck record
        LOGGER.info("Creating deck record", deck_name=deck_name)
        response = self._send_request(
            "POST",
            API.NOTTORNEY,
            "/decks/",
            json={
                "key": deck_file_name,
                "name": deck_name,
                "anki_id": anki_deck_id,
                "is_private": private,
            },
        )

        if response.status_code != 201:
            raise NottorneyHTTPError(response)

        response_data = response.json()
        deck_id = uuid.UUID(response_data["deck_id"])
        LOGGER.info("Deck uploaded successfully", deck_id=str(deck_id), deck_name=deck_name)
        return deck_id

    def upload_media(self, media_paths: Set[Path], deck_id: Union[str, uuid.UUID]) -> None:
        """
        Upload media files for a deck.

        Args:
            media_paths: Set of paths to media files
            deck_id: UUID of the deck

        Raises:
            NottorneyHTTPError: If upload fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        if not self.local_media_dir_path_cb:
            raise ValueError("local_media_dir_path_cb not configured")

        deck_id_str = str(deck_id)
        LOGGER.info("Uploading media files", deck_id=deck_id_str, count=len(media_paths))

        # Get presigned URL for multiple uploads
        prefix = f"deck_assets/{deck_id_str}"
        presigned_info = self._get_presigned_url_for_multiple_uploads(prefix)

        # Upload each file
        for media_path in media_paths:
            if not media_path.is_file():
                LOGGER.warning("Media file not found, skipping", path=str(media_path))
                continue

            # Upload file
            with open(media_path, "rb") as f:
                url_suffix = presigned_info["url"].split(self.s3_bucket_url)[1] if self.s3_bucket_url else presigned_info["url"]
                response = self._send_request(
                    "POST",
                    API.S3,
                    url_suffix,
                    data=presigned_info["fields"],
                    files={"file": (media_path.name, f)},
                    is_long_running=True,
                )

                if response.status_code != 204:
                    raise NottorneyHTTPError(response)

        LOGGER.info("Media files uploaded successfully", deck_id=deck_id_str, count=len(media_paths))

    def _get_presigned_url_for_multiple_uploads(self, prefix: str) -> Dict[str, Any]:
        """Get presigned URL for uploading multiple files."""
        response = self._send_request(
            "GET",
            API.NOTTORNEY,
            "/decks/generate-presigned-url",
            params={"key": prefix, "type": "upload", "many": "true"},
        )

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        return response.json()["pre_signed_url"]

    # ==================== FEATURE FLAGS ====================

    def get_feature_flags(self) -> Dict[str, bool]:
        """
        Get feature flags from the backend.

        Returns:
            Dict mapping feature flag names to enabled status

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        LOGGER.info("Fetching feature flags")
        response = self._send_request("GET", API.NOTTORNEY, "/feature-flags/")

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        result = {flag_name: flag_data["is_active"] for flag_name, flag_data in data.get("flags", {}).items()}
        LOGGER.info("Fetched feature flags", count=len(result))
        return result

    # ==================== USER DETAILS ====================

    def get_user_details(self) -> Dict[str, Any]:
        """
        Get current user details.

        Returns:
            Dict with user information

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        LOGGER.info("Fetching user details")
        response = self._send_request("GET", API.NOTTORNEY, "/users/me")

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        LOGGER.info("Fetched user details", user_id=data.get("id"))
        return data

    def owned_deck_ids(self) -> List[uuid.UUID]:
        """
        Get list of deck IDs owned by the current user.

        Returns:
            List of deck UUIDs

        Raises:
            NottorneyHTTPError: If request fails
        """
        data = self.get_user_details()
        result = [uuid.UUID(deck["id"]) for deck in data.get("created_decks", [])]
        return result

    # ==================== NOTE TYPE MANAGEMENT ====================

    def create_note_type(self, deck_id: Union[str, uuid.UUID], note_type: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a new note type for a deck.

        Args:
            deck_id: UUID of the deck
            note_type: Note type definition (Anki format)

        Returns:
            Created note type (Anki format)

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        deck_id_str = str(deck_id)
        # Transform to Nottorney format
        note_type_transformed = self._to_nottorney_note_type(note_type.copy())

        LOGGER.info("Creating note type", deck_id=deck_id_str, note_type_name=note_type.get("name"))
        response = self._send_request(
            "POST",
            API.NOTTORNEY,
            f"/decks/{deck_id_str}/create-note-type/",
            json=note_type_transformed,
        )

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        result = self._to_anki_note_type(data)
        LOGGER.info("Created note type", deck_id=deck_id_str, note_type_id=result.get("id"))
        return result

    def update_note_type(
        self,
        deck_id: Union[str, uuid.UUID],
        note_type: Dict[str, Any],
        keys_to_update: List[str],
    ) -> Dict[str, Any]:
        """
        Update an existing note type.

        Args:
            deck_id: UUID of the deck
            note_type: Note type definition (Anki format)
            keys_to_update: List of keys to update

        Returns:
            Updated note type (Anki format)

        Raises:
            NottorneyHTTPError: If request fails
        """
        if not self.token:
            raise ValueError("Not authenticated. Call login() first.")

        deck_id_str = str(deck_id)
        note_type_id = note_type["id"]
        note_type_filtered = {key: note_type[key] for key in keys_to_update}
        note_type_transformed = self._to_nottorney_note_type(note_type_filtered.copy())

        LOGGER.info("Updating note type", deck_id=deck_id_str, note_type_id=note_type_id)
        response = self._send_request(
            "PATCH",
            API.NOTTORNEY,
            f"/decks/{deck_id_str}/note-types/{note_type_id}/",
            json=note_type_transformed,
        )

        if response.status_code != 200:
            raise NottorneyHTTPError(response)

        data = response.json()
        result = self._to_anki_note_type(data)
        LOGGER.info("Updated note type", deck_id=deck_id_str, note_type_id=note_type_id)
        return result

    def _to_anki_note_type(self, note_type_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform Nottorney note type format to Anki format."""
        note_type_data["id"] = note_type_data.pop("anki_id", note_type_data.get("id"))
        note_type_data["tmpls"] = note_type_data.pop("templates", note_type_data.get("tmpls", []))
        note_type_data["flds"] = note_type_data.pop("fields", note_type_data.get("flds", []))
        return note_type_data

    def _to_nottorney_note_type(self, note_type: Dict[str, Any]) -> Dict[str, Any]:
        """Transform Anki note type format to Nottorney format."""
        if "id" in note_type:
            note_type["anki_id"] = note_type.pop("id")
        if "tmpls" in note_type:
            note_type["templates"] = note_type.pop("tmpls")
        if "flds" in note_type:
            note_type["fields"] = note_type.pop("flds")
        return note_type

