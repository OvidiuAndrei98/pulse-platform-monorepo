// Package cache coalesces short-lived display queries. Never use it to authorize
// a request, reserve inventory, or decide whether a ticket has been consumed.
package cache

import (
	"context"
	"sync"
	"time"
)

type entry[T any] struct {
	ready   chan struct{}
	value   T
	err     error
	expires time.Time
}
type TTL[T any] struct {
	mu       sync.Mutex
	items    map[string]*entry[T]
	limit    int
	duration time.Duration
}

func New[T any](limit int, duration time.Duration) *TTL[T] {
	return &TTL[T]{items: make(map[string]*entry[T]), limit: limit, duration: duration}
}
func (c *TTL[T]) Get(ctx context.Context, key string, load func(context.Context) (T, error)) (T, error) {
	if c == nil {
		return load(ctx)
	}
	c.mu.Lock()
	now := time.Now()
	for key, item := range c.items {
		if !item.expires.IsZero() && !item.expires.After(now) {
			delete(c.items, key)
		}
	}
	if item := c.items[key]; item != nil {
		c.mu.Unlock()
		select {
		case <-ctx.Done():
			var zero T
			return zero, ctx.Err()
		case <-item.ready:
			return item.value, item.err
		}
	}
	// The cache never grows with arbitrary filter/user combinations.
	if len(c.items) >= c.limit {
		c.mu.Unlock()
		return load(ctx)
	}
	item := &entry[T]{ready: make(chan struct{})}
	c.items[key] = item
	c.mu.Unlock()
	value, err := load(ctx)
	c.mu.Lock()
	item.value, item.err, item.expires = value, err, time.Now().Add(c.duration)
	if err != nil {
		delete(c.items, key)
	}
	close(item.ready)
	c.mu.Unlock()
	return value, err
}
