package users

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	db "pulse-api/db/generated"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestConcurrentAvatarSwapsKeepOnlyReferencedObject(t *testing.T) {
	dsn := os.Getenv("ISOLATION_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires isolated migrated DB")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ConnConfig.Host != "127.0.0.1" || cfg.ConnConfig.Database != "spottr_security_test" {
		t.Fatal("refusing non-test database")
	}
	ctx := context.Background()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var userID pgtype.UUID
	name := fmt.Sprintf("avatar-%d", time.Now().UnixNano())
	if err := pool.QueryRow(ctx, `INSERT INTO users(username,email,password_hash,role,is_active) VALUES($1,$2,'test','user',true) RETURNING id`, name, name+"@example.invalid").Scan(&userID); err != nil {
		t.Fatal(err)
	}
	prefix := "avatars/" + userID.String() + "/"
	defer pool.Exec(ctx, "DELETE FROM users WHERE id=$1", userID)
	defer pool.Exec(ctx, "DELETE FROM user_media_deletion_jobs WHERE object_key LIKE $1", prefix+"%")
	h := NewHandler(db.New(pool), pool)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			key := prefix + fmt.Sprintf("%032x.webp", i)
			if _, err := pool.Exec(ctx, `INSERT INTO user_media_deletion_jobs(object_key,next_attempt_at) VALUES($1,now()+interval '1 hour')`, key); err != nil {
				t.Error(err)
				return
			}
			if _, err := h.replaceAvatar(ctx, userID, "https://example.invalid/api/v1/media/"+key, key); err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	var url string
	if err := pool.QueryRow(ctx, "SELECT avatar_url FROM users WHERE id=$1", userID).Scan(&url); err != nil {
		t.Fatal(err)
	}
	key := strings.TrimPrefix(url, "https://example.invalid/api/v1/media/")
	var queued bool
	var count int
	_ = pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM user_media_deletion_jobs WHERE object_key=$1)", key).Scan(&queued)
	_ = pool.QueryRow(ctx, "SELECT count(*) FROM user_media_deletion_jobs WHERE object_key LIKE $1", prefix+"%").Scan(&count)
	if queued || count != 19 {
		t.Fatalf("live image queued=%v, orphan cleanup jobs=%d", queued, count)
	}
}
