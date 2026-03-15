//! Patchright Adapter Module
//!
//! This module provides a Rust client for communicating with the Node.js Patchright adapter
//! via JSON-RPC 2.0 over stdin/stdout. It spawns the adapter as a subprocess and manages
//! the lifecycle of browser automation commands through the anti-detection Patchright library.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex;

// ---------------------------------------------------------------------------
// JSON-RPC Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    id: u64,
    method: String,
    params: Value,
}

#[derive(Debug, Clone, Deserialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: u64,
    #[serde(default)]
    result: Option<Value>,
    #[serde(default)]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(default)]
    pub data: Option<Value>,
}

impl std::fmt::Display for JsonRpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

// Error codes from contracts/json-rpc.md
#[allow(dead_code)]
pub mod error_codes {
    pub const PARSE_ERROR: i32 = -32700;
    pub const INVALID_REQUEST: i32 = -32600;
    pub const METHOD_NOT_FOUND: i32 = -32601;
    pub const INVALID_PARAMS: i32 = -32602;
    pub const INTERNAL_ERROR: i32 = -32603;
    pub const ELEMENT_NOT_FOUND: i32 = -32000;
    pub const NAVIGATION_FAILED: i32 = -32001;
    pub const TIMEOUT: i32 = -32002;
    pub const BROWSER_CRASHED: i32 = -32003;
    pub const SESSION_NOT_STARTED: i32 = -32004;
}

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct LaunchResult {
    #[serde(rename = "sessionId")]
    pub session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NavigateResult {
    pub url: String,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActionResult {
    pub success: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ScreenshotResult {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub base64: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SnapshotResult {
    pub tree: String,
    pub refs: HashMap<String, ElementRef>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ElementRef {
    pub role: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EvaluateResult {
    pub result: Value,
}

// ---------------------------------------------------------------------------
// Adapter Process Management
// ---------------------------------------------------------------------------

/// Inner state for the adapter process - not thread safe on its own
struct AdapterProcessInner {
    child: Child,
    stdin: std::process::ChildStdin,
    stdout_reader: BufReader<std::process::ChildStdout>,
}

/// Thread-safe wrapper for the adapter process
struct AdapterProcess {
    inner: Mutex<Option<AdapterProcessInner>>,
}

impl AdapterProcess {
    fn new(mut child: Child) -> Result<Self, String> {
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Failed to capture adapter stdin".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture adapter stdout".to_string())?;
        let stdout_reader = BufReader::new(stdout);

        Ok(Self {
            inner: Mutex::new(Some(AdapterProcessInner {
                child,
                stdin,
                stdout_reader,
            })),
        })
    }

    /// Send a JSON-RPC request and wait for the response
    async fn send_request(&self, request: &JsonRpcRequest) -> Result<JsonRpcResponse, String> {
        let mut guard = self.inner.lock().await;
        let inner = guard
            .as_mut()
            .ok_or_else(|| "Adapter process not running".to_string())?;

        // Serialize request to JSON line
        let mut request_line =
            serde_json::to_string(request).map_err(|e| format!("Failed to serialize request: {}", e))?;
        request_line.push('\n');

        // Write to stdin
        inner
            .stdin
            .write_all(request_line.as_bytes())
            .map_err(|e| format!("Failed to write to adapter stdin: {}", e))?;
        inner
            .stdin
            .flush()
            .map_err(|e| format!("Failed to flush adapter stdin: {}", e))?;

        // Read response line from stdout
        let mut response_line = String::new();
        inner
            .stdout_reader
            .read_line(&mut response_line)
            .map_err(|e| format!("Failed to read from adapter stdout: {}", e))?;

        if response_line.is_empty() {
            return Err("Adapter process closed unexpectedly".to_string());
        }

        // Parse response
        let response: JsonRpcResponse = serde_json::from_str(&response_line)
            .map_err(|e| format!("Failed to parse adapter response: {} - raw: {}", e, response_line))?;

        Ok(response)
    }

    /// Kill the adapter process
    async fn kill(&self) -> Result<(), String> {
        let mut guard = self.inner.lock().await;
        if let Some(mut inner) = guard.take() {
            let _ = inner.child.kill();
            let _ = inner.child.wait();
        }
        Ok(())
    }

    /// Check if the process is still running
    async fn is_running(&self) -> bool {
        let mut guard = self.inner.lock().await;
        if let Some(inner) = guard.as_mut() {
            match inner.child.try_wait() {
                Ok(Some(_)) => false, // Process exited
                Ok(None) => true,     // Still running
                Err(_) => false,      // Error checking, assume dead
            }
        } else {
            false
        }
    }
}

// ---------------------------------------------------------------------------
// Patchright Adapter Client
// ---------------------------------------------------------------------------

/// Client for communicating with the Patchright adapter process.
/// This is the main interface for browser automation through Patchright.
pub struct PatchrightAdapter {
    process: Arc<AdapterProcess>,
    request_id: AtomicU64,
    session_id: Mutex<Option<String>>,
    adapter_path: PathBuf,
}

impl PatchrightAdapter {
    /// Find the patchright-adapter directory relative to the project
    fn find_adapter_path() -> Result<PathBuf, String> {
        // Check environment variable first
        if let Ok(path) = std::env::var("PATCHRIGHT_ADAPTER_PATH") {
            let p = PathBuf::from(path);
            if p.exists() {
                return Ok(p);
            }
        }

        // Try relative to the executable
        if let Ok(exe_path) = std::env::current_exe() {
            // Go up from banana-browser/cli/target/[debug|release]/agent-browser
            // to the agentgate root, then into patchright-adapter
            let mut path = exe_path;
            for _ in 0..5 {
                path = match path.parent() {
                    Some(p) => p.to_path_buf(),
                    None => break,
                };
                let adapter_js = path.join("patchright-adapter/dist/index.js");
                if adapter_js.exists() {
                    return Ok(path.join("patchright-adapter"));
                }
            }
        }

        // Try current working directory
        let cwd = std::env::current_dir().map_err(|e| format!("Failed to get cwd: {}", e))?;
        let adapter_path = cwd.join("patchright-adapter");
        if adapter_path.join("dist/index.js").exists() {
            return Ok(adapter_path);
        }

        // Try parent directories
        let mut path = cwd;
        for _ in 0..5 {
            path = match path.parent() {
                Some(p) => p.to_path_buf(),
                None => break,
            };
            let adapter_js = path.join("patchright-adapter/dist/index.js");
            if adapter_js.exists() {
                return Ok(path.join("patchright-adapter"));
            }
        }

        Err("Could not find patchright-adapter. Set PATCHRIGHT_ADAPTER_PATH or ensure dist/index.js exists.".to_string())
    }

    /// Spawn a new Patchright adapter process
    pub async fn spawn() -> Result<Self, String> {
        let adapter_path = Self::find_adapter_path()?;
        let index_js = adapter_path.join("dist/index.js");

        if !index_js.exists() {
            return Err(format!(
                "Patchright adapter not built. Run 'npm run build' in {}",
                adapter_path.display()
            ));
        }

        // Find node executable
        let node = std::env::var("NODE_PATH").unwrap_or_else(|_| "node".to_string());

        let child = Command::new(&node)
            .arg(&index_js)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit()) // Let stderr pass through for debugging
            .current_dir(&adapter_path)
            .spawn()
            .map_err(|e| format!("Failed to spawn patchright adapter: {}. Is Node.js installed?", e))?;

        let process = Arc::new(AdapterProcess::new(child)?);

        Ok(Self {
            process,
            request_id: AtomicU64::new(1),
            session_id: Mutex::new(None),
            adapter_path,
        })
    }

    /// Get the next request ID
    fn next_id(&self) -> u64 {
        self.request_id.fetch_add(1, Ordering::SeqCst)
    }

    /// Send a JSON-RPC command and parse the result
    async fn call<T: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        params: Value,
    ) -> Result<T, String> {
        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            id: self.next_id(),
            method: method.to_string(),
            params,
        };

        let response = self.process.send_request(&request).await?;

        if let Some(error) = response.error {
            return Err(error.to_string());
        }

        let result = response
            .result
            .ok_or_else(|| "Missing result in response".to_string())?;

        serde_json::from_value(result).map_err(|e| format!("Failed to parse result: {}", e))
    }

    /// Send a JSON-RPC command and return raw Value
    async fn call_raw(&self, method: &str, params: Value) -> Result<Value, String> {
        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            id: self.next_id(),
            method: method.to_string(),
            params,
        };

        let response = self.process.send_request(&request).await?;

        if let Some(error) = response.error {
            return Err(error.to_string());
        }

        response
            .result
            .ok_or_else(|| "Missing result in response".to_string())
    }

    // -----------------------------------------------------------------------
    // Browser Commands
    // -----------------------------------------------------------------------

    /// Launch a new browser session
    pub async fn launch(&self, headless: bool, args: Option<Vec<String>>) -> Result<LaunchResult, String> {
        let params = json!({
            "headless": headless,
            "args": args.unwrap_or_default()
        });

        let result: LaunchResult = self.call("launch", params).await?;

        // Store session ID
        let mut session = self.session_id.lock().await;
        *session = Some(result.session_id.clone());

        Ok(result)
    }

    /// Navigate to a URL
    pub async fn navigate(
        &self,
        url: &str,
        wait_until: Option<&str>,
    ) -> Result<NavigateResult, String> {
        let params = json!({
            "url": url,
            "waitUntil": wait_until.unwrap_or("load")
        });

        self.call("navigate", params).await
    }

    /// Click an element by selector
    pub async fn click(&self, selector: &str) -> Result<ActionResult, String> {
        let params = json!({
            "selector": selector
        });

        self.call("click", params).await
    }

    /// Fill an input field (clears first)
    pub async fn fill(&self, selector: &str, value: &str) -> Result<ActionResult, String> {
        let params = json!({
            "selector": selector,
            "value": value
        });

        self.call("fill", params).await
    }

    /// Type text into an element with key-by-key simulation
    pub async fn type_text(
        &self,
        selector: &str,
        text: &str,
        delay: Option<u32>,
    ) -> Result<ActionResult, String> {
        let params = json!({
            "selector": selector,
            "text": text,
            "delay": delay.unwrap_or(0)
        });

        self.call("type", params).await
    }

    /// Take a screenshot
    pub async fn screenshot(
        &self,
        path: Option<&str>,
        full_page: bool,
    ) -> Result<ScreenshotResult, String> {
        let params = json!({
            "path": path,
            "fullPage": full_page
        });

        self.call("screenshot", params).await
    }

    /// Get the accessibility tree snapshot
    pub async fn snapshot(&self, interesting_only: bool) -> Result<SnapshotResult, String> {
        let params = json!({
            "interestingOnly": interesting_only
        });

        self.call("snapshot", params).await
    }

    /// Execute JavaScript in the page context
    pub async fn evaluate(&self, expression: &str) -> Result<Value, String> {
        let params = json!({
            "expression": expression
        });

        let result: EvaluateResult = self.call("evaluate", params).await?;
        Ok(result.result)
    }

    /// Close the browser and end the session
    pub async fn close(&self) -> Result<ActionResult, String> {
        let result = self.call("close", json!({})).await;

        // Clear session ID
        let mut session = self.session_id.lock().await;
        *session = None;

        // Give the adapter a moment to clean up, then kill if needed
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        result
    }

    // -----------------------------------------------------------------------
    // Utility Methods
    // -----------------------------------------------------------------------

    /// Check if a browser session is active
    pub async fn has_session(&self) -> bool {
        self.session_id.lock().await.is_some()
    }

    /// Get the current session ID
    pub async fn get_session_id(&self) -> Option<String> {
        self.session_id.lock().await.clone()
    }

    /// Check if the adapter process is still running
    pub async fn is_alive(&self) -> bool {
        self.process.is_running().await
    }

    /// Get the adapter path
    pub fn adapter_path(&self) -> &PathBuf {
        &self.adapter_path
    }

    /// Forcefully kill the adapter process
    pub async fn kill(&self) -> Result<(), String> {
        self.process.kill().await
    }
}

impl Drop for PatchrightAdapter {
    fn drop(&mut self) {
        // Schedule async cleanup - best effort
        // The actual cleanup happens in close() which should be called explicitly
    }
}

// ---------------------------------------------------------------------------
// Cleanup helper for graceful shutdown
// ---------------------------------------------------------------------------

/// Ensure adapter cleanup on process exit
pub async fn cleanup_adapter(adapter: &PatchrightAdapter) {
    // Try graceful close first
    if adapter.has_session().await {
        let _ = adapter.close().await;
    }

    // Wait a bit for graceful shutdown
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

    // Force kill if still running
    if adapter.is_alive().await {
        let _ = adapter.kill().await;
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_json_rpc_request_serialization() {
        let request = JsonRpcRequest {
            jsonrpc: "2.0",
            id: 1,
            method: "navigate".to_string(),
            params: json!({"url": "https://example.com"}),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"jsonrpc\":\"2.0\""));
        assert!(json.contains("\"id\":1"));
        assert!(json.contains("\"method\":\"navigate\""));
    }

    #[test]
    fn test_json_rpc_response_deserialization() {
        let json = r#"{"jsonrpc":"2.0","id":1,"result":{"url":"https://example.com","title":"Example"}}"#;
        let response: JsonRpcResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.id, 1);
        assert!(response.result.is_some());
        assert!(response.error.is_none());
    }

    #[test]
    fn test_json_rpc_error_response() {
        let json = r#"{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"Element not found"}}"#;
        let response: JsonRpcResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.id, 1);
        assert!(response.result.is_none());
        assert!(response.error.is_some());
        let error = response.error.unwrap();
        assert_eq!(error.code, -32000);
        assert_eq!(error.message, "Element not found");
    }
}
