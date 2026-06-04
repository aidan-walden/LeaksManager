package backend

import (
	"database/sql"
	"errors"
	"testing"
)

func TestInTxCommitsAndRollsBackOnError(t *testing.T) {
	app := newTestApp(t)

	// success path commits
	if err := app.InTx(func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO artists (name) VALUES (?)`, "kept")
		return err
	}); err != nil {
		t.Fatalf("commit path returned error: %v", err)
	}

	// error path rolls back
	sentinel := errors.New("nope")
	if err := app.InTx(func(tx *sql.Tx) error {
		if _, err := tx.Exec(`INSERT INTO artists (name) VALUES (?)`, "discarded"); err != nil {
			return err
		}
		return sentinel
	}); !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel error, got %v", err)
	}

	var count int
	if err := app.db.QueryRow(`SELECT COUNT(*) FROM artists WHERE name IN ('kept','discarded')`).Scan(&count); err != nil {
		t.Fatalf("count query: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 surviving row, got %d", count)
	}
}

func TestInTxRollsBackOnPanicAndRepanics(t *testing.T) {
	app := newTestApp(t)

	func() {
		defer func() {
			r := recover()
			if r == nil {
				t.Fatal("expected panic to propagate")
			}
			if r != "boom" {
				t.Fatalf("expected panic value 'boom', got %v", r)
			}
		}()

		_ = app.InTx(func(tx *sql.Tx) error {
			if _, err := tx.Exec(`INSERT INTO artists (name) VALUES (?)`, "ghost"); err != nil {
				t.Fatalf("insert failed: %v", err)
			}
			panic("boom")
		})
	}()

	var count int
	if err := app.db.QueryRow(`SELECT COUNT(*) FROM artists WHERE name = 'ghost'`).Scan(&count); err != nil {
		t.Fatalf("count query: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected panic to roll back insert, got %d rows", count)
	}
}
