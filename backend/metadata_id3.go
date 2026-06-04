package backend

import (
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/bogem/id3v2"
)

// id3Adapter handles MP3 via bogem/id3v2.
type id3Adapter struct{}

func (id3Adapter) Write(path string, tags SongTags) error {
	t, err := id3v2.Open(path, id3v2.Options{Parse: true})
	if err != nil {
		return err
	}
	defer t.Close()

	t.DeleteAllFrames()

	if tags.Title != "" {
		t.SetTitle(tags.Title)
	}
	if tags.Artist != "" {
		t.SetArtist(tags.Artist)
	}
	if tags.AlbumArtist != "" {
		t.AddTextFrame(t.CommonID("Band/Orchestra/Accompaniment"), t.DefaultEncoding(), tags.AlbumArtist)
	}
	if tags.Album != "" {
		t.SetAlbum(tags.Album)
	}
	if tags.Genre != "" {
		t.SetGenre(tags.Genre)
	}
	if tags.Year > 0 {
		t.SetYear(fmt.Sprintf("%d", tags.Year))
	}
	if tags.TrackNumberStr != "" {
		t.AddTextFrame(t.CommonID("Track number/Position in set"), t.DefaultEncoding(), tags.TrackNumberStr)
	}
	if tags.Producers != "" {
		t.AddTextFrame(t.CommonID("Composer"), t.DefaultEncoding(), tags.Producers)
	}

	if tags.ArtworkPath != "" {
		artData, err := os.ReadFile(tags.ArtworkPath)
		if err == nil {
			mime := tags.ArtworkMimeType
			if mime == "" {
				mime = "image/jpeg"
			}
			pic := id3v2.PictureFrame{
				Encoding:    id3v2.EncodingUTF8,
				MimeType:    mime,
				PictureType: id3v2.PTFrontCover,
				Description: "Front Cover",
				Picture:     artData,
			}
			t.AddAttachedPicture(pic)
		}
	}

	return t.Save()
}

func (id3Adapter) Read(path string) (SongTags, error) {
	t, err := id3v2.Open(path, id3v2.Options{Parse: true})
	if err != nil {
		return SongTags{}, err
	}
	defer t.Close()

	out := SongTags{
		Title:       t.Title(),
		Artist:      t.Artist(),
		Album:       t.Album(),
		Genre:       t.Genre(),
		AlbumArtist: t.GetTextFrame(t.CommonID("Band/Orchestra/Accompaniment")).Text,
	}
	if y, err := strconv.Atoi(t.Year()); err == nil {
		out.Year = int32(y)
	}
	out.TrackNumberStr = t.GetTextFrame(t.CommonID("Track number/Position in set")).Text
	if out.TrackNumberStr != "" {
		// parse "n" or "n/total"
		parts := strings.SplitN(out.TrackNumberStr, "/", 2)
		if n, err := strconv.Atoi(parts[0]); err == nil {
			out.TrackNumber = int32(n)
		}
		if len(parts) == 2 {
			if n, err := strconv.Atoi(parts[1]); err == nil {
				out.TrackTotal = int32(n)
			}
		}
	}
	out.Producers = t.GetTextFrame(t.CommonID("Composer")).Text

	if pics := t.GetFrames(t.CommonID("Attached picture")); len(pics) > 0 {
		if pf, ok := pics[0].(id3v2.PictureFrame); ok {
			out.ArtworkMimeType = pf.MimeType
			// store length-indicator via path-less marker; embedded payload is in pf.Picture
			// callers comparing equality rely on Read returning non-empty MIME when art exists
			if len(pf.Picture) > 0 {
				out.ArtworkPath = "embedded"
			}
		}
	}
	return out, nil
}
