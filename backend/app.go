package backend

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite3"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	sqlite3driver "github.com/mattn/go-sqlite3"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func init() {
	sql.Register("sqlite3_custom", &sqlite3driver.SQLiteDriver{
		ConnectHook: func(conn *sqlite3driver.SQLiteConn) error {
			if err := conn.RegisterFunc("LOWER", func(s string) string {
				return strings.ToLower(s)
			}, true); err != nil {
				return err
			}
			return nil
		},
	})
}

// --- App Structure ---

type App struct {
	ctx        context.Context
	db         *sql.DB
	dbPath     string
	staticPath string
}

func NewApp() *App {
	return &App{}
}

func (a *App) runMigrations() error {
	// create migration source from embedded files
	source, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("failed to create migration source: %w", err)
	}

	// create database driver instance
	driver, err := sqlite3.WithInstance(a.db, &sqlite3.Config{})
	if err != nil {
		return fmt.Errorf("failed to create database driver: %w", err)
	}

	// create migrate instance
	m, err := migrate.NewWithInstance("iofs", source, "sqlite3", driver)
	if err != nil {
		return fmt.Errorf("failed to create migrate instance: %w", err)
	}

	// run migrations
	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	log.Println("Database migrations completed successfully")
	return nil
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx

	// determine base paths for database and static files
	// in development: use relative path from project root
	// in production: use user data directory

	// check if running in dev mode (wails dev) vs production build
	// in dev mode, use relative paths; in production, use app data directory
	if _, err := os.Stat("svelte/local.db"); err == nil {
		// development mode - database exists in svelte directory
		a.dbPath = "svelte/local.db"
		a.staticPath = "svelte"
		// ensure uploads directories exist in dev mode too
		os.MkdirAll("svelte/uploads/songs", 0755)
		os.MkdirAll("svelte/uploads/artwork", 0755)
	} else {
		// production mode - use user data directory
		// on macOS: ~/Library/Application Support/leaks-manager
		// on Windows: %APPDATA%/leaks-manager
		// on Linux: ~/.local/share/leaks-manager
		homeDir, _ := os.UserHomeDir()
		var dataDir string
		if runtime.GOOS == "darwin" {
			dataDir = filepath.Join(homeDir, "Library", "Application Support", "leaks-manager")
		} else if runtime.GOOS == "windows" {
			dataDir = filepath.Join(homeDir, "AppData", "Roaming", "leaks-manager")
		} else {
			dataDir = filepath.Join(homeDir, ".local", "share", "leaks-manager")
		}

		// create data directory if it doesn't exist
		os.MkdirAll(dataDir, 0755)
		os.MkdirAll(filepath.Join(dataDir, "uploads", "songs"), 0755)
		os.MkdirAll(filepath.Join(dataDir, "uploads", "artwork"), 0755)

		a.dbPath = filepath.Join(dataDir, "local.db")
		a.staticPath = dataDir

		// copy database from bundle if it doesn't exist
		if _, err := os.Stat(a.dbPath); os.IsNotExist(err) {
			// in production, start with empty database or copy from bundle
			// for now, just let SQLite create it
		}
	}

	// initialize SQLite connection
	// go's sql.DB handles connection pooling automatically (replaces python's thread_local)
	var err error
	a.db, err = sql.Open("sqlite3_custom", a.dbPath)
	if err != nil {
		panic("Failed to connect to database: " + err.Error())
	}

	// run migrations
	if err := a.runMigrations(); err != nil {
		panic("Failed to run database migrations: " + err.Error())
	}
}

func (a *App) Shutdown(ctx context.Context) {
	if a.db != nil {
		a.db.Close()
	}
}