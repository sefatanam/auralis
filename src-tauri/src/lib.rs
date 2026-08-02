mod download;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      download::check_tools,
      download::download_dir,
      download::list_downloads,
      download::pick_download_dir,
      download::probe_url,
      download::download_audio,
      download::read_file,
      download::install_tools,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
