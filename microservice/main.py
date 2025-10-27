from typing import Union, Optional
import sqlite3
import os
import base64
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from mutagen import File as MutagenFile
from mutagen.easyid3 import EasyID3
from mutagen.easymp4 import EasyMP4
from mutagen.id3 import APIC, ID3
from mutagen.wave import WAVE
from mutagen.mp3 import MP3
from mutagen.mp4 import MP4, MP4Cover
from mutagen.flac import FLAC, Picture
from mutagen.oggvorbis import OggVorbis

app = FastAPI()

# Request/Response models
class ExtractMetadataRequest(BaseModel):
    filepath: str

class ArtworkData(BaseModel):
    data: str  # base64 encoded
    mimeType: str

class ExtractedMetadata(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    albumArtist: Optional[str] = None
    album: Optional[str] = None
    year: Optional[int] = None
    genre: Optional[str] = None
    trackNumber: Optional[int] = None
    producer: Optional[str] = None
    duration: Optional[float] = None
    artwork: Optional[ArtworkData] = None
# Use check_same_thread=False to allow connection across threads
# This is safe since we're only doing read operations on the database
db = sqlite3.connect("../svelte/local.db", check_same_thread=False)
cursor = db.cursor()


def embed_artwork(audio_file, song_artwork_path: str, album_artwork_path: str, filepath: str):
    """
    Embed album artwork into the audio file based on file type.
    Uses song artwork if available, otherwise falls back to album artwork.
    """
    print("=== EMBEDDING ARTWORK ===")
    print(f"Song artwork path: {song_artwork_path}")
    print(f"Album artwork path: {album_artwork_path}")
    print(f"Audio file type: {type(audio_file)}")
    print(f"Target filepath: {filepath}")

    # Determine which artwork to use
    artwork_path = song_artwork_path or album_artwork_path
    print(f"Final artwork path to use: {artwork_path}")

    if not artwork_path:
        print("No artwork path defined - returning early")
        return  # No artwork to embed

    # Convert path to absolute path (artwork paths are like "/uploads/artwork/...")
    full_artwork_path = Path("../svelte/static" + artwork_path)
    print(f"Full artwork path: {full_artwork_path}")
    print(f"Artwork file exists: {full_artwork_path.exists()}")

    if not full_artwork_path.exists():
        print(f"WARNING: Artwork file not found at {full_artwork_path} - returning early")
        return

    # Read artwork data
    with open(full_artwork_path, 'rb') as img_file:
        artwork_data = img_file.read()

    # Determine MIME type from extension
    ext = full_artwork_path.suffix.lower()
    mime_type = 'image/jpeg' if ext in ['.jpg', '.jpeg'] else 'image/png'
    print(f"Artwork MIME type: {mime_type}")
    print(f"Artwork data size: {len(artwork_data)} bytes")

    try:
        print(f"Attempting to embed artwork for file type: {type(audio_file).__name__}")
        if isinstance(audio_file, (MP3, WAVE)):
            # For MP3/WAV, use ID3 APIC frame
            # Need to load with ID3 directly (not EasyID3)
            id3_file = ID3(filepath)

            # Remove existing artwork
            id3_file.delall("APIC")

            # Add new artwork
            id3_file.add(
                APIC(
                    encoding=3,  # UTF-8
                    mime=mime_type,
                    type=3,  # Cover (front)
                    desc='Cover',
                    data=artwork_data
                )
            )
            id3_file.save()
            print("Successfully embedded artwork in MP3/WAVE file")

        elif isinstance(audio_file, MP4):
            # For MP4, reload as MP4 and add cover
            mp4_file = MP4(filepath)

            image_format = MP4Cover.FORMAT_JPEG if ext in ['.jpg', '.jpeg'] else MP4Cover.FORMAT_PNG
            mp4_file['covr'] = [MP4Cover(artwork_data, imageformat=image_format)]
            mp4_file.save()
            print("Successfully embedded artwork in MP4 file")

        elif isinstance(audio_file, FLAC):
            # For FLAC, use Picture
            picture = Picture()
            picture.type = 3  # Cover (front)
            picture.mime = mime_type
            picture.desc = 'Cover'
            picture.data = artwork_data

            # Remove existing pictures
            audio_file.clear_pictures()
            audio_file.add_picture(picture)
            audio_file.save()
            print("Successfully embedded artwork in FLAC file")

        elif isinstance(audio_file, OggVorbis):
            # For OGG, create FLAC Picture and base64 encode
            picture = Picture()
            picture.type = 3
            picture.mime = mime_type
            picture.desc = 'Cover'
            picture.data = artwork_data

            # Encode and add to tags
            encoded_data = base64.b64encode(picture.write())
            audio_file['metadata_block_picture'] = [encoded_data.decode('ascii')]
            audio_file.save()
            print("Successfully embedded artwork in OggVorbis file")

    except Exception as e:
        print(f"ERROR: Failed to embed artwork: {str(e)}")
        import traceback
        traceback.print_exc()


def extract_artwork(audio_file, filepath: str) -> Optional[ArtworkData]:
    """
    Extract embedded artwork from audio file.
    Returns base64-encoded image data and MIME type.
    """
    try:
        if isinstance(audio_file, (MP3, WAVE)):
            # For MP3/WAV, use ID3 APIC frame
            id3_file = ID3(filepath)
            apic_frames = id3_file.getall("APIC")
            if apic_frames:
                apic = apic_frames[0]
                return ArtworkData(
                    data=base64.b64encode(apic.data).decode('utf-8'),
                    mimeType=apic.mime
                )

        elif isinstance(audio_file, MP4):
            # For MP4/M4A files
            mp4_file = MP4(filepath)
            if 'covr' in mp4_file and mp4_file['covr']:
                cover = mp4_file['covr'][0]
                # Determine MIME type from imageformat
                if cover.imageformat == MP4Cover.FORMAT_JPEG:
                    mime_type = 'image/jpeg'
                elif cover.imageformat == MP4Cover.FORMAT_PNG:
                    mime_type = 'image/png'
                else:
                    mime_type = 'image/jpeg'  # default

                return ArtworkData(
                    data=base64.b64encode(bytes(cover)).decode('utf-8'),
                    mimeType=mime_type
                )

        elif isinstance(audio_file, FLAC):
            # For FLAC files
            if audio_file.pictures:
                picture = audio_file.pictures[0]
                return ArtworkData(
                    data=base64.b64encode(picture.data).decode('utf-8'),
                    mimeType=picture.mime
                )

        elif isinstance(audio_file, OggVorbis):
            # For OGG files
            if 'metadata_block_picture' in audio_file:
                encoded_data = audio_file['metadata_block_picture'][0]
                picture_data = base64.b64decode(encoded_data)
                # Parse the FLAC picture block
                picture = Picture(picture_data)
                return ArtworkData(
                    data=base64.b64encode(picture.data).decode('utf-8'),
                    mimeType=picture.mime
                )

        return None
    except Exception as e:
        print(f"Warning: Failed to extract artwork: {str(e)}")
        return None


@app.post("/extract-metadata")
def extract_metadata(request: ExtractMetadataRequest) -> ExtractedMetadata:
    """
    Extract metadata from an audio file and return it.
    Accepts a filepath relative to svelte/static/
    """
    filepath = request.filepath

    # Convert to absolute path
    full_filepath = Path("../svelte/static" + filepath)

    print(f"[extract-metadata] Received filepath: {filepath}")
    print(f"[extract-metadata] Full filepath: {full_filepath}")
    print(f"[extract-metadata] File exists: {full_filepath.exists()}")

    if full_filepath.exists():
        print(f"[extract-metadata] File size: {full_filepath.stat().st_size} bytes")
        print(f"[extract-metadata] File suffix: {full_filepath.suffix}")

    if not full_filepath.exists():
        raise HTTPException(status_code=404, detail=f"Audio file not found at {filepath}")

    print(f"Extracting metadata from: {full_filepath}")

    try:
        # Load the audio file with mutagen to detect type
        audio_file = MutagenFile(str(full_filepath))

        print(f"[extract-metadata] Mutagen file type: {type(audio_file)}")

        if audio_file is None:
            print(f"[extract-metadata] ERROR: Mutagen returned None for file")
            raise HTTPException(status_code=400, detail=f"Unsupported audio file format: {full_filepath.suffix}. File exists but mutagen cannot read it.")

        metadata = ExtractedMetadata()

        # Extract basic metadata based on file type
        if isinstance(audio_file, (MP3, WAVE)):
            try:
                easy_file = EasyID3(str(full_filepath))
                metadata.title = easy_file.get('title', [None])[0]
                metadata.artist = easy_file.get('artist', [None])[0]
                metadata.albumArtist = easy_file.get('albumartist', [None])[0]
                metadata.album = easy_file.get('album', [None])[0]
                metadata.genre = easy_file.get('genre', [None])[0]

                # Parse year
                date_str = easy_file.get('date', [None])[0]
                if date_str:
                    try:
                        metadata.year = int(date_str.split('-')[0])  # Handle YYYY-MM-DD format
                    except (ValueError, IndexError):
                        pass

                # Parse track number
                track_str = easy_file.get('tracknumber', [None])[0]
                if track_str:
                    try:
                        # Handle "1/10" format
                        metadata.trackNumber = int(track_str.split('/')[0])
                    except (ValueError, IndexError):
                        pass

                # Producer (stored as composer in ID3)
                metadata.producer = easy_file.get('composer', [None])[0]
            except:
                pass  # No tags or failed to read

            # Get duration
            if hasattr(audio_file, 'info') and hasattr(audio_file.info, 'length'):
                metadata.duration = audio_file.info.length

        elif isinstance(audio_file, MP4):
            try:
                easy_file = EasyMP4(str(full_filepath))
                metadata.title = easy_file.get('title', [None])[0]
                metadata.artist = easy_file.get('artist', [None])[0]
                metadata.albumArtist = easy_file.get('albumartist', [None])[0]
                metadata.album = easy_file.get('album', [None])[0]
                metadata.genre = easy_file.get('genre', [None])[0]

                date_str = easy_file.get('date', [None])[0]
                if date_str:
                    try:
                        metadata.year = int(date_str.split('-')[0])
                    except (ValueError, IndexError):
                        pass

                track_str = easy_file.get('tracknumber', [None])[0]
                if track_str:
                    try:
                        metadata.trackNumber = int(track_str.split('/')[0])
                    except (ValueError, IndexError):
                        pass

                metadata.producer = easy_file.get('composer', [None])[0]
            except:
                pass

            if hasattr(audio_file, 'info') and hasattr(audio_file.info, 'length'):
                metadata.duration = audio_file.info.length

        elif isinstance(audio_file, (FLAC, OggVorbis)):
            # For FLAC and OGG, tags are directly accessible
            if audio_file.tags:
                metadata.title = audio_file.tags.get('title', [None])[0]
                metadata.artist = audio_file.tags.get('artist', [None])[0]
                metadata.albumArtist = audio_file.tags.get('albumartist', [None])[0]
                metadata.album = audio_file.tags.get('album', [None])[0]
                metadata.genre = audio_file.tags.get('genre', [None])[0]
                metadata.producer = audio_file.tags.get('producer', [None])[0]

                date_str = audio_file.tags.get('date', [None])[0]
                if date_str:
                    try:
                        metadata.year = int(str(date_str).split('-')[0])
                    except (ValueError, IndexError):
                        pass

                track_str = audio_file.tags.get('tracknumber', [None])[0]
                if track_str:
                    try:
                        metadata.trackNumber = int(str(track_str).split('/')[0])
                    except (ValueError, IndexError):
                        pass

            if hasattr(audio_file, 'info') and hasattr(audio_file.info, 'length'):
                metadata.duration = audio_file.info.length

        else:
            # Try generic approach for other formats
            if hasattr(audio_file, 'tags') and audio_file.tags:
                try:
                    metadata.title = audio_file.tags.get('title', [None])[0]
                    metadata.artist = audio_file.tags.get('artist', [None])[0]
                    metadata.albumArtist = audio_file.tags.get('albumartist', [None])[0]
                    metadata.album = audio_file.tags.get('album', [None])[0]
                    metadata.genre = audio_file.tags.get('genre', [None])[0]
                except:
                    pass

            if hasattr(audio_file, 'info') and hasattr(audio_file.info, 'length'):
                metadata.duration = audio_file.info.length

        # Extract artwork
        metadata.artwork = extract_artwork(audio_file, str(full_filepath))

        print(f"Extracted metadata: title={metadata.title}, artist={metadata.artist}, has_artwork={metadata.artwork is not None}")

        return metadata

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error extracting metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error extracting metadata: {str(e)}")


@app.get("/")
def read_root():
    cursor.execute("SELECT * FROM songs")
    songs = cursor.fetchall()
    return {"songs": songs}

@app.get("/write-metadata/{song_id}")
def write_song_metadata(song_id: int):
    """
    Write metadata from database to the actual audio file using mutagen.
    """
    print(f"Writing metadata to disk for song ID: {song_id}")
    try:
        # Query song with all related metadata
        query = """
        SELECT
            s.id, s.name, s.filepath, s.genre, s.year, s.track_number, s.duration,
            s.artwork_path, a.name as album_name, a.year as album_year, a.genre as album_genre,
            a.artwork_path as album_artwork_path,
            GROUP_CONCAT(ar.name, ', ') as artists,
            (
                SELECT GROUP_CONCAT(ar2.name, ', ')
                FROM album_artists aa
                LEFT JOIN artists ar2 ON aa.artist_id = ar2.id
                WHERE aa.album_id = s.album_id
                ORDER BY aa."order"
            ) as album_artists,
            (
                SELECT GROUP_CONCAT(p.name, ', ')
                FROM song_producers sp
                LEFT JOIN producers p ON sp.producer_id = p.id
                WHERE sp.song_id = s.id
                ORDER BY sp."order"
            ) as producers
        FROM songs s
        LEFT JOIN albums a ON s.album_id = a.id
        LEFT JOIN song_artists sa ON s.id = sa.song_id
        LEFT JOIN artists ar ON sa.artist_id = ar.id
        WHERE s.id = ?
        GROUP BY s.id
        """

        cursor.execute(query, (song_id,))
        song_data = cursor.fetchone()

        if not song_data:
            print(f"Song with ID {song_id} not found")
            raise HTTPException(status_code=404, detail=f"Song with ID {song_id} not found")

        # Extract song data
        song_id, song_name, filepath, genre, year, track_number, duration, song_artwork_path, album_name, album_year, album_genre, album_artwork_path, artists, album_artists, producers = song_data

        print(f"=== SONG DATA ===")
        print(f"Song ID: {song_id}, Name: {song_name}")
        print(f"Song artwork path: {song_artwork_path}")
        print(f"Album name: {album_name}")
        print(f"Album artwork path: {album_artwork_path}")

        # Determine album artist: use album's artists if available, otherwise fall back to song artists
        albumartist = album_artists if album_artists else artists

        # Check if file exists
        full_filepath = Path("../svelte/static" + filepath)
        if not full_filepath.exists():
            print(f"Audio file not found at {filepath}")
            raise HTTPException(status_code=404, detail=f"Audio file not found at {filepath}")
        
        print(f"Audio file found at {full_filepath}")

        # Load the audio file with mutagen to detect type
        audio_file = MutagenFile(str(full_filepath))

        if audio_file is None:
            print(f"Unsupported audio file format: {full_filepath.suffix}")
            raise HTTPException(status_code=400, detail=f"Unsupported audio file format: {full_filepath.suffix}")

        # Write metadata based on file type
        if isinstance(audio_file, (MP3, WAVE)):
            # For MP3 and WAV files, use EasyID3 for simplified tag handling
            try:
                easy_file = EasyID3(str(full_filepath))
            except:
                # Create new tags if they don't exist
                audio_file.add_tags()
                audio_file.save()
                easy_file = EasyID3(str(full_filepath))

            # Clear existing tags
            easy_file.delete()

            # Set metadata using simple key-value pairs
            if song_name:
                easy_file['title'] = song_name
            if artists:
                easy_file['artist'] = artists
            if albumartist:
                easy_file['albumartist'] = albumartist
            if album_name:
                easy_file['album'] = album_name
            if genre:
                easy_file['genre'] = genre
            if year:
                easy_file['date'] = str(year)
            if track_number:
                easy_file['tracknumber'] = str(track_number)
            if producers:
                easy_file['composer'] = producers  # Map producers to composer field

            easy_file.save()

            # Embed artwork after text metadata
            embed_artwork(audio_file, song_artwork_path, album_artwork_path, str(full_filepath))

        elif isinstance(audio_file, MP4):
            # For MP4/M4A files, use EasyMP4
            try:
                easy_file = EasyMP4(str(full_filepath))
            except:
                audio_file.add_tags()
                audio_file.save()
                easy_file = EasyMP4(str(full_filepath))

            easy_file.delete()

            if song_name:
                easy_file['title'] = song_name
            if artists:
                easy_file['artist'] = artists
            if albumartist:
                easy_file['albumartist'] = albumartist
            if album_name:
                easy_file['album'] = album_name
            if genre:
                easy_file['genre'] = genre
            if year:
                easy_file['date'] = str(year)
            if track_number:
                easy_file['tracknumber'] = str(track_number)
            if producers:
                easy_file['composer'] = producers  # Map producers to composer field

            easy_file.save()

            # Embed artwork after text metadata
            embed_artwork(audio_file, song_artwork_path, album_artwork_path, str(full_filepath))

        elif isinstance(audio_file, (FLAC, OggVorbis)):
            # For FLAC and OGG files, use Vorbis comments
            if not audio_file.tags:
                audio_file.add_tags()

            # Clear existing tags
            audio_file.tags.clear()

            # Set metadata
            if song_name:
                audio_file.tags['title'] = song_name
            if artists:
                audio_file.tags['artist'] = artists
            if albumartist:
                audio_file.tags['albumartist'] = albumartist
            if album_name:
                audio_file.tags['album'] = album_name
            if genre:
                audio_file.tags['genre'] = genre
            if year:
                audio_file.tags['date'] = str(year)
            if producers:
                audio_file.tags['producer'] = producers
            if track_number:
                audio_file.tags['tracknumber'] = str(track_number)

            audio_file.save()

            # Embed artwork after text metadata
            embed_artwork(audio_file, song_artwork_path, album_artwork_path, str(full_filepath))

        else:
            # Try generic approach for other formats
            if not audio_file.tags:
                audio_file.add_tags()

            tags = audio_file.tags

            # Attempt to set tags using common Vorbis-style keys
            try:
                if song_name:
                    tags['title'] = song_name
                if artists:
                    tags['artist'] = artists
                if albumartist:
                    tags['albumartist'] = albumartist
                if album_name:
                    tags['album'] = album_name
                if genre:
                    tags['genre'] = genre
                if year:
                    tags['date'] = str(year)
                if producers:
                    tags['producer'] = producers
                if track_number:
                    tags['tracknumber'] = str(track_number)

                audio_file.save()

                # Embed artwork after text metadata
                embed_artwork(audio_file, song_artwork_path, album_artwork_path, str(full_filepath))
            except Exception as e:
                print(f"Error embedding artwork: {str(e)}")
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported audio file format: {type(audio_file).__name__}. Error: {str(e)}"
                )

        return {
            "success": True,
            "message": f"Metadata successfully written to {filepath}",
            "song_id": song_id,
            "metadata_written": {
                "title": song_name,
                "artist": artists,
                "albumartist": albumartist,
                "album": album_name,
                "genre": genre,
                "year": year,
                "producers": producers,
                "track_number": track_number
            }
        }
        
    except HTTPException:
        print(f"HTTPException: {str(e)}")
        raise
    except Exception as e:
        print(f"Exception: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error writing metadata: {str(e)}")