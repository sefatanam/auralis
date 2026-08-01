use std::collections::HashSet;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const AUDIO_EXTS: [&str; 6] = ["mp3", "m4a", "flac", "wav", "aac", "ogg"];

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

/// The folder downloads are saved to: `<audio dir>/ngmusic`.
fn target_dir(app: &AppHandle) -> Result<PathBuf, String> {
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

fn is_audio(path: &PathBuf) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Snapshot of audio file names currently in `dir`.
fn snapshot(dir: &PathBuf) -> HashSet<PathBuf> {
    std::fs::read_dir(dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok().map(|e| e.path()))
                .filter(is_audio)
                .collect()
        })
        .unwrap_or_default()
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

/// Download audio (single track or full playlist) from `url` using yt-dlp into
/// an app-managed folder. Streams `download-progress` events and returns the
/// newly created audio files. Runs on Tauri's blocking command thread pool.
#[tauri::command]
pub fn download_audio(app: AppHandle, url: String) -> Result<Vec<DownloadedFile>, String> {
    let yt_dlp = resolve_bin("yt-dlp").ok_or("yt-dlp is not installed")?;
    if resolve_bin("ffmpeg").is_none() {
        return Err("ffmpeg is not installed".into());
    }

    let dir = target_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let before = snapshot(&dir);
    let output_template = dir.join("%(title)s.%(ext)s");

    let mut child = Command::new(&yt_dlp)
        .args([
            "-x",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "192",
            "--newline",
            "--no-playlist-reverse",
            "--retries",
            "3",
            // ponytail: YouTube 403s the default (android) client; web_safari
            // currently works. If downloads start 403ing again, update yt-dlp
            // or try another client here (tv, ios, mweb).
            "--extractor-args",
            "youtube:player_client=web_safari,default",
            "-o",
        ])
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
        let msg = err.lines().last().unwrap_or("yt-dlp failed").to_string();
        return Err(msg);
    }

    let after = snapshot(&dir);
    let mut files: Vec<DownloadedFile> = after
        .difference(&before)
        .map(|p| DownloadedFile {
            name: p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string(),
            path: p.to_string_lossy().to_string(),
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
    fn detects_audio_by_extension() {
        assert!(is_audio(&PathBuf::from("a/b/song.mp3")));
        assert!(is_audio(&PathBuf::from("song.M4A")));
        assert!(!is_audio(&PathBuf::from("cover.jpg")));
        assert!(!is_audio(&PathBuf::from("noext")));
    }
}
