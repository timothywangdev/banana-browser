//! End-to-end tests for the native daemon.
//!
//! These tests launch a real Chrome instance and exercise the full command
//! pipeline. They require Chrome to be installed and are marked `#[ignore]`
//! so they don't run during normal `cargo test`.
//!
//! Run serially to avoid Chrome instance contention:
//!   cargo test e2e -- --ignored --test-threads=1

use serde_json::{json, Value};

use super::actions::{execute_command, DaemonState};

fn assert_success(resp: &Value) {
    assert_eq!(
        resp.get("success").and_then(|v| v.as_bool()),
        Some(true),
        "Expected success but got: {}",
        serde_json::to_string_pretty(resp).unwrap_or_default()
    );
}

fn get_data(resp: &Value) -> &Value {
    resp.get("data").expect("Missing 'data' in response")
}

// ---------------------------------------------------------------------------
// Core: launch, navigate, evaluate, url, title, close
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_launch_navigate_evaluate_close() {
    let mut state = DaemonState::new();

    // Launch headless Chrome
    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["launched"], true);

    // Navigate to example.com
    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://example.com" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["url"], "https://example.com/");
    assert_eq!(get_data(&resp)["title"], "Example Domain");

    // Get URL
    let resp = execute_command(&json!({ "id": "3", "action": "url" }), &mut state).await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["url"], "https://example.com/");

    // Get title
    let resp = execute_command(&json!({ "id": "4", "action": "title" }), &mut state).await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["title"], "Example Domain");

    // Evaluate JS
    let resp = execute_command(
        &json!({ "id": "5", "action": "evaluate", "script": "1 + 2" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], 3);

    // Evaluate document.title
    let resp = execute_command(
        &json!({ "id": "6", "action": "evaluate", "script": "document.title" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], "Example Domain");

    // Close
    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["closed"], true);
}

#[tokio::test]
#[ignore]
async fn e2e_lightpanda_launch_can_open_page() {
    let lightpanda_bin = match std::env::var("LIGHTPANDA_BIN") {
        Ok(path) if !path.is_empty() => path,
        _ => return,
    };

    let mut state = DaemonState::new();

    let resp = tokio::time::timeout(
        tokio::time::Duration::from_secs(20),
        execute_command(
            &json!({
                "id": "1",
                "action": "launch",
                "headless": true,
                "engine": "lightpanda",
                "executablePath": lightpanda_bin,
            }),
            &mut state,
        ),
    )
    .await
    .expect("Lightpanda launch should not hang");

    assert_success(&resp);
    assert_eq!(get_data(&resp)["launched"], true);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://example.com" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["url"], "https://example.com/");
    assert_eq!(get_data(&resp)["title"], "Example Domain");

    let resp = execute_command(&json!({ "id": "3", "action": "close" }), &mut state).await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["closed"], true);
}

#[tokio::test]
#[ignore]
async fn e2e_lightpanda_auto_launch_can_open_page() {
    let lightpanda_bin = match std::env::var("LIGHTPANDA_BIN") {
        Ok(path) if !path.is_empty() => path,
        _ => return,
    };

    let prev_engine = std::env::var("AGENT_BROWSER_ENGINE").ok();
    let prev_path = std::env::var("AGENT_BROWSER_EXECUTABLE_PATH").ok();
    std::env::set_var("AGENT_BROWSER_ENGINE", "lightpanda");
    std::env::set_var("AGENT_BROWSER_EXECUTABLE_PATH", &lightpanda_bin);

    let mut state = DaemonState::new();

    let resp = tokio::time::timeout(
        tokio::time::Duration::from_secs(20),
        execute_command(
            &json!({ "id": "1", "action": "navigate", "url": "https://example.com" }),
            &mut state,
        ),
    )
    .await
    .expect("Lightpanda auto-launch should not hang");

    match prev_engine {
        Some(value) => std::env::set_var("AGENT_BROWSER_ENGINE", value),
        None => std::env::remove_var("AGENT_BROWSER_ENGINE"),
    }
    match prev_path {
        Some(value) => std::env::set_var("AGENT_BROWSER_EXECUTABLE_PATH", value),
        None => std::env::remove_var("AGENT_BROWSER_EXECUTABLE_PATH"),
    }

    assert_success(&resp);
    assert_eq!(get_data(&resp)["url"], "https://example.com/");
    assert_eq!(get_data(&resp)["title"], "Example Domain");

    let resp = execute_command(&json!({ "id": "2", "action": "close" }), &mut state).await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["closed"], true);
}

// ---------------------------------------------------------------------------
// Snapshot with refs and ref-based click
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_snapshot_and_click_ref() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://example.com" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Take snapshot
    let resp = execute_command(&json!({ "id": "3", "action": "snapshot" }), &mut state).await;
    assert_success(&resp);
    let snapshot = get_data(&resp)["snapshot"].as_str().unwrap();
    assert!(
        snapshot.contains("Example Domain"),
        "Snapshot should contain heading"
    );
    assert!(snapshot.contains("ref=e1"), "Snapshot should have ref e1");
    assert!(snapshot.contains("ref=e2"), "Snapshot should have ref e2");
    assert!(
        snapshot.contains("link"),
        "Snapshot should have a link element"
    );

    // Click the link by ref (e2 is the "More information..." link)
    let resp = execute_command(
        &json!({ "id": "4", "action": "click", "selector": "e2" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Wait for navigation
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

    // Verify URL changed
    let resp = execute_command(&json!({ "id": "5", "action": "url" }), &mut state).await;
    assert_success(&resp);
    let url = get_data(&resp)["url"].as_str().unwrap();
    assert!(
        url.contains("iana.org"),
        "Should have navigated to iana.org, got: {}",
        url
    );

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_screenshot() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://example.com" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Default screenshot
    let resp = execute_command(&json!({ "id": "3", "action": "screenshot" }), &mut state).await;
    assert_success(&resp);
    let path = get_data(&resp)["path"].as_str().unwrap();
    assert!(path.ends_with(".png"), "Screenshot path should be .png");
    let metadata = std::fs::metadata(path).expect("Screenshot file should exist");
    assert!(
        metadata.len() > 1000,
        "Screenshot should be non-trivial size"
    );

    // Named screenshot
    let tmp_path = std::env::temp_dir()
        .join("agent-browser-e2e-test-screenshot.png")
        .to_string_lossy()
        .to_string();
    let resp = execute_command(
        &json!({ "id": "4", "action": "screenshot", "path": tmp_path }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert!(std::path::Path::new(&tmp_path).exists());
    let _ = std::fs::remove_file(&tmp_path);

    let resp = execute_command(
        &json!({
            "id": "5",
            "action": "setcontent",
            "html": r##"
                <html><body>
                  <button onclick="document.getElementById('result').textContent = 'clicked'">Submit</button>
                  <a href="#">Home</a>
                  <div id="result"></div>
                </body></html>
            "##,
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "6", "action": "screenshot", "annotate": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let annotations = get_data(&resp)["annotations"]
        .as_array()
        .expect("Annotated screenshot should return annotations");
    assert!(
        !annotations.is_empty(),
        "Annotated screenshot should have at least one annotation"
    );

    let submit_ref = annotations
        .iter()
        .find(|ann| ann.get("name").and_then(|v| v.as_str()) == Some("Submit"))
        .and_then(|ann| ann.get("ref").and_then(|v| v.as_str()))
        .expect("Expected a Submit annotation");

    let resp = execute_command(
        &json!({
            "id": "7",
            "action": "evaluate",
            "script": "document.getElementById('__agent_browser_annotations__') === null"
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], true);

    let resp = execute_command(
        &json!({ "id": "8", "action": "click", "selector": format!("@{}", submit_ref) }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({
            "id": "9",
            "action": "evaluate",
            "script": "document.getElementById('result').textContent"
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], "clicked");

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Form interaction: fill, type, select, check
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_form_interaction() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let html = concat!(
        "data:text/html,<html><body>",
        "<input id='name' type='text' placeholder='Name'>",
        "<input id='email' type='email'>",
        "<select id='color'><option value='red'>Red</option><option value='blue'>Blue</option></select>",
        "<input id='agree' type='checkbox'>",
        "<textarea id='bio'></textarea>",
        "<button id='submit'>Submit</button>",
        "</body></html>"
    );

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": html }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Fill name
    let resp = execute_command(
        &json!({ "id": "10", "action": "fill", "selector": "#name", "value": "John Doe" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Verify fill
    let resp = execute_command(
        &json!({ "id": "11", "action": "evaluate", "script": "document.getElementById('name').value" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], "John Doe");

    // Fill email (use fill instead of type to avoid key dispatch issues with '.')
    let resp = execute_command(
        &json!({ "id": "12", "action": "fill", "selector": "#email", "value": "john@example.com" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "13", "action": "evaluate", "script": "document.getElementById('email').value" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], "john@example.com");

    // Select option
    let resp = execute_command(
        &json!({ "id": "14", "action": "select", "selector": "#color", "values": ["blue"] }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "15", "action": "evaluate", "script": "document.getElementById('color').value" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], "blue");

    // Check checkbox
    let resp = execute_command(
        &json!({ "id": "16", "action": "check", "selector": "#agree" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "17", "action": "ischecked", "selector": "#agree" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["checked"], true);

    // Uncheck
    let resp = execute_command(
        &json!({ "id": "18", "action": "uncheck", "selector": "#agree" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "19", "action": "ischecked", "selector": "#agree" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["checked"], false);

    // Snapshot should show form state
    let resp = execute_command(&json!({ "id": "20", "action": "snapshot" }), &mut state).await;
    assert_success(&resp);
    let snap = get_data(&resp)["snapshot"].as_str().unwrap();
    assert!(
        snap.contains("John Doe"),
        "Snapshot should show filled value"
    );
    assert!(snap.contains("textbox"), "Snapshot should show textbox");
    assert!(snap.contains("button"), "Snapshot should show button");

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Navigation: back, forward, reload
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_navigation_history() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Navigate to page 1
    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "data:text/html,<h1>Page 1</h1>" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Navigate to page 2
    let resp = execute_command(
        &json!({ "id": "3", "action": "navigate", "url": "data:text/html,<h1>Page 2</h1>" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Back
    let resp = execute_command(&json!({ "id": "4", "action": "back" }), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "5", "action": "evaluate", "script": "document.querySelector('h1').textContent" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], "Page 1");

    // Forward
    let resp = execute_command(&json!({ "id": "6", "action": "forward" }), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "7", "action": "evaluate", "script": "document.querySelector('h1').textContent" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], "Page 2");

    // Reload
    let resp = execute_command(&json!({ "id": "8", "action": "reload" }), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "9", "action": "evaluate", "script": "document.querySelector('h1').textContent" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], "Page 2");

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_cookies() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://example.com" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Set cookie
    let resp = execute_command(
        &json!({
            "id": "3",
            "action": "cookies_set",
            "name": "test_cookie",
            "value": "hello123"
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Get cookies
    let resp = execute_command(&json!({ "id": "4", "action": "cookies_get" }), &mut state).await;
    assert_success(&resp);
    let cookies = get_data(&resp)["cookies"].as_array().unwrap();
    let found = cookies
        .iter()
        .any(|c| c["name"] == "test_cookie" && c["value"] == "hello123");
    assert!(found, "Should find the set cookie");

    // Clear cookies
    let resp = execute_command(&json!({ "id": "5", "action": "cookies_clear" }), &mut state).await;
    assert_success(&resp);

    // Verify cleared
    let resp = execute_command(&json!({ "id": "6", "action": "cookies_get" }), &mut state).await;
    assert_success(&resp);
    let cookies = get_data(&resp)["cookies"].as_array().unwrap();
    let found = cookies.iter().any(|c| c["name"] == "test_cookie");
    assert!(!found, "Cookie should be cleared");

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// localStorage / sessionStorage
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_storage() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://example.com" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Set local storage
    let resp = execute_command(
        &json!({ "id": "3", "action": "storage_set", "type": "local", "key": "mykey", "value": "myvalue" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Get local storage key
    let resp = execute_command(
        &json!({ "id": "4", "action": "storage_get", "type": "local", "key": "mykey" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["value"], "myvalue");

    // Get all local storage
    let resp = execute_command(
        &json!({ "id": "5", "action": "storage_get", "type": "local" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["data"]["mykey"], "myvalue");

    // Clear
    let resp = execute_command(
        &json!({ "id": "6", "action": "storage_clear", "type": "local" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Verify cleared
    let resp = execute_command(
        &json!({ "id": "7", "action": "storage_get", "type": "local" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let data = &get_data(&resp)["data"];
    assert!(
        data.as_object().map(|m| m.is_empty()).unwrap_or(true),
        "Storage should be empty after clear"
    );

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Tab management
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_tabs() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "data:text/html,<h1>Tab 1</h1>" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Tab list should show 1 tab
    let resp = execute_command(&json!({ "id": "3", "action": "tab_list" }), &mut state).await;
    assert_success(&resp);
    let tabs = get_data(&resp)["tabs"].as_array().unwrap();
    assert_eq!(tabs.len(), 1);
    assert_eq!(tabs[0]["active"], true);

    // Open new tab
    let resp = execute_command(
        &json!({ "id": "4", "action": "tab_new", "url": "data:text/html,<h1>Tab 2</h1>" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["index"], 1);

    // Tab list should show 2 tabs
    let resp = execute_command(&json!({ "id": "5", "action": "tab_list" }), &mut state).await;
    assert_success(&resp);
    let tabs = get_data(&resp)["tabs"].as_array().unwrap();
    assert_eq!(tabs.len(), 2);
    assert_eq!(tabs[1]["active"], true);

    // Switch to first tab
    let resp = execute_command(
        &json!({ "id": "6", "action": "tab_switch", "index": 0 }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "7", "action": "evaluate", "script": "document.querySelector('h1').textContent" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], "Tab 1");

    // Close second tab
    let resp = execute_command(
        &json!({ "id": "8", "action": "tab_close", "index": 1 }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Should have 1 tab left
    let resp = execute_command(&json!({ "id": "9", "action": "tab_list" }), &mut state).await;
    assert_success(&resp);
    let tabs = get_data(&resp)["tabs"].as_array().unwrap();
    assert_eq!(tabs.len(), 1);

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Element queries: isvisible, isenabled, gettext, getattribute
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_element_queries() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let html = concat!(
        "data:text/html,<html><body>",
        "<p id='visible'>Hello World</p>",
        "<p id='hidden' style='display:none'>Hidden</p>",
        "<input id='enabled' value='test'>",
        "<input id='disabled' disabled value='nope'>",
        "<a id='link' href='https://example.com' data-testid='my-link'>Click me</a>",
        "</body></html>"
    );

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": html }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // isvisible
    let resp = execute_command(
        &json!({ "id": "3", "action": "isvisible", "selector": "#visible" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["visible"], true);

    let resp = execute_command(
        &json!({ "id": "4", "action": "isvisible", "selector": "#hidden" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["visible"], false);

    // isenabled
    let resp = execute_command(
        &json!({ "id": "5", "action": "isenabled", "selector": "#enabled" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["enabled"], true);

    let resp = execute_command(
        &json!({ "id": "6", "action": "isenabled", "selector": "#disabled" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["enabled"], false);

    // gettext
    let resp = execute_command(
        &json!({ "id": "7", "action": "gettext", "selector": "#visible" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["text"], "Hello World");

    // getattribute
    let resp = execute_command(
        &json!({ "id": "8", "action": "getattribute", "selector": "#link", "attribute": "href" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["value"], "https://example.com");

    let resp = execute_command(
        &json!({ "id": "9", "action": "getattribute", "selector": "#link", "attribute": "data-testid" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["value"], "my-link");

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Wait command
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_wait() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let html = concat!(
        "data:text/html,<html><body>",
        "<div id='target' style='display:none'>Appeared!</div>",
        "<script>setTimeout(() => document.getElementById('target').style.display='block', 500)</script>",
        "</body></html>"
    );

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": html }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Wait for selector to become visible
    let resp = execute_command(
        &json!({ "id": "3", "action": "wait", "selector": "#target", "state": "visible", "timeout": 5000 }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Wait for text
    let resp = execute_command(
        &json!({ "id": "4", "action": "wait", "text": "Appeared!", "timeout": 5000 }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Timeout wait
    let start = std::time::Instant::now();
    let resp = execute_command(
        &json!({ "id": "5", "action": "wait", "timeout": 200 }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert!(
        start.elapsed().as_millis() >= 150,
        "Timeout wait should sleep at least 150ms"
    );

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Viewport with deviceScaleFactor (retina)
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_viewport_scale_factor() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "about:blank" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Default devicePixelRatio should be 1
    let resp = execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "window.devicePixelRatio" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let default_dpr = get_data(&resp)["result"].as_f64().unwrap();
    assert_eq!(default_dpr, 1.0, "Default devicePixelRatio should be 1");

    // Set viewport with 2x scale factor
    let resp = execute_command(
        &json!({ "id": "4", "action": "viewport", "width": 1920, "height": 1080, "deviceScaleFactor": 2.0 }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["width"], 1920);
    assert_eq!(get_data(&resp)["height"], 1080);
    assert_eq!(get_data(&resp)["deviceScaleFactor"], 2.0);

    // devicePixelRatio should now be 2
    let resp = execute_command(
        &json!({ "id": "5", "action": "evaluate", "script": "window.devicePixelRatio" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let new_dpr = get_data(&resp)["result"].as_f64().unwrap();
    assert_eq!(
        new_dpr, 2.0,
        "devicePixelRatio should be 2 after setting scale factor"
    );

    // CSS viewport width should still be 1920 (not 3840)
    let resp = execute_command(
        &json!({ "id": "6", "action": "evaluate", "script": "window.innerWidth" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let css_width = get_data(&resp)["result"].as_i64().unwrap();
    assert_eq!(css_width, 1920, "CSS width should remain 1920 at 2x scale");

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Viewport and emulation
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_viewport_emulation() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "data:text/html,<h1>Viewport</h1>" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Get initial width
    let resp = execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "window.innerWidth" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let initial_width = get_data(&resp)["result"].as_i64().unwrap();

    // Set viewport to a different size
    let resp = execute_command(
        &json!({ "id": "4", "action": "viewport", "width": 375, "height": 812, "deviceScaleFactor": 3.0, "mobile": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["width"], 375);
    assert_eq!(get_data(&resp)["height"], 812);
    assert_eq!(get_data(&resp)["mobile"], true);

    // Reload to apply viewport change
    let resp = execute_command(&json!({ "id": "5", "action": "reload" }), &mut state).await;
    assert_success(&resp);

    // Width should differ from default (setDeviceMetricsOverride applied)
    let resp = execute_command(
        &json!({ "id": "6", "action": "evaluate", "script": "window.innerWidth" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let new_width = get_data(&resp)["result"].as_i64().unwrap();
    assert!(
        new_width != initial_width || new_width == 375,
        "Viewport should change from {} after setDeviceMetricsOverride (got {})",
        initial_width,
        new_width
    );

    // Set user agent
    let resp = execute_command(
        &json!({ "id": "5", "action": "user_agent", "userAgent": "TestBot/1.0" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "6", "action": "evaluate", "script": "navigator.userAgent" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], "TestBot/1.0");

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Hover, scroll, press
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_hover_scroll_press() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let html = concat!(
        "data:text/html,<html><body style='height:3000px'>",
        "<button id='btn' onmouseover=\"this.textContent='hovered'\">Hover me</button>",
        "<input id='input' onkeydown=\"this.dataset.key=event.key\">",
        "</body></html>"
    );

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": html }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Hover
    let resp = execute_command(
        &json!({ "id": "3", "action": "hover", "selector": "#btn" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Scroll
    let resp = execute_command(
        &json!({ "id": "4", "action": "scroll", "y": 500 }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "5", "action": "evaluate", "script": "window.scrollY" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let scroll_y = get_data(&resp)["result"].as_f64().unwrap();
    assert!(scroll_y > 0.0, "Should have scrolled down");

    // Press key
    let resp = execute_command(
        &json!({ "id": "6", "action": "press", "key": "Enter" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["pressed"], "Enter");

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// State save/load, state management
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_state_management() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://example.com" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Set some storage
    let resp = execute_command(
        &json!({ "id": "3", "action": "storage_set", "type": "local", "key": "persist_key", "value": "persist_val" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Save state
    let tmp_state = std::env::temp_dir()
        .join("agent-browser-e2e-state.json")
        .to_string_lossy()
        .to_string();
    let resp = execute_command(
        &json!({ "id": "4", "action": "state_save", "path": &tmp_state }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert!(std::path::Path::new(&tmp_state).exists());

    // State show
    let resp = execute_command(
        &json!({ "id": "5", "action": "state_show", "path": &tmp_state }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let state_data = get_data(&resp);
    assert!(state_data.get("state").is_some());

    // State list
    let resp = execute_command(&json!({ "id": "6", "action": "state_list" }), &mut state).await;
    assert_success(&resp);
    assert!(get_data(&resp)["files"].is_array());

    // Clean up
    let _ = std::fs::remove_file(&tmp_state);

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Domain filter
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_domain_filter() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Set domain filter after launch to avoid Fetch.enable deadlock in tests.
    state.domain_filter = Some(super::network::DomainFilter::new("example.com"));

    // Allowed domain
    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://example.com" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Blocked domain
    let resp = execute_command(
        &json!({ "id": "3", "action": "navigate", "url": "https://blocked.com" }),
        &mut state,
    )
    .await;
    assert_eq!(resp["success"], false);
    let error = resp["error"].as_str().unwrap();
    assert!(
        error.contains("blocked") || error.contains("not allowed"),
        "Should reject blocked domain, got: {}",
        error
    );

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Diff engine
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_diff_snapshot() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "data:text/html,<h1>Hello</h1><p>World</p>" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Take a snapshot and use it as baseline for diff
    let resp = execute_command(&json!({ "id": "3", "action": "snapshot" }), &mut state).await;
    assert_success(&resp);
    let baseline = get_data(&resp)["snapshot"].as_str().unwrap().to_string();

    // Modify the page
    let resp = execute_command(
        &json!({ "id": "4", "action": "evaluate", "script": "document.querySelector('h1').textContent = 'Changed'" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Diff against baseline
    let resp = execute_command(
        &json!({ "id": "5", "action": "diff_snapshot", "baseline": baseline }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let data = get_data(&resp);
    assert_eq!(data["changed"], true, "Diff should detect the h1 change");

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Phase 8 commands: focus, clear, count, boundingbox, innertext, setvalue
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_phase8_commands() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let html = concat!(
        "data:text/html,<html><body>",
        "<input id='a' value='original'>",
        "<input id='b' value='other'>",
        "<p class='item'>One</p>",
        "<p class='item'>Two</p>",
        "<p class='item'>Three</p>",
        "<div id='box' style='width:200px;height:100px;background:red'>Box</div>",
        "</body></html>"
    );

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": html }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Focus
    let resp = execute_command(
        &json!({ "id": "10", "action": "focus", "selector": "#a" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Clear
    let resp = execute_command(
        &json!({ "id": "11", "action": "clear", "selector": "#a" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "12", "action": "evaluate", "script": "document.getElementById('a').value" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], "");

    // Set value
    let resp = execute_command(
        &json!({ "id": "13", "action": "setvalue", "selector": "#b", "value": "new-value" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "14", "action": "inputvalue", "selector": "#b" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["value"], "new-value");

    // Count
    let resp = execute_command(
        &json!({ "id": "15", "action": "count", "selector": ".item" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["count"], 3);

    // Bounding box
    let resp = execute_command(
        &json!({ "id": "16", "action": "boundingbox", "selector": "#box" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let bbox = get_data(&resp);
    assert_eq!(bbox["width"], 200.0);
    assert_eq!(bbox["height"], 100.0);
    assert!(bbox["x"].as_f64().is_some());
    assert!(bbox["y"].as_f64().is_some());

    // Inner text
    let resp = execute_command(
        &json!({ "id": "17", "action": "innertext", "selector": "#box" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["text"], "Box");

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Auto-launch (tests that commands auto-launch when no browser exists)
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_auto_launch() {
    let mut state = DaemonState::new();

    // Navigate without explicit launch -- should auto-launch
    let resp = execute_command(
        &json!({ "id": "1", "action": "navigate", "url": "data:text/html,<h1>Auto</h1>" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert!(state.browser.is_some(), "Browser should be auto-launched");

    let resp = execute_command(
        &json!({ "id": "2", "action": "evaluate", "script": "document.querySelector('h1').textContent" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    assert_eq!(get_data(&resp)["result"], "Auto");

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_error_handling() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "data:text/html,<h1>Errors</h1>" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Unknown action
    let resp = execute_command(
        &json!({ "id": "10", "action": "nonexistent_action" }),
        &mut state,
    )
    .await;
    assert_eq!(resp["success"], false);
    assert!(resp["error"]
        .as_str()
        .unwrap()
        .contains("Not yet implemented"));

    // Missing required parameter
    let resp = execute_command(
        &json!({ "id": "11", "action": "fill", "selector": "#x" }),
        &mut state,
    )
    .await;
    assert_eq!(resp["success"], false);
    assert!(resp["error"].as_str().unwrap().contains("value"));

    // Click on non-existent element
    let resp = execute_command(
        &json!({ "id": "12", "action": "click", "selector": "#does-not-exist" }),
        &mut state,
    )
    .await;
    assert_eq!(resp["success"], false);

    // Evaluate syntax error
    let resp = execute_command(
        &json!({ "id": "13", "action": "evaluate", "script": "}{invalid" }),
        &mut state,
    )
    .await;
    assert_eq!(resp["success"], false);
    assert!(resp["error"].as_str().unwrap().contains("error"));

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Profile cookie persistence across restarts
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_profile_cookie_persistence() {
    let profile_dir = std::env::temp_dir().join(format!(
        "agent-browser-e2e-profile-{}",
        uuid::Uuid::new_v4()
    ));

    // Session 1: launch with profile, set a cookie, close
    {
        let mut state = DaemonState::new();

        let resp = execute_command(
            &json!({
                "id": "1",
                "action": "launch",
                "headless": true,
                "profile": profile_dir.to_str().unwrap()
            }),
            &mut state,
        )
        .await;
        assert_success(&resp);

        let resp = execute_command(
            &json!({ "id": "2", "action": "navigate", "url": "https://example.com" }),
            &mut state,
        )
        .await;
        assert_success(&resp);

        let resp = execute_command(
            &json!({
                "id": "3",
                "action": "cookies_set",
                "name": "persist_test",
                "value": "should_survive_restart",
                "domain": ".example.com",
                "path": "/",
                "expires": 2000000000
            }),
            &mut state,
        )
        .await;
        assert_success(&resp);

        // Verify cookie is set
        let resp =
            execute_command(&json!({ "id": "4", "action": "cookies_get" }), &mut state).await;
        assert_success(&resp);
        let cookies = get_data(&resp)["cookies"].as_array().unwrap();
        let found = cookies
            .iter()
            .any(|c| c["name"] == "persist_test" && c["value"] == "should_survive_restart");
        assert!(found, "Cookie should exist before close");

        let resp = execute_command(&json!({ "id": "5", "action": "close" }), &mut state).await;
        assert_success(&resp);
    }

    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

    // Session 2: reopen with the same profile, verify cookie persisted
    {
        let mut state = DaemonState::new();

        let resp = execute_command(
            &json!({
                "id": "10",
                "action": "launch",
                "headless": true,
                "profile": profile_dir.to_str().unwrap()
            }),
            &mut state,
        )
        .await;
        assert_success(&resp);

        let resp = execute_command(
            &json!({ "id": "11", "action": "navigate", "url": "https://example.com" }),
            &mut state,
        )
        .await;
        assert_success(&resp);

        let resp =
            execute_command(&json!({ "id": "12", "action": "cookies_get" }), &mut state).await;
        assert_success(&resp);
        let cookies = get_data(&resp)["cookies"].as_array().unwrap();
        let found = cookies
            .iter()
            .any(|c| c["name"] == "persist_test" && c["value"] == "should_survive_restart");
        assert!(
            found,
            "Cookie should persist across restart with --profile. Cookies found: {:?}",
            cookies
                .iter()
                .map(|c| c["name"].as_str().unwrap_or("?"))
                .collect::<Vec<_>>()
        );

        let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
        assert_success(&resp);
    }

    let _ = std::fs::remove_dir_all(&profile_dir);
}

// ---------------------------------------------------------------------------
// Inspect / CDP URL
// ---------------------------------------------------------------------------

#[tokio::test]
#[ignore]
async fn e2e_get_cdp_url() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(&json!({ "id": "2", "action": "cdp_url" }), &mut state).await;
    assert_success(&resp);
    let cdp_url = get_data(&resp)["cdpUrl"]
        .as_str()
        .expect("cdpUrl should be a string");
    assert!(
        cdp_url.starts_with("ws://"),
        "CDP URL should start with ws://, got: {}",
        cdp_url
    );

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

#[tokio::test]
#[ignore]
async fn e2e_inspect() {
    let mut state = DaemonState::new();

    let resp = execute_command(
        &json!({ "id": "1", "action": "launch", "headless": true }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://example.com" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    let resp = execute_command(&json!({ "id": "3", "action": "inspect" }), &mut state).await;
    assert_success(&resp);
    let data = get_data(&resp);
    assert_eq!(data["opened"], true);
    let url = data["url"]
        .as_str()
        .expect("inspect url should be a string");
    assert!(
        url.starts_with("http://127.0.0.1:"),
        "Inspect URL should be http://127.0.0.1:<port>, got: {}",
        url
    );

    // Verify the HTTP redirect serves a 302 to the DevTools frontend
    let http_resp = reqwest::get(url).await;
    match http_resp {
        Ok(r) => {
            let final_url = r.url().to_string();
            assert!(
                final_url.contains("devtools/devtools_app.html"),
                "Redirect should point to DevTools frontend, got: {}",
                final_url
            );
        }
        Err(e) => {
            panic!("HTTP GET to inspect URL failed: {}", e);
        }
    }

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Bot Detection: verify anti-detection measures work
//
// Run with: xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" \
//   cargo test e2e_bot_detection -- --ignored --test-threads=1 --nocapture
// ---------------------------------------------------------------------------

const BOT_DETECT_ARGS: &[&str] = &[
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
    "--disable-gpu-blocklist",
];

fn bot_launch_cmd() -> Value {
    json!({ "id": "1", "action": "launch", "headless": false, "args": BOT_DETECT_ARGS })
}

/// Rebrowser Bot Detector — covers CDP leaks that cause 90% of real-world blocks.
/// Tests Runtime.enable leak, sourceURL leak, and mainWorldExecution leak.
#[tokio::test]
#[ignore]
async fn e2e_bot_detection_rebrowser() {
    let mut state = DaemonState::new();

    let resp = execute_command(&bot_launch_cmd(), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://bot-detector.rebrowser.net/" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Wait for detection tests to run
    execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "new Promise(r => setTimeout(r, 8000))" }),
        &mut state,
    )
    .await;

    // Extract test results
    let resp = execute_command(
        &json!({
            "id": "4",
            "action": "evaluate",
            "script": r#"
                (function() {
                    var results = {};
                    document.querySelectorAll('[data-test-id]').forEach(function(el) {
                        var id = el.getAttribute('data-test-id');
                        var status = el.querySelector('.status')?.textContent?.trim() || el.textContent?.trim() || 'unknown';
                        results[id] = status;
                    });
                    if (Object.keys(results).length === 0) {
                        var body = document.body.innerText;
                        return JSON.stringify({ _raw: body.substring(0, 2000) });
                    }
                    return JSON.stringify(results);
                })()
            "#
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let results_str = get_data(&resp)["result"].as_str().unwrap_or("{}");
    eprintln!("[rebrowser] Results: {}", results_str);

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

/// bot.sannysoft.com — classic detection suite (56 checks).
/// Tests webdriver, plugins, UA, canvas, WebGL, languages, etc.
#[tokio::test]
#[ignore]
async fn e2e_bot_detection_sannysoft() {
    let mut state = DaemonState::new();

    let resp = execute_command(&bot_launch_cmd(), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://bot.sannysoft.com/" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "new Promise(r => setTimeout(r, 3000))" }),
        &mut state,
    )
    .await;

    let resp = execute_command(
        &json!({
            "id": "4",
            "action": "evaluate",
            "script": r#"
                (function() {
                    var results = {};
                    document.querySelectorAll('table tr').forEach(function(row) {
                        var cells = row.querySelectorAll('td');
                        if (cells.length >= 2) {
                            var key = cells[0].textContent.trim();
                            var val = cells[1].textContent.trim();
                            var cls = cells[1].className || '';
                            results[key] = { value: val, passed: cls.indexOf('failed') === -1 };
                        }
                    });
                    return JSON.stringify(results);
                })()
            "#
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let results_str = get_data(&resp)["result"].as_str().unwrap_or("{}");

    if let Ok(results) = serde_json::from_str::<Value>(results_str) {
        if let Some(obj) = results.as_object() {
            let total = obj.len();
            let passed = obj.values().filter(|v| v["passed"].as_bool() == Some(true)).count();
            let failed: Vec<_> = obj
                .iter()
                .filter(|(_, v)| v["passed"].as_bool() == Some(false))
                .map(|(k, v)| format!("  FAIL: {} = {}", k, v["value"]))
                .collect();

            eprintln!("[sannysoft] Score: {}/{} passed", passed, total);
            for f in &failed {
                eprintln!("[sannysoft] {}", f);
            }

            assert!(
                passed >= total - 2,
                "Sannysoft: too many failures ({}/{}). Failures:\n{}",
                total - passed, total, failed.join("\n")
            );
        }
    }

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

/// CreepJS — deep fingerprint analysis with lie/spoofing detection.
/// Checks for inconsistencies across browser APIs that reveal automation.
#[tokio::test]
#[ignore]
async fn e2e_bot_detection_creepjs() {
    let mut state = DaemonState::new();

    let resp = execute_command(&bot_launch_cmd(), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://abrahamjuliot.github.io/creepjs/" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // CreepJS takes a while to run all its checks
    execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "new Promise(r => setTimeout(r, 15000))" }),
        &mut state,
    )
    .await;

    // Extract trust score and key findings
    let resp = execute_command(
        &json!({
            "id": "4",
            "action": "evaluate",
            "script": r#"
                (function() {
                    var results = {};
                    var trustEl = document.querySelector('.visitor-info .grade, [class*=trust], [class*=score]');
                    results.trust_score = trustEl ? trustEl.textContent.trim() : 'not found';
                    var liesEl = document.querySelector('[class*=lies], [class*=lie]');
                    results.lies = liesEl ? liesEl.textContent.trim().substring(0, 500) : 'none detected';
                    var botEl = document.querySelector('[class*=bot]');
                    results.bot_status = botEl ? botEl.textContent.trim().substring(0, 200) : 'not found';
                    var body = document.body.innerText.substring(0, 3000);
                    results.page_text = body;
                    return JSON.stringify(results);
                })()
            "#
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let results_str = get_data(&resp)["result"].as_str().unwrap_or("{}");

    if let Ok(results) = serde_json::from_str::<Value>(results_str) {
        eprintln!("[creepjs] Trust score: {}", results["trust_score"]);
        eprintln!("[creepjs] Lies detected: {}", results["lies"]);
        eprintln!("[creepjs] Bot status: {}", results["bot_status"]);
    }

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

/// bot.incolumitas.com — behavioral bot scoring (0=bot, 1=human).
/// Also checks IP/timezone consistency, WebGL rendering latency, etc.
#[tokio::test]
#[ignore]
async fn e2e_bot_detection_incolumitas() {
    let mut state = DaemonState::new();

    let resp = execute_command(&bot_launch_cmd(), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://bot.incolumitas.com/" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Incolumitas runs behavioral tests — give it time
    execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "new Promise(r => setTimeout(r, 10000))" }),
        &mut state,
    )
    .await;

    let resp = execute_command(
        &json!({
            "id": "4",
            "action": "evaluate",
            "script": r#"
                (function() {
                    var results = {};
                    var scoreEl = document.querySelector('[class*=score], [class*=result], .classification');
                    results.score = scoreEl ? scoreEl.textContent.trim().substring(0, 500) : 'not found';
                    var tests = [];
                    document.querySelectorAll('tr, li, [class*=test]').forEach(function(el) {
                        var text = el.textContent.trim();
                        if (text.length > 5 && text.length < 200) tests.push(text);
                    });
                    results.tests = tests.slice(0, 30);
                    results.page_summary = document.body.innerText.substring(0, 2000);
                    return JSON.stringify(results);
                })()
            "#
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let results_str = get_data(&resp)["result"].as_str().unwrap_or("{}");

    if let Ok(results) = serde_json::from_str::<Value>(results_str) {
        eprintln!("[incolumitas] Score: {}", results["score"]);
        if let Some(tests) = results["tests"].as_array() {
            for t in tests.iter().take(15) {
                eprintln!("[incolumitas]   {}", t.as_str().unwrap_or(""));
            }
        }
    }

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

/// BrowserScan — checks mouse/keyboard events, browser preferences, fingerprint consistency.
#[tokio::test]
#[ignore]
async fn e2e_bot_detection_browserscan() {
    let mut state = DaemonState::new();

    let resp = execute_command(&bot_launch_cmd(), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://www.browserscan.net/bot-detection" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "new Promise(r => setTimeout(r, 8000))" }),
        &mut state,
    )
    .await;

    let resp = execute_command(
        &json!({
            "id": "4",
            "action": "evaluate",
            "script": r#"
                (function() {
                    var results = {};
                    document.querySelectorAll('tr, [class*=item], [class*=row]').forEach(function(el) {
                        var text = el.textContent.trim();
                        if (text.includes('Pass') || text.includes('Fail') || text.includes('pass') || text.includes('fail')) {
                            results[Object.keys(results).length] = text.substring(0, 200);
                        }
                    });
                    results.page_summary = document.body.innerText.substring(0, 2000);
                    return JSON.stringify(results);
                })()
            "#
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let results_str = get_data(&resp)["result"].as_str().unwrap_or("{}");
    eprintln!("[browserscan] Results: {}", &results_str[..results_str.len().min(2000)]);

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

/// Brotector — tests CDP leaks and automation signatures comprehensively.
/// This is an important test for Patchright compatibility.
/// See: https://github.com/ttlns/brotector
#[tokio::test]
#[ignore]
async fn e2e_bot_detection_brotector() {
    let mut state = DaemonState::new();

    let resp = execute_command(&bot_launch_cmd(), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://ttlns.github.io/brotector/" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Brotector runs async detection tests
    execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "new Promise(r => setTimeout(r, 8000))" }),
        &mut state,
    )
    .await;

    let resp = execute_command(
        &json!({
            "id": "4",
            "action": "evaluate",
            "script": r#"
                (function() {
                    var results = {};
                    document.querySelectorAll('[class*=test], [class*=check], tr, li').forEach(function(el) {
                        var text = el.textContent.trim();
                        if (text.length > 3 && text.length < 300) {
                            var key = Object.keys(results).length;
                            results[key] = text;
                        }
                    });
                    var statusEl = document.querySelector('[class*=status], [class*=result], [class*=score]');
                    results.status = statusEl ? statusEl.textContent.trim() : 'not found';
                    results.page_summary = document.body.innerText.substring(0, 2000);
                    return JSON.stringify(results);
                })()
            "#
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let results_str = get_data(&resp)["result"].as_str().unwrap_or("{}");
    eprintln!("[brotector] Results: {}", &results_str[..results_str.len().min(2000)]);

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

/// IPHey — checks browser/IP fingerprint consistency and automation signatures.
#[tokio::test]
#[ignore]
async fn e2e_bot_detection_iphey() {
    let mut state = DaemonState::new();

    let resp = execute_command(&bot_launch_cmd(), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://iphey.com/" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "new Promise(r => setTimeout(r, 6000))" }),
        &mut state,
    )
    .await;

    let resp = execute_command(
        &json!({
            "id": "4",
            "action": "evaluate",
            "script": r#"
                (function() {
                    var results = {};
                    document.querySelectorAll('[class*=result], [class*=check], [class*=status], tr').forEach(function(el) {
                        var text = el.textContent.trim();
                        if (text.length > 5 && text.length < 300) {
                            results[Object.keys(results).length] = text;
                        }
                    });
                    results.page_summary = document.body.innerText.substring(0, 2000);
                    return JSON.stringify(results);
                })()
            "#
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let results_str = get_data(&resp)["result"].as_str().unwrap_or("{}");
    eprintln!("[iphey] Results: {}", &results_str[..results_str.len().min(2000)]);

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

/// Pixelscan — comprehensive fingerprint scanner checking for automation leaks.
#[tokio::test]
#[ignore]
async fn e2e_bot_detection_pixelscan() {
    let mut state = DaemonState::new();

    let resp = execute_command(&bot_launch_cmd(), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://pixelscan.net/fingerprint-check" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Pixelscan runs extensive checks - needs 15s to complete scan
    execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "new Promise(r => setTimeout(r, 15000))" }),
        &mut state,
    )
    .await;

    let resp = execute_command(
        &json!({
            "id": "4",
            "action": "evaluate",
            "script": r#"
                (function() {
                    var results = {};
                    document.querySelectorAll('[class*=test], [class*=check], [class*=item], tr, li').forEach(function(el) {
                        var text = el.textContent.trim();
                        if ((text.includes('Pass') || text.includes('Fail') || text.includes('✓') || text.includes('✗') || text.includes('Warning')) && text.length < 300) {
                            results[Object.keys(results).length] = text;
                        }
                    });
                    var scoreEl = document.querySelector('[class*=score], [class*=grade], [class*=status]');
                    results.score = scoreEl ? scoreEl.textContent.trim() : 'not found';
                    results.page_summary = document.body.innerText.substring(0, 2000);
                    return JSON.stringify(results);
                })()
            "#
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let results_str = get_data(&resp)["result"].as_str().unwrap_or("{}");
    eprintln!("[pixelscan] Results: {}", &results_str[..results_str.len().min(2000)]);

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

// ---------------------------------------------------------------------------
// Patchright Bot Detection: verify anti-detection with Patchright adapter
//
// These tests use the Patchright engine for enhanced anti-detection.
// Run with: AGENT_BROWSER_ENGINE=patchright xvfb-run --auto-servernum \
//   --server-args="-screen 0 1920x1080x24" \
//   cargo test e2e_patchright_bot -- --ignored --test-threads=1 --nocapture
// ---------------------------------------------------------------------------

const PATCHRIGHT_BOT_DETECT_ARGS: &[&str] = &[
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
    "--disable-gpu-blocklist",
];

fn patchright_launch_cmd() -> Value {
    json!({
        "id": "1",
        "action": "launch",
        "headless": false,
        "engine": "patchright",
        "args": PATCHRIGHT_BOT_DETECT_ARGS
    })
}

/// Patchright: bot.sannysoft.com — classic detection suite (56 checks).
/// Tests webdriver, plugins, UA, canvas, WebGL, languages, etc.
/// Patchright should pass 95%+ of checks with navigator.webdriver undefined.
#[tokio::test]
#[ignore]
async fn e2e_patchright_bot_detection_sannysoft() {
    let mut state = DaemonState::new();

    let resp = execute_command(&patchright_launch_cmd(), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://bot.sannysoft.com/" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Wait for detection tests to run
    execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "new Promise(r => setTimeout(r, 5000))" }),
        &mut state,
    )
    .await;

    // Take screenshot for visual verification
    let screenshot_path = std::env::temp_dir()
        .join("patchright-sannysoft.png")
        .to_string_lossy()
        .to_string();
    let resp = execute_command(
        &json!({ "id": "4", "action": "screenshot", "path": screenshot_path }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    eprintln!("[patchright-sannysoft] Screenshot saved: {}", screenshot_path);

    // Check navigator.webdriver is undefined (critical for Patchright)
    let resp = execute_command(
        &json!({ "id": "5", "action": "evaluate", "script": "navigator.webdriver" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let webdriver_val = &get_data(&resp)["result"];
    eprintln!("[patchright-sannysoft] navigator.webdriver = {:?}", webdriver_val);

    // Extract test results
    let resp = execute_command(
        &json!({
            "id": "6",
            "action": "evaluate",
            "script": r#"
                (function() {
                    var results = {};
                    document.querySelectorAll('table tr').forEach(function(row) {
                        var cells = row.querySelectorAll('td');
                        if (cells.length >= 2) {
                            var key = cells[0].textContent.trim();
                            var val = cells[1].textContent.trim();
                            var cls = cells[1].className || '';
                            results[key] = { value: val, passed: cls.indexOf('failed') === -1 };
                        }
                    });
                    return JSON.stringify(results);
                })()
            "#
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let results_str = get_data(&resp)["result"].as_str().unwrap_or("{}");

    if let Ok(results) = serde_json::from_str::<Value>(results_str) {
        if let Some(obj) = results.as_object() {
            let total = obj.len();
            let passed = obj.values().filter(|v| v["passed"].as_bool() == Some(true)).count();
            let failed: Vec<_> = obj
                .iter()
                .filter(|(_, v)| v["passed"].as_bool() == Some(false))
                .map(|(k, v)| format!("  FAIL: {} = {}", k, v["value"]))
                .collect();

            let pass_pct = (passed as f64 / total as f64) * 100.0;
            eprintln!("[patchright-sannysoft] Score: {}/{} passed ({:.1}%)", passed, total, pass_pct);
            for f in &failed {
                eprintln!("[patchright-sannysoft] {}", f);
            }

            // Patchright should achieve 95%+ pass rate
            assert!(
                pass_pct >= 95.0,
                "Patchright sannysoft: expected 95%+ pass rate, got {:.1}% ({}/{}). Failures:\n{}",
                pass_pct, passed, total, failed.join("\n")
            );
        }
    }

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

/// Patchright: bot-detector.rebrowser.net — covers CDP leaks (Runtime.enable, etc).
/// These are the leaks that cause 90% of real-world blocks.
/// Patchright should show green for Runtime.enable leak test.
#[tokio::test]
#[ignore]
async fn e2e_patchright_bot_detection_rebrowser() {
    let mut state = DaemonState::new();

    let resp = execute_command(&patchright_launch_cmd(), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://bot-detector.rebrowser.net/" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Wait for detection tests to run
    execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "new Promise(r => setTimeout(r, 10000))" }),
        &mut state,
    )
    .await;

    // Take screenshot for visual verification
    let screenshot_path = std::env::temp_dir()
        .join("patchright-rebrowser.png")
        .to_string_lossy()
        .to_string();
    let resp = execute_command(
        &json!({ "id": "4", "action": "screenshot", "path": screenshot_path }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    eprintln!("[patchright-rebrowser] Screenshot saved: {}", screenshot_path);

    // Extract test results
    let resp = execute_command(
        &json!({
            "id": "5",
            "action": "evaluate",
            "script": r#"
                (function() {
                    var results = {};
                    document.querySelectorAll('[data-test-id]').forEach(function(el) {
                        var id = el.getAttribute('data-test-id');
                        var status = el.querySelector('.status')?.textContent?.trim() || el.textContent?.trim() || 'unknown';
                        var passed = el.classList.contains('passed') || el.querySelector('.passed') !== null ||
                                     status.toLowerCase().includes('pass') || status.includes('✓');
                        results[id] = { status: status, passed: passed };
                    });
                    if (Object.keys(results).length === 0) {
                        var body = document.body.innerText;
                        return JSON.stringify({ _raw: body.substring(0, 2000) });
                    }
                    return JSON.stringify(results);
                })()
            "#
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let results_str = get_data(&resp)["result"].as_str().unwrap_or("{}");
    eprintln!("[patchright-rebrowser] Results: {}", results_str);

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}

/// Patchright: ttlns.github.io/brotector — tests CDP leaks and automation signatures.
/// This is specifically important for Patchright as it tests CDP leak patterns.
#[tokio::test]
#[ignore]
async fn e2e_patchright_bot_detection_brotector() {
    let mut state = DaemonState::new();

    let resp = execute_command(&patchright_launch_cmd(), &mut state).await;
    assert_success(&resp);

    let resp = execute_command(
        &json!({ "id": "2", "action": "navigate", "url": "https://ttlns.github.io/brotector/" }),
        &mut state,
    )
    .await;
    assert_success(&resp);

    // Brotector runs async detection tests - give it time
    execute_command(
        &json!({ "id": "3", "action": "evaluate", "script": "new Promise(r => setTimeout(r, 10000))" }),
        &mut state,
    )
    .await;

    // Take screenshot for visual verification
    let screenshot_path = std::env::temp_dir()
        .join("patchright-brotector.png")
        .to_string_lossy()
        .to_string();
    let resp = execute_command(
        &json!({ "id": "4", "action": "screenshot", "path": screenshot_path }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    eprintln!("[patchright-brotector] Screenshot saved: {}", screenshot_path);

    // Check navigator.webdriver is undefined
    let resp = execute_command(
        &json!({ "id": "5", "action": "evaluate", "script": "navigator.webdriver" }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let webdriver_val = &get_data(&resp)["result"];
    eprintln!("[patchright-brotector] navigator.webdriver = {:?}", webdriver_val);

    // Extract test results
    let resp = execute_command(
        &json!({
            "id": "6",
            "action": "evaluate",
            "script": r#"
                (function() {
                    var results = { tests: [], summary: {} };
                    document.querySelectorAll('[class*=test], [class*=check], tr, li').forEach(function(el) {
                        var text = el.textContent.trim();
                        if (text.length > 3 && text.length < 300) {
                            var passed = el.classList.contains('pass') || el.classList.contains('ok') ||
                                         text.includes('✓') || text.toLowerCase().includes('pass');
                            var failed = el.classList.contains('fail') || el.classList.contains('error') ||
                                         text.includes('✗') || text.toLowerCase().includes('fail');
                            results.tests.push({ text: text, passed: passed, failed: failed });
                        }
                    });
                    var statusEl = document.querySelector('[class*=status], [class*=result], [class*=score]');
                    results.summary.status = statusEl ? statusEl.textContent.trim() : 'not found';
                    results.summary.page_text = document.body.innerText.substring(0, 1500);
                    return JSON.stringify(results);
                })()
            "#
        }),
        &mut state,
    )
    .await;
    assert_success(&resp);
    let results_str = get_data(&resp)["result"].as_str().unwrap_or("{}");

    if let Ok(results) = serde_json::from_str::<Value>(results_str) {
        eprintln!("[patchright-brotector] Status: {}", results["summary"]["status"]);
        if let Some(tests) = results["tests"].as_array() {
            let passed_count = tests.iter().filter(|t| t["passed"].as_bool() == Some(true)).count();
            let failed_count = tests.iter().filter(|t| t["failed"].as_bool() == Some(true)).count();
            eprintln!("[patchright-brotector] Tests: {} passed, {} failed, {} total",
                      passed_count, failed_count, tests.len());
            for t in tests.iter().filter(|t| t["failed"].as_bool() == Some(true)).take(10) {
                eprintln!("[patchright-brotector]   FAIL: {}", t["text"].as_str().unwrap_or(""));
            }
        }
    } else {
        eprintln!("[patchright-brotector] Raw results: {}", &results_str[..results_str.len().min(2000)]);
    }

    let resp = execute_command(&json!({ "id": "99", "action": "close" }), &mut state).await;
    assert_success(&resp);
}
