package backend

import (
	"fmt"
	"os"

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
