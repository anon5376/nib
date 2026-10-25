mod run;

pub fn run() {
    tauri::Builder::default()
        .manage(run::Runs::default())
        .invoke_handler(tauri::generate_handler![
            run::run_code,
            run::send_input,
            run::stop_run,
            run::python_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
