// Calls the behavior fixture service through the generated Go SDK and checks every result.
// Run by tests/sdk-behavior.spec.ts with the server address as the only argument.
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	sdk "example.com/behavior-sdk-go"
	"example.com/behavior-sdk-go/pb"
)

const (
	workspaceA = "3f2b8c1e-5a47-4d3e-9b6a-1c2d3e4f5a6b"
	workspaceB = "9b2f6c1e-5a47-4d3e-9b6a-1c2d3e4f5a6b"
	megabyte   = 1024 * 1024
)

var failed int

func check(name string, ok bool, got ...any) {
	if ok {
		fmt.Printf("PASS %s\n", name)
		return
	}
	failed++
	fmt.Printf("FAIL %s -> got %+v\n", name, got)
}

func query(name string) *pb.BehaviorQueryDto {
	return &pb.BehaviorQueryDto{Name: name}
}

func businessError(err error) *sdk.Error {
	var sdkErr *sdk.Error
	if errors.As(err, &sdkErr) {
		return sdkErr
	}
	return nil
}

func dial(address string, opts ...grpc.DialOption) *grpc.ClientConn {
	opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	conn, err := grpc.NewClient(address, opts...)
	if err != nil {
		fmt.Println("cannot create the gRPC client:", err)
		os.Exit(1)
	}
	return conn
}

func main() {
	address := os.Args[1]
	conn := dial(address)
	defer conn.Close()
	client := sdk.NewBehaviorMicroserviceClient(conn, sdk.WithTimeout(10*time.Second))
	ctx := context.Background()

	one, err := client.FindOne(ctx, query("apple"))
	check("single model", err == nil && one.GetName() == "apple" && one.GetPrice() == 1.5 && one.GetKind() == string(sdk.BehaviorKindEnumBasic), one, err)

	many, err := client.FindMany(ctx, &pb.BehaviorQueryDto{Name: "apple", Count: 3})
	check("list of models", err == nil && len(many) == 3 && many[2].GetIndex() == 2 && many[1].GetKind() == string(sdk.BehaviorKindEnumPremium), many, err)
	none, err := client.FindMany(ctx, query("apple"))
	check("empty list", err == nil && len(none) == 0, none, err)

	name, err := client.GetName(ctx, query("apple"))
	check("native string", err == nil && name == "hello apple", name, err)
	count, err := client.CountItems(ctx, &pb.BehaviorQueryDto{Name: "apple", Count: 7})
	check("native number", err == nil && count == 7, count, err)
	active, err := client.IsActive(ctx, query("inactive"))
	check("native boolean false", err == nil && !active, active, err)
	tags, err := client.GetTags(ctx, &pb.BehaviorQueryDto{Name: "apple", Count: 2})
	check("native list", err == nil && len(tags) == 2 && tags[1] == "tag-1", tags, err)

	found, err := client.MaybeFindOne(ctx, query("apple"))
	check("nullable model with a value", err == nil && found != nil && found.GetName() == "apple", found, err)
	found, err = client.MaybeFindOne(ctx, query("missing"))
	check("nullable model without a value", err == nil && found == nil, found, err)

	maybeName, err := client.MaybeGetName(ctx, query("apple"))
	check("nullable string with a value", err == nil && maybeName != nil && *maybeName == "hello apple", maybeName, err)
	maybeName, err = client.MaybeGetName(ctx, query("missing"))
	check("nullable string without a value", err == nil && maybeName == nil, maybeName, err)
	maybeActive, err := client.MaybeIsActive(ctx, query("inactive"))
	check("nullable boolean false is a value", err == nil && maybeActive != nil && !*maybeActive, maybeActive, err)
	maybeActive, err = client.MaybeIsActive(ctx, query("missing"))
	check("nullable boolean without a value", err == nil && maybeActive == nil, maybeActive, err)
	maybeCount, err := client.MaybeCount(ctx, query("apple"))
	check("nullable number zero is a value", err == nil && maybeCount != nil && *maybeCount == 0, maybeCount, err)
	maybeCount, err = client.MaybeCount(ctx, query("missing"))
	check("nullable number without a value", err == nil && maybeCount == nil, maybeCount, err)

	check("empty request and response", client.Ping(ctx) == nil)

	_, err = client.Fail(ctx, query("apple"))
	sdkErr := businessError(err)
	check("business error", sdkErr != nil && sdkErr.Code == 400 && strings.Contains(sdkErr.Message, "cannot process apple"), err)
	_, err = client.FindMany(ctx, &pb.BehaviorQueryDto{Name: "apple", Count: -1})
	check("validation error", businessError(err) != nil && businessError(err).Code == 400, err)

	withDefault := sdk.NewBehaviorMicroserviceClient(conn, sdk.WithMetadata(metadata.Pairs("workspace-id", workspaceA)))
	workspace, err := withDefault.GetWorkspace(ctx)
	check("default metadata", err == nil && workspace == workspaceA, workspace, err)
	workspace, err = withDefault.GetWorkspace(ctx, sdk.WithMetadata(metadata.Pairs("workspace-id", workspaceB)))
	check("per-call metadata overrides the default", err == nil && workspace == workspaceB, workspace, err)

	_, err = client.FindMany(ctx, &pb.BehaviorQueryDto{Name: "apple", DelayMs: 500}, sdk.WithTimeout(50*time.Millisecond))
	check("timeout is DEADLINE_EXCEEDED", status.Code(err) == codes.DeadlineExceeded, err)

	large := &pb.BehaviorQueryDto{Name: "apple", Count: 1, PayloadBytes: 5 * megabyte}
	_, err = client.FindMany(ctx, large)
	check("5 MiB response is rejected by the default 4 MiB limit", status.Code(err) == codes.ResourceExhausted, err)
	bigConn := dial(address, grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(16*megabyte)))
	defer bigConn.Close()
	big, err := sdk.NewBehaviorMicroserviceClient(bigConn).FindMany(ctx, large)
	check("5 MiB response with a raised limit", err == nil && len(big) == 1 && len(big[0].GetPayload()) == 5*megabyte, len(big), err)

	checkStreams(ctx, client)
	checkConcurrency(ctx, client)

	closed := dial("127.0.0.1:1")
	defer closed.Close()
	_, err = sdk.NewBehaviorMicroserviceClient(closed, sdk.WithTimeout(5*time.Second)).GetName(ctx, query("apple"))
	check("no server is UNAVAILABLE", status.Code(err) == codes.Unavailable, err)

	fmt.Printf("Done: %d check(s) failed\n", failed)
	if failed > 0 {
		os.Exit(1)
	}
}

func checkStreams(ctx context.Context, client *sdk.BehaviorMicroserviceClient) {
	stream, err := client.WatchItems(ctx, &pb.BehaviorQueryDto{Name: "apple", Count: 3})
	if err != nil {
		check("stream opens", false, err)
		return
	}
	var indexes []int32
	for {
		item, recvErr := stream.Recv()
		if recvErr != nil {
			err = recvErr
			break
		}
		indexes = append(indexes, item.GetIndex())
	}
	check("stream delivers every item then io.EOF", errors.Is(err, io.EOF) && fmt.Sprint(indexes) == "[0 1 2]", indexes, err)

	stream, err = client.WatchItems(ctx, query("fail"))
	received := 0
	for err == nil {
		if _, err = stream.Recv(); err == nil {
			received++
		}
	}
	check("stream error after two items is a business error", received == 2 && businessError(err) != nil && businessError(err).Code == 400, received, err)

	stream, err = client.WatchItems(ctx, query("endless"))
	if err != nil {
		check("endless stream opens", false, err)
		return
	}
	_, first := stream.Recv()
	_, second := stream.Recv()
	stream.Close()
	_, afterClose := stream.Recv()
	for i := 0; afterClose == nil && i < 100; i++ {
		_, afterClose = stream.Recv()
	}
	check("stream closed early stops with CANCELLED", first == nil && second == nil && status.Code(afterClose) == codes.Canceled, first, second, afterClose)
}

func checkConcurrency(ctx context.Context, client *sdk.BehaviorMicroserviceClient) {
	const calls = 20
	results := make([]string, calls)
	var group sync.WaitGroup
	for i := 0; i < calls; i++ {
		group.Add(1)
		go func(i int) {
			defer group.Done()
			name, err := client.GetName(ctx, query(fmt.Sprintf("user-%d", i)))
			if err == nil {
				results[i] = name
			}
		}(i)
	}
	group.Wait()
	ok := true
	for i, result := range results {
		ok = ok && result == fmt.Sprintf("hello user-%d", i)
	}
	check("20 concurrent calls on one client", ok, results)
}
