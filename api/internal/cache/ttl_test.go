package cache

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestCacheCoalescesWithoutCrossingIdentityAndDoesNotCacheErrors(t *testing.T) {
	c := New[string](2, time.Second)
	var calls atomic.Int32
	load := func(context.Context) (string, error) {
		calls.Add(1)
		time.Sleep(10 * time.Millisecond)
		return "alice", nil
	}
	var wg sync.WaitGroup
	for range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			v, err := c.Get(context.Background(), "alice:event", load)
			if err != nil || v != "alice" {
				t.Error(v, err)
			}
		}()
	}
	wg.Wait()
	if calls.Load() != 1 {
		t.Fatalf("stampede: %d", calls.Load())
	}
	v, _ := c.Get(context.Background(), "bob:event", func(context.Context) (string, error) { return "bob", nil })
	if v != "bob" {
		t.Fatal("cross-user cache leak")
	}
	c = New[string](2, time.Second)
	_, _ = c.Get(context.Background(), "bad", func(context.Context) (string, error) { return "", errors.New("unavailable") })
	v, err := c.Get(context.Background(), "bad", load)
	if v != "alice" || err != nil {
		t.Fatal("cached failure")
	}
}

func TestCancelledCacheWaiterDoesNotCancelOtherRequest(t *testing.T) {
	c := New[int](2, time.Second)
	entered, release, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	go func() {
		defer close(done)
		_, _ = c.Get(context.Background(), "key", func(context.Context) (int, error) { close(entered); <-release; return 7, nil })
	}()
	<-entered
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := c.Get(ctx, "key", func(context.Context) (int, error) { t.Error("duplicate query"); return 0, nil })
	if !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	close(release)
	<-done
	v, err := c.Get(context.Background(), "key", func(context.Context) (int, error) { t.Error("lost cached result"); return 0, nil })
	if v != 7 || err != nil {
		t.Fatal(v, err)
	}
}
