package backend

import "database/sql"

// InTx runs fn inside a transaction. Commits on success, rolls back on
// error or panic. Panics are re-raised after rollback so callers see them.
func (a *App) InTx(fn func(*sql.Tx) error) error {
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
	}()
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}
