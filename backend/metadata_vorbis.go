package backend

import (
	"encoding/base64"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/ambeloe/oggv/vorbiscomment"
	"github.com/go-flac/flacpicture"
	"github.com/go-flac/flacvorbis"
	flac "github.com/go-flac/go-flac"
)

// flacAdapter handles FLAC via go-flac + flacvorbis + flacpicture.
type flacAdapter struct{}

func (flacAdapter) Write(path string, tags SongTags) error {
	f, err := flac.ParseFile(path)
	if err != nil {
		return fmt.Errorf("failed to parse flac file: %w", err)
	}

	var cmt *flacvorbis.MetaDataBlockVorbisComment
	cmtIndex := -1
	for i, m := range f.Meta {
		if m.Type == flac.VorbisComment {
			cmt, err = flacvorbis.ParseFromMetaDataBlock(*m)
			if err != nil {
				return fmt.Errorf("failed to parse vorbis comments: %w", err)
			}
			cmtIndex = i
			break
		}
	}
	if cmt == nil {
		cmt = flacvorbis.New()
	}

	cmt.Comments = []string{}
	if tags.Title != "" {
		cmt.Add(flacvorbis.FIELD_TITLE, tags.Title)
	}
	if tags.Artist != "" {
		cmt.Add(flacvorbis.FIELD_ARTIST, tags.Artist)
	}
	if tags.AlbumArtist != "" {
		cmt.Add("ALBUMARTIST", tags.AlbumArtist)
	}
	if tags.Album != "" {
		cmt.Add(flacvorbis.FIELD_ALBUM, tags.Album)
	}
	if tags.Genre != "" {
		cmt.Add(flacvorbis.FIELD_GENRE, tags.Genre)
	}
	if tags.Year > 0 {
		cmt.Add(flacvorbis.FIELD_DATE, fmt.Sprintf("%d", tags.Year))
	}
	if tags.TrackNumberStr != "" {
		cmt.Add(flacvorbis.FIELD_TRACKNUMBER, tags.TrackNumberStr)
	}
	if tags.Producers != "" {
		cmt.Add("PRODUCER", tags.Producers)
	}

	cmtBlock := cmt.Marshal()
	if cmtIndex >= 0 {
		f.Meta[cmtIndex] = &cmtBlock
	} else {
		f.Meta = append(f.Meta, &cmtBlock)
	}

	if tags.ArtworkPath != "" {
		artData, err := os.ReadFile(tags.ArtworkPath)
		if err == nil {
			mime := tags.ArtworkMimeType
			if mime == "" {
				mime = "image/jpeg"
			}
			picture, perr := flacpicture.NewFromImageData(
				flacpicture.PictureTypeFrontCover,
				"Front Cover",
				artData,
				mime,
			)
			if perr == nil {
				pictureBlock := picture.Marshal()
				newMeta := make([]*flac.MetaDataBlock, 0, len(f.Meta))
				for _, m := range f.Meta {
					if m.Type != flac.Picture {
						newMeta = append(newMeta, m)
					}
				}
				newMeta = append(newMeta, &pictureBlock)
				f.Meta = newMeta
			}
		}
	}

	return f.Save(path)
}

// oggAdapter handles OGG Vorbis via ambeloe/oggv. Vorbis comment semantics
// match FLAC, but the container format and write strategy differ (temp swap).
type oggAdapter struct{}

func (oggAdapter) Write(path string, tags SongTags) error {
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("failed to open ogg file: %w", err)
	}

	comments, err := vorbiscomment.ReadOggVorbis(file)
	if err != nil {
		file.Close()
		return fmt.Errorf("failed to read vorbis comments: %w", err)
	}
	file.Close()

	comments.Comments = []string{}

	setComment := func(key, value string) {
		newComments := make([]string, 0, len(comments.Comments)+1)
		for _, c := range comments.Comments {
			if !strings.HasPrefix(strings.ToUpper(c), strings.ToUpper(key)+"=") {
				newComments = append(newComments, c)
			}
		}
		newComments = append(newComments, key+"="+value)
		comments.Comments = newComments
	}

	if tags.Title != "" {
		setComment("TITLE", tags.Title)
	}
	if tags.Artist != "" {
		setComment("ARTIST", tags.Artist)
	}
	if tags.AlbumArtist != "" {
		setComment("ALBUMARTIST", tags.AlbumArtist)
	}
	if tags.Album != "" {
		setComment("ALBUM", tags.Album)
	}
	if tags.Genre != "" {
		setComment("GENRE", tags.Genre)
	}
	if tags.Year > 0 {
		setComment("DATE", strconv.Itoa(int(tags.Year)))
	}
	if tags.TrackNumberStr != "" {
		setComment("TRACKNUMBER", tags.TrackNumberStr)
	}
	if tags.Producers != "" {
		setComment("PRODUCER", tags.Producers)
	}

	if tags.ArtworkPath != "" {
		artData, err := os.ReadFile(tags.ArtworkPath)
		if err == nil {
			mime := tags.ArtworkMimeType
			if mime == "" {
				mime = "image/jpeg"
			}
			picture, perr := flacpicture.NewFromImageData(
				flacpicture.PictureTypeFrontCover,
				"Front Cover",
				artData,
				mime,
			)
			if perr == nil {
				pictureBlock := picture.Marshal()
				artBase64 := base64.StdEncoding.EncodeToString(pictureBlock.Data)
				setComment("METADATA_BLOCK_PICTURE", artBase64)
			}
		}
	}

	tempPath := path + ".tmp"
	tempFile, err := os.Create(tempPath)
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	if err := vorbiscomment.WriteOggVorbis(tempFile, comments); err != nil {
		tempFile.Close()
		os.Remove(tempPath)
		return fmt.Errorf("failed to write vorbis comments: %w", err)
	}
	tempFile.Close()

	if err := os.Rename(tempPath, path); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("failed to replace original file: %w", err)
	}
	return nil
}
