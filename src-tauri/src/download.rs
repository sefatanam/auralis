use std::collections::HashSet;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
pub struct ToolStatus {
    yt_dlp: bool,
    ffmpeg: bool,
    brew: bool,
    /// "macos" | "windows" | "linux" | ...
    os: String,
}

#[derive(Serialize, Clone)]
struct Progress {
    percent: f64,
    message: String,
}

#[derive(Serialize)]
pub struct DownloadedFile {
    path: String,
    name: String,
}

#[derive(Serialize)]
pub struct PlaylistEntry {
    id: String,
    title: String,
    url: String,
}

/// Resolve a binary to an absolute path via a login shell, so it works even
/// when a bundled macOS app is launched with a stripped PATH (no /opt/homebrew).
fn resolve_bin(name: &str) -> Option<String> {
    if cfg!(windows) {
        let out = Command::new("where").arg(name).output().ok()?;
        if !out.status.success() {
            return None;
        }
        let path = String::from_utf8_lossy(&out.stdout);
        return path.lines().next().map(|s| s.trim().to_string());
    }
    let out = Command::new("bash")
        .arg("-lc")
        .arg(format!("command -v {name}"))
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

#[tauri::command]
pub fn check_tools() -> ToolStatus {
    ToolStatus {
        yt_dlp: resolve_bin("yt-dlp").is_some(),
        ffmpeg: resolve_bin("ffmpeg").is_some(),
        brew: resolve_bin("brew").is_some(),
        os: std::env::consts::OS.to_string(),
    }
}

/// File holding the user's chosen download folder (one line). Absent = default.
fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("download_dir.txt"))
}

/// The folder downloads are saved to: the user's chosen folder if set, else
/// the default `<audio dir>/ngmusic`.
fn target_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(saved) = std::fs::read_to_string(config_path(app)?) {
        let saved = saved.trim();
        if !saved.is_empty() {
            return Ok(PathBuf::from(saved));
        }
    }
    Ok(app
        .path()
        .audio_dir()
        .map_err(|e| e.to_string())?
        .join("ngmusic"))
}

#[tauri::command]
pub fn download_dir(app: AppHandle) -> Result<String, String> {
    Ok(target_dir(&app)?.to_string_lossy().to_string())
}

/// Open a native folder picker; on selection persist it as the download dir and
/// return the new path. Returns `None` if the user cancels.
#[tauri::command]
pub async fn pick_download_dir(app: AppHandle) -> Result<Option<String>, String> {
    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;

    let Some(folder) = picked else {
        return Ok(None);
    };
    let path = folder.to_string();
    std::fs::write(config_path(&app)?, &path).map_err(|e| e.to_string())?;
    Ok(Some(download_dir(app)?))
}

/// Parse a yt-dlp `[download]  42.3% ...` line into a percent.
fn parse_percent(line: &str) -> Option<f64> {
    if !line.contains("[download]") {
        return None;
    }
    line.split_whitespace()
        .find(|t| t.ends_with('%'))
        .and_then(|t| t.trim_end_matches('%').parse::<f64>().ok())
}

/// List the entries of a playlist (or the single video) at `url` without
/// downloading, so the UI can offer a selection dialog. `--flat-playlist`
/// keeps this fast — it doesn't resolve each video's formats.
#[tauri::command]
pub async fn probe_url(url: String) -> Result<Vec<PlaylistEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || probe_blocking(url))
        .await
        .map_err(|e| e.to_string())?
}

fn probe_blocking(url: String) -> Result<Vec<PlaylistEntry>, String> {
    let yt_dlp = resolve_bin("yt-dlp").ok_or("yt-dlp is not installed")?;
    let out = Command::new(&yt_dlp)
        .args([
            "--flat-playlist",
            "--no-warnings",
            "--print",
            "%(id)s\t%(title)s\t%(url)s",
            "--extractor-args",
            "youtube:player_client=web_safari,default",
        ])
        .arg(&url)
        .output()
        .map_err(|e| format!("failed to start yt-dlp: {e}"))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(err.lines().last().unwrap_or("yt-dlp failed").to_string());
    }

    let text = String::from_utf8_lossy(&out.stdout);
    Ok(text.lines().filter_map(parse_entry).collect())
}

/// Parse one `id\ttitle\turl` line from yt-dlp `--print`.
fn parse_entry(line: &str) -> Option<PlaylistEntry> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let mut parts = line.splitn(3, '\t');
    let id = parts.next()?.to_string();
    let title = parts.next().unwrap_or("").to_string();
    let url = parts.next().unwrap_or("").to_string();
    if url.is_empty() || url == "NA" {
        return None;
    }
    Some(PlaylistEntry { id, title, url })
}

/// Download audio (single track or full playlist) from `url` using yt-dlp.
/// Async so the blocking work runs off the main thread — otherwise progress
/// events wouldn't reach the UI until the whole download finished.
#[tauri::command]
pub async fn download_audio(app: AppHandle, url: String) -> Result<Vec<DownloadedFile>, String> {
    tauri::async_runtime::spawn_blocking(move || download_blocking(app, url))
        .await
        .map_err(|e| e.to_string())?
}

fn download_blocking(app: AppHandle, url: String) -> Result<Vec<DownloadedFile>, String> {
    let yt_dlp = resolve_bin("yt-dlp").ok_or("yt-dlp is not installed")?;
    if resolve_bin("ffmpeg").is_none() {
        return Err("ffmpeg is not installed".into());
    }

    let dir = target_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // yt-dlp writes the final path of every produced file here (after post-
    // processing). Reliable for playlists and re-downloads, where a folder diff
    // would miss files that already existed.
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let list_path = std::env::temp_dir().join(format!("ngmusic-{nanos}.txt"));
    let output_template = dir.join("%(title)s.%(ext)s");

    let mut child = Command::new(&yt_dlp)
        .args([
            "-x",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "192",
            "--newline",
            // Playlists route through the selection dialog and download one
            // entry at a time, so every download_audio call is one track.
            "--no-playlist",
            "--retries",
            "3",
            // ponytail: YouTube 403s the default (android) client; web_safari
            // currently works. If downloads start 403ing again, update yt-dlp
            // or try another client here (tv, ios, mweb).
            "--extractor-args",
            "youtube:player_client=web_safari,default",
            "--print-to-file",
            "after_move:filepath",
        ])
        .arg(&list_path)
        .arg("-o")
        .arg(&output_template)
        .arg(&url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("failed to start yt-dlp: {e}"))?;

    let stdout = child.stdout.take().ok_or("no stdout from yt-dlp")?;
    for line in BufReader::new(stdout).lines().map_while(Result::ok) {
        let percent = parse_percent(&line).unwrap_or(-1.0);
        let _ = app.emit(
            "download-progress",
            Progress {
                percent,
                message: line,
            },
        );
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() {
        let mut err = String::new();
        if let Some(mut se) = child.stderr.take() {
            use std::io::Read;
            let _ = se.read_to_string(&mut err);
        }
        let _ = std::fs::remove_file(&list_path);
        let msg = err.lines().last().unwrap_or("yt-dlp failed").to_string();
        return Err(msg);
    }

    let listed = std::fs::read_to_string(&list_path).unwrap_or_default();
    let _ = std::fs::remove_file(&list_path);

    let mut seen = HashSet::new();
    let mut files: Vec<DownloadedFile> = listed
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && seen.insert(l.to_string()))
        .map(|p| {
            let path = PathBuf::from(p);
            DownloadedFile {
                name: path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string(),
                path: p.to_string(),
            }
        })
        .collect();
    files.sort_by(|a, b| a.name.cmp(&b.name));

    if files.is_empty() {
        return Err("Download finished but no audio file was produced".into());
    }
    Ok(files)
}

/// Read a downloaded file's bytes so the renderer can wrap it in a File and
/// hand it to the existing library import pipeline. Returned as a raw
/// ArrayBuffer (not a JSON number array) for efficient transfer.
#[tauri::command]
pub fn read_file(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// One-click install of yt-dlp + ffmpeg via Homebrew, streaming `install-log`
/// lines to the UI.
#[tauri::command]
pub fn install_tools(app: AppHandle) -> Result<(), String> {
    let brew = resolve_bin("brew").ok_or("Homebrew is not installed. See https://brew.sh")?;
    let mut child = Command::new(&brew)
        .args(["install", "yt-dlp", "ffmpeg"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = app.emit("install-log", line);
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("brew install failed".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_download_percent() {
        assert_eq!(parse_percent("[download]  42.3% of 5.00MiB"), Some(42.3));
        assert_eq!(parse_percent("[download] 100% of 5.00MiB"), Some(100.0));
        assert_eq!(parse_percent("[download] 0.0% of ~5MiB at 1MiB/s"), Some(0.0));
    }

    #[test]
    fn ignores_non_progress_lines() {
        assert_eq!(parse_percent("[youtube] Extracting URL"), None);
        assert_eq!(parse_percent("[ExtractAudio] Destination: song.mp3"), None);
    }

    #[test]
    fn parses_playlist_entry() {
        let e = parse_entry("dQw4\tNever Gonna Give You Up\thttps://youtu.be/dQw4").unwrap();
        assert_eq!(e.id, "dQw4");
        assert_eq!(e.title, "Never Gonna Give You Up");
        assert_eq!(e.url, "https://youtu.be/dQw4");
        assert!(parse_entry("").is_none());
        assert!(parse_entry("id\tOnly Title\tNA").is_none());
    }
}
