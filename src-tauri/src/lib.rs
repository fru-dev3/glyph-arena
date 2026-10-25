// Glyph Arena's native shell. It holds no Arena logic: every command runs the bundled
// arena-engine sidecar (built from glyph-engine, src/arena) and hands back its JSON.
// The shell adds three things a sidecar cannot do for itself: a PATH that finds the
// agent CLIs from a Finder launch, provider keys from the macOS Keychain (shared with
// Glyph Studio), and the user's choice of vault.

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, BufReader};

/// Keychain service Glyph Studio stores provider keys under; reusing it means a key
/// entered in either app works in both.
const KEY_SERVICE: &str = "prevail.providers";
const PROVIDERS: &[(&str, &str)] = &[
    ("openrouter", "PREVAIL_OPENROUTER_KEY"),
    ("anthropic", "PREVAIL_ANTHROPIC_KEY"),
    ("openai", "PREVAIL_OPENAI_KEY"),
    ("google", "PREVAIL_GOOGLE_KEY"),
    ("xai", "PREVAIL_XAI_KEY"),
    ("deepseek", "PREVAIL_DEEPSEEK_KEY"),
    ("kimi", "PREVAIL_KIMI_KEY"),
];
/// The sidecar commands the UI may run. Anything else is refused.
const COMMANDS: &[&str] = &[
    "where", "status", "recipes", "tasks", "replay", "duel", "pick", "flag", "adverse", "signal", "signals",
    "policy", "league", "duels", "config", "sentinel", "scout",
];

static KEYS: Mutex<Option<Vec<(String, String)>>> = Mutex::new(None);

fn security(args: &[&str]) -> Option<std::process::Output> {
    std::process::Command::new("/usr/bin/security").args(args).output().ok()
}

fn load_keys() -> Vec<(String, String)> {
    let handles: Vec<_> = PROVIDERS
        .iter()
        .map(|(id, env)| {
            std::thread::spawn(move || {
                let out = security(&["find-generic-password", "-w", "-s", KEY_SERVICE, "-a", id])?;
                let k = String::from_utf8_lossy(&out.stdout).trim().to_string();
                (out.status.success() && !k.is_empty()).then(|| (env.to_string(), k))
            })
        })
        .collect();
    handles.into_iter().filter_map(|h| h.join().ok().flatten()).collect()
}

fn keys() -> Vec<(String, String)> {
    let mut g = KEYS.lock().unwrap();
    if g.is_none() {
        *g = Some(load_keys());
    }
    g.clone().unwrap_or_default()
}

fn app_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join("Library/Application Support/dev.fru.glyph.arena")
}

/// A vault chosen in this app wins; otherwise the sidecar finds the vault Glyph
/// Studio uses.
fn chosen_vault() -> Option<String> {
    let p = std::fs::read_to_string(app_dir().join("vault.txt")).ok()?;
    let p = p.trim().to_string();
    (!p.is_empty() && std::path::Path::new(&p).is_dir()).then_some(p)
}

fn sidecar() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    let dir = exe.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let bundled = dir.join("arena-engine");
    if bundled.exists() {
        return bundled;
    }
    // `tauri dev`: the binary sits in src-tauri/binaries with its target triple.
    let triple = if cfg!(target_arch = "aarch64") { "aarch64-apple-darwin" } else { "x86_64-apple-darwin" };
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("binaries/arena-engine-{triple}"))
}

fn command(args: &[String]) -> Result<tokio::process::Command, String> {
    let first = args.first().map(String::as_str).unwrap_or("status");
    if !COMMANDS.contains(&first) {
        return Err(format!("unknown arena command: {first}"));
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let path = format!(
        "{home}/.local/bin:{home}/.bun/bin:{home}/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:{}",
        std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".into())
    );
    let user = std::env::var("USER").ok().filter(|u| !u.is_empty()).unwrap_or_else(|| {
        PathBuf::from(&home).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
    });
    let mut cmd = tokio::process::Command::new(sidecar());
    cmd.args(args)
        .env("PATH", path)
        .env("USER", &user)
        .env("LOGNAME", &user)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    if let Some(v) = chosen_vault() {
        cmd.env("PREVAIL_VAULT", v);
    }
    for (k, v) in keys() {
        cmd.env(k, v);
    }
    Ok(cmd)
}

fn last_json(stdout: &str) -> Result<serde_json::Value, String> {
    let line = stdout.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("null");
    serde_json::from_str(line).map_err(|e| format!("arena-engine gave no JSON ({e}): {}", line.chars().take(200).collect::<String>()))
}

#[tauri::command]
async fn arena(args: Vec<String>) -> Result<serde_json::Value, String> {
    let out = command(&args)?.output().await.map_err(|e| format!("could not start arena-engine: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    match last_json(&stdout) {
        Ok(v) => Ok(v),
        Err(e) => Err(format!("{e}\n{}", String::from_utf8_lossy(&out.stderr).chars().take(400).collect::<String>())),
    }
}

/// Long commands (replay, sentinel): every stdout line goes to the UI as it arrives;
/// the last line (the result) is also the return value.
#[tauri::command]
async fn arena_stream(args: Vec<String>, on_line: Channel<String>) -> Result<serde_json::Value, String> {
    let mut child = command(&args)?.spawn().map_err(|e| format!("could not start arena-engine: {e}"))?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut lines = BufReader::new(stdout).lines();
    let mut last = String::new();
    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() {
            continue;
        }
        let _ = on_line.send(line.clone());
        last = line;
    }
    let _ = child.wait().await;
    last_json(&last)
}

#[tauri::command]
fn provider_keys() -> serde_json::Value {
    *KEYS.lock().unwrap() = None;
    let have: Vec<String> = keys().into_iter().map(|(env, _)| env).collect();
    let map: serde_json::Map<String, serde_json::Value> = PROVIDERS
        .iter()
        .map(|(id, env)| (id.to_string(), serde_json::Value::Bool(have.iter().any(|h| h == env))))
        .collect();
    serde_json::Value::Object(map)
}

#[tauri::command]
fn set_provider_key(provider: String, key: String) -> Result<(), String> {
    if !PROVIDERS.iter().any(|(id, _)| *id == provider) {
        return Err("unknown provider".into());
    }
    let key = key.trim();
    if key.is_empty() || key.len() > 400 || key.chars().any(|c| c.is_control()) {
        return Err("that does not look like a key".into());
    }
    // -U updates an existing item. The key goes in as an argument to /usr/bin/security
    // (the Keychain tool), never into a file or a log.
    let out = security(&["add-generic-password", "-U", "-s", KEY_SERVICE, "-a", &provider, "-w", key]).ok_or("Keychain not available")?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    *KEYS.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
async fn vault_info() -> Result<serde_json::Value, String> {
    arena(vec!["where".into()]).await
}

#[tauri::command]
fn set_vault(path: String) -> Result<(), String> {
    if !std::path::Path::new(&path).is_dir() {
        return Err("not a folder".into());
    }
    std::fs::create_dir_all(app_dir()).map_err(|e| e.to_string())?;
    std::fs::write(app_dir().join("vault.txt"), path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![arena, arena_stream, provider_keys, set_provider_key, vault_info, set_vault])
        .run(tauri::generate_context!())
        .expect("error while running Glyph Arena");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_unknown_commands() {
        assert!(command(&["status".into()]).is_ok());
        assert!(command(&["rm".into(), "-rf".into()]).is_err());
    }

    #[test]
    fn last_json_takes_the_final_line() {
        let v = last_json("{\"event\":\"progress\"}\n{\"event\":\"done\",\"result\":1}\n").unwrap();
        assert_eq!(v["result"], 1);
        assert!(last_json("not json").is_err());
    }
}
