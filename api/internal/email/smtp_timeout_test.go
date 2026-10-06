package email

import (
	"context"
	"net"
	"testing"
	"time"
)

func TestSMTPHonorsCancellationWhileWaitingForGreeting(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	done := make(chan struct{})
	go func() {
		defer close(done)
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		_ = conn.SetReadDeadline(time.Now().Add(time.Second))
		_, _ = conn.Read(make([]byte, 1))
	}()
	host, port, _ := net.SplitHostPort(listener.Addr().String())
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	start := time.Now()
	if err := sendSMTP(ctx, host, port, nil, "from@example.invalid", "to@example.invalid", nil); err == nil {
		t.Fatal("stalled SMTP succeeded")
	}
	if time.Since(start) > time.Second {
		t.Fatal("SMTP ignored deadline")
	}
	<-done
}
