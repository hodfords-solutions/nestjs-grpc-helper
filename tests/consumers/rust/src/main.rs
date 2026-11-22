//! Calls the behavior fixture service through the generated Rust SDK and checks every result.
//! Run by tests/sdk-behavior.spec.ts with the server URL as the only argument.
use std::fmt::Debug;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use behavior_sdk::enums::BehaviorKindEnum;
use behavior_sdk::{
    pb, BehaviorMicroserviceClient, CallGuard, CallHook, CallOptions, ClientOptions, FlakyMicroserviceClient,
    RetryPolicy, Rpc, SdkError,
};
use tokio_stream::StreamExt;
use tonic::metadata::MetadataMap;
use tonic::Code;

const WORKSPACE: &str = "3f2b8c1e-5a47-4d3e-9b6a-1c2d3e4f5a6b";
const MEGABYTE: usize = 1024 * 1024;

struct Checks {
    failed: usize,
}

impl Checks {
    fn check<T: Debug>(&mut self, name: &str, ok: bool, got: T) {
        if ok {
            println!("PASS {name}");
        } else {
            self.failed += 1;
            println!("FAIL {name} -> got {got:?}");
        }
    }
}

fn plain() -> CallOptions {
    CallOptions::default()
}

fn query(name: &str) -> pb::BehaviorQueryDto {
    pb::BehaviorQueryDto { name: name.to_string(), ..Default::default() }
}

fn counted(name: &str, count: i32) -> pb::BehaviorQueryDto {
    pb::BehaviorQueryDto { count, ..query(name) }
}

fn is_business_error<T>(result: &Result<T, SdkError>, expected_code: i64, text: &str) -> bool {
    matches!(result, Err(SdkError::Service { code, message, .. }) if *code as i64 == expected_code && message.contains(text))
}

fn status_code<T>(result: &Result<T, SdkError>) -> Option<Code> {
    match result {
        Err(SdkError::Status(status)) => Some(status.code()),
        _ => None,
    }
}

type Recorded = Arc<Mutex<Vec<(Rpc, bool)>>>;

/// Adds the workspace metadata to every call and records each finished call with its outcome.
#[derive(Debug, Default)]
struct RecordingHook {
    calls: Recorded,
}

struct RecordingGuard {
    rpc: Rpc,
    calls: Recorded,
}

impl CallHook for RecordingHook {
    fn start(&self, rpc: Rpc, metadata: &mut MetadataMap) -> Box<dyn CallGuard> {
        metadata.insert("workspace-id", WORKSPACE.parse().expect("metadata value"));
        Box::new(RecordingGuard { rpc, calls: self.calls.clone() })
    }
}

impl CallGuard for RecordingGuard {
    fn finish(self: Box<Self>, outcome: Result<(), &SdkError>) {
        self.calls.lock().expect("lock").push((self.rpc, outcome.is_ok()));
    }
}

fn recording(options: ClientOptions) -> (ClientOptions, Recorded) {
    let calls = Recorded::default();
    let hook = RecordingHook { calls: calls.clone() };
    (ClientOptions { hook: Some(Arc::new(hook)), ..options }, calls)
}

fn rpc(service: &'static str, method: &'static str) -> Rpc {
    Rpc { service, method }
}

#[tokio::main]
async fn main() {
    let url = std::env::args().nth(1).expect("server URL");
    let options = ClientOptions { timeout: Some(Duration::from_secs(10)), ..Default::default() };
    let client = BehaviorMicroserviceClient::connect(url.clone(), options).await.expect("connect");
    let mut c = Checks { failed: 0 };

    let one = client.find_one(query("apple"), plain()).await;
    c.check(
        "single model",
        matches!(&one, Ok(item) if item.name == "apple" && item.price == 1.5 && item.kind == BehaviorKindEnum::Basic.as_str()),
        &one,
    );

    let many = client.find_many(counted("apple", 3), plain()).await;
    c.check(
        "list of models",
        matches!(&many, Ok(items) if items.len() == 3 && items[2].index == 2 && items[1].kind == BehaviorKindEnum::Premium.as_str()),
        &many,
    );
    let none = client.find_many(query("apple"), plain()).await;
    c.check("empty list", matches!(&none, Ok(items) if items.is_empty()), &none);

    let name = client.get_name(query("apple"), plain()).await;
    c.check("native string", matches!(&name, Ok(value) if value == "hello apple"), &name);
    let count = client.count_items(counted("apple", 7), plain()).await;
    c.check("native number", matches!(count, Ok(value) if value == 7.0), &count);
    let active = client.is_active(query("inactive"), plain()).await;
    c.check("native boolean false", matches!(active, Ok(false)), &active);
    let tags = client.get_tags(counted("apple", 2), plain()).await;
    c.check("native list", matches!(&tags, Ok(values) if values.len() == 2 && values[1] == "tag-1"), &tags);

    let found = client.maybe_find_one(query("apple"), plain()).await;
    c.check("nullable model with a value", matches!(&found, Ok(Some(item)) if item.name == "apple"), &found);
    let found = client.maybe_find_one(query("missing"), plain()).await;
    c.check("nullable model without a value", matches!(found, Ok(None)), &found);

    let maybe_name = client.maybe_get_name(query("apple"), plain()).await;
    c.check("nullable string with a value", matches!(&maybe_name, Ok(Some(value)) if value == "hello apple"), &maybe_name);
    let maybe_name = client.maybe_get_name(query("missing"), plain()).await;
    c.check("nullable string without a value", matches!(maybe_name, Ok(None)), &maybe_name);
    let maybe_active = client.maybe_is_active(query("inactive"), plain()).await;
    c.check("nullable boolean false is a value", matches!(maybe_active, Ok(Some(false))), &maybe_active);
    let maybe_active = client.maybe_is_active(query("missing"), plain()).await;
    c.check("nullable boolean without a value", matches!(maybe_active, Ok(None)), &maybe_active);
    let maybe_count = client.maybe_count(query("apple"), plain()).await;
    c.check("nullable number zero is a value", matches!(maybe_count, Ok(Some(value)) if value == 0.0), &maybe_count);
    let maybe_count = client.maybe_count(query("missing"), plain()).await;
    c.check("nullable number without a value", matches!(maybe_count, Ok(None)), &maybe_count);

    let ping = client.ping(plain()).await;
    c.check("empty request and response", ping.is_ok(), &ping);

    let failure = client.fail(query("apple"), plain()).await;
    c.check("business error", is_business_error(&failure, 400, "cannot process apple"), &failure);
    let invalid = client.find_many(counted("apple", -1), plain()).await.map(|items| items.len());
    c.check("validation error", is_business_error(&invalid, 400, ""), &invalid);

    let mut with_workspace = CallOptions::default();
    with_workspace.metadata.insert("workspace-id", WORKSPACE.parse().expect("metadata value"));
    let workspace = client.get_workspace(with_workspace).await;
    c.check("per-call metadata", matches!(&workspace, Ok(value) if value == WORKSPACE), &workspace);
    let mut metadata = MetadataMap::new();
    metadata.insert("workspace-id", WORKSPACE.parse().expect("metadata value"));
    let workspace = client.get_workspace(metadata).await;
    c.check("a MetadataMap as call options", matches!(&workspace, Ok(value) if value == WORKSPACE), &workspace);

    let slow = pb::BehaviorQueryDto { delay_ms: 500, ..query("apple") };
    let short = CallOptions { timeout: Some(Duration::from_millis(50)), ..Default::default() };
    let timed_out = client.find_many(slow, short).await.map(|items| items.len());
    c.check("timeout is DEADLINE_EXCEEDED", status_code(&timed_out) == Some(Code::DeadlineExceeded), &timed_out);

    let large = pb::BehaviorQueryDto { payload_bytes: (5 * MEGABYTE) as i32, ..counted("apple", 1) };
    let rejected = client.find_many(large.clone(), plain()).await.map(|items| items.len());
    c.check("5 MiB response is rejected by the default 4 MiB limit", status_code(&rejected).is_some(), &rejected);
    let raised = ClientOptions { max_decoding_message_size: Some(16 * MEGABYTE), ..Default::default() };
    let big_client = BehaviorMicroserviceClient::connect(url.clone(), raised).await.expect("connect");
    let big = big_client.find_many(large, plain()).await.map(|items| items[0].payload.len());
    c.check("5 MiB response with a raised limit", matches!(big, Ok(size) if size == 5 * MEGABYTE), &big);

    check_streams(&client, &mut c).await;
    check_concurrency(&client, &mut c).await;
    check_hook(&url, &mut c).await;
    check_retry(&url, &mut c).await;

    let unreachable = BehaviorMicroserviceClient::connect("http://127.0.0.1:1", ClientOptions::default()).await;
    c.check("no server is a transport error", matches!(unreachable, Err(SdkError::Transport(_))), unreachable.map(|_| ()));

    println!("Done: {} check(s) failed", c.failed);
    if c.failed > 0 {
        std::process::exit(1);
    }
}

async fn check_streams(client: &BehaviorMicroserviceClient, c: &mut Checks) {
    let mut indexes = Vec::new();
    let mut ended_cleanly = false;
    match client.watch_items(counted("apple", 3), plain()).await {
        Ok(mut stream) => {
            ended_cleanly = true;
            while let Some(item) = stream.next().await {
                match item {
                    Ok(item) => indexes.push(item.index),
                    Err(_) => ended_cleanly = false,
                }
            }
        }
        Err(error) => println!("stream did not open: {error:?}"),
    }
    c.check("stream delivers every item then ends", ended_cleanly && indexes == vec![0, 1, 2], &indexes);

    let mut received = 0;
    let mut last = None;
    if let Ok(mut stream) = client.watch_items(query("fail"), plain()).await {
        while let Some(item) = stream.next().await {
            match item {
                Ok(_) => received += 1,
                Err(error) => last = Some(Err::<(), SdkError>(error)),
            }
        }
    }
    let is_business = matches!(&last, Some(result) if is_business_error(result, 400, "stream failed"));
    c.check("stream error after two items is a business error", received == 2 && is_business, (received, &last));

    let mut taken = 0;
    if let Ok(mut stream) = client.watch_items(query("endless"), plain()).await {
        while taken < 2 {
            if matches!(stream.next().await, Some(Ok(_))) {
                taken += 1;
            } else {
                break;
            }
        }
        // Dropping the stream cancels the call.
    }
    let after = client.get_name(query("apple"), plain()).await;
    c.check("stream dropped early, client still usable", taken == 2 && after.is_ok(), (taken, &after));
}

async fn check_concurrency(client: &BehaviorMicroserviceClient, c: &mut Checks) {
    let mut tasks = Vec::new();
    for index in 0..20 {
        let client = client.clone();
        tasks.push(tokio::spawn(async move {
            let name = client.get_name(query(&format!("user-{index}")), plain()).await;
            matches!(name, Ok(value) if value == format!("hello user-{index}"))
        }));
    }
    let mut passed = 0;
    for task in tasks {
        if task.await.unwrap_or(false) {
            passed += 1;
        }
    }
    c.check("20 concurrent calls on one client", passed == 20, passed);
}

async fn check_hook(url: &str, c: &mut Checks) {
    let (options, calls) = recording(ClientOptions::default());
    let client = BehaviorMicroserviceClient::connect(url.to_string(), options).await.expect("connect");

    let workspace = client.get_workspace(plain()).await;
    c.check("hook metadata reaches the server", matches!(&workspace, Ok(value) if value == WORKSPACE), &workspace);
    let failure = client.fail(query("apple"), plain()).await;
    let opened = client.watch_items(counted("apple", 1), plain()).await.is_ok();

    let recorded = calls.lock().expect("lock").clone();
    let service = "behaviorSdk.BehaviorMicroservice";
    let expected = vec![
        (rpc(service, "getWorkspace"), true),
        (rpc(service, "fail"), false),
        (rpc(service, "watchItems"), true),
    ];
    c.check(
        "hook sees each call once, with its wire name and outcome",
        failure.is_err() && opened && recorded == expected,
        &recorded,
    );
}

async fn check_retry(url: &str, c: &mut Checks) {
    let quick = RetryPolicy { initial_backoff: Duration::from_millis(10), ..Default::default() };
    let (options, calls) = recording(ClientOptions { retry: Some(quick), ..Default::default() });
    let client = FlakyMicroserviceClient::connect(url.to_string(), options).await.expect("connect");

    let recovered = client.flaky(counted("recovers", 2), plain()).await;
    c.check("two UNAVAILABLE then an answer, in three attempts", matches!(recovered, Ok(calls) if calls == 3.0), &recovered);

    let exhausted = client.flaky(counted("exhausts", 5), plain()).await;
    let after = client.flaky(query("exhausts"), plain()).await;
    c.check(
        "gives up after max_attempts with the last status",
        status_code(&exhausted) == Some(Code::Unavailable) && matches!(after, Ok(calls) if calls == 4.0),
        (&exhausted, &after),
    );

    let business = client.flaky(counted("business", 1), plain()).await;
    let after = client.flaky(query("business"), plain()).await;
    c.check(
        "a business error is not retried",
        is_business_error(&business, 400, "rejected") && matches!(after, Ok(calls) if calls == 2.0),
        (&business, &after),
    );

    let recorded = calls.lock().expect("lock").len();
    c.check("the hook runs once per call, not per attempt", recorded == 5, recorded);

    let once = FlakyMicroserviceClient::connect(url.to_string(), ClientOptions::default()).await.expect("connect");
    let failed = once.flaky(counted("once", 1), plain()).await;
    c.check("no retry without a policy", status_code(&failed) == Some(Code::Unavailable), &failed);

    let slow = RetryPolicy {
        max_attempts: 10,
        initial_backoff: Duration::from_millis(400),
        max_backoff: Duration::from_millis(400),
        ..Default::default()
    };
    let bounded = ClientOptions { retry: Some(slow), timeout: Some(Duration::from_millis(150)), ..Default::default() };
    let client = FlakyMicroserviceClient::connect(url.to_string(), bounded).await.expect("connect");
    let started = Instant::now();
    let late = client.flaky(counted("deadline", 100), plain()).await;
    let elapsed = started.elapsed();
    let code = status_code(&late);
    c.check(
        "the timeout bounds every attempt and wait together",
        elapsed < Duration::from_secs(1) && matches!(code, Some(Code::Unavailable | Code::DeadlineExceeded)),
        (elapsed, &late),
    );
}
