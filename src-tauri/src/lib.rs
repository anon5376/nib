mod files;
mod run;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(run::Runs::default())
        .invoke_handler(tauri::generate_handler![
            run::run_code,
            run::send_input,
            run::stop_run,
            run::python_version,
            files::folder_default,
            files::folder_pick,
            files::folder_list,
            files::file_read,
            files::file_write,
            files::entry_create,
            files::entry_rename,
            files::entry_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running Nib");
}
