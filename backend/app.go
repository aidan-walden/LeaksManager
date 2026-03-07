package backend

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log"
	"os"
	"path/filepath"
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

	var err error
	a.dbPath, a.staticPath, err = resolveAppPaths(ctx)
	if err != nil {
		panic("Failed to determine app paths: " + err.Error())
	}

	if err := os.MkdirAll(filepath.Join(a.staticPath, "uploads", "songs"), 0755); err != nil {
		panic("Failed to create uploads songs directory: " + err.Error())
	}
	if err := os.MkdirAll(filepath.Join(a.staticPath, "uploads", "artwork"), 0755); err != nil {
		panic("Failed to create uploads artwork directory: " + err.Error())
	}
	if err := os.MkdirAll(filepath.Dir(a.dbPath), 0755); err != nil {
		panic("Failed to create app data directory: " + err.Error())
	}

	// initialize SQLite connection
	// go's sql.DB handles connection pooling automatically (replaces python's thread_local)
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
