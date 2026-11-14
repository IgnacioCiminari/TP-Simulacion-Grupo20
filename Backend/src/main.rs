//! Servidor HTTP (equivalente a `uvicorn api:app --host 0.0.0.0 --port 8000`).
//!
//! Variables de entorno opcionales: `HOST` (default 0.0.0.0) y `PORT` (default 8000).

#[tokio::main]
async fn main() {
    let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8000);

    let listener = tokio::net::TcpListener::bind((host.as_str(), port))
        .await
        .unwrap_or_else(|e| panic!("No se pudo escuchar en {host}:{port}: {e}"));

    println!("API de Simulación RTV (Rust) escuchando en http://{host}:{port}");

    axum::serve(listener, rtv_backend::api::router())
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Error en el servidor HTTP");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut s) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
