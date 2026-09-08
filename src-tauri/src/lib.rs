//! Punto de entrada del editor de texto de VasakOS.
//!
//! Lo que hay acá no es decoración: cada pieza resuelve algo que en las
//! aplicaciones reales del escritorio se rompió al menos una vez.

mod comandos;
mod documento;
mod locales;

use tauri::{Emitter, Manager};

/// Con qué nombre se le pide al escritorio traer la ventana al frente.
const APP_ID: &str = "vasak-text";

/// El evento con el que la segunda invocación le pasa sus archivos a la primera.
const EVENTO_ABRIR: &str = "abrir-rutas";

/// Le pide al escritorio que ponga esta ventana adelante.
///
/// En Wayland un cliente **no puede** traerse solo al frente: el protocolo no lo
/// permite, y `set_focus` no hace nada. Sin esto, abrir un archivo con el editor
/// ya abierto agregaba la pestaña en una ventana que seguía detrás de la
/// terminal desde donde se lo llamó, y parecía que no había pasado nada.
///
/// Es el mismo mensaje que usa `vasak-settings`.
async fn pedir_al_frente() {
    let conexion = match zbus::Connection::session().await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[vasak-text] sin bus de sesión para pedir el frente: {e}");
            return;
        }
    };

    let mensaje = zbus::message::Message::method("/org/vasak/os/Desktop", "PresentApp")
        .and_then(|b| b.destination("org.vasak.os.Desktop"))
        .and_then(|b| b.interface("org.vasak.os.Desktop"))
        .and_then(|b| b.with_flags(zbus::message::Flags::NoReplyExpected))
        // Y sin arrancar el escritorio si no está: abrir un archivo de texto no
        // tiene por qué encenderlo. `NoReplyExpected` no evita esa activación,
        // hace falta decirlo aparte.
        .and_then(|b| b.with_flags(zbus::message::Flags::NoAutoStart))
        .and_then(|b| b.build(&(APP_ID,)));

    match mensaje {
        Ok(mensaje) => {
            if let Err(e) = conexion.send(&mensaje).await {
                eprintln!("[vasak-text] no se pudo pedir traer la ventana al frente: {e}");
            }
        }
        Err(e) => eprintln!("[vasak-text] no se pudo armar el pedido de traer al frente: {e}"),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // El diario del sistema, con el nombre de esta aplicación. Va **primero**
        // de todos los plugins: instala el gancho de pánico, y un pánico mientras
        // arranca otro plugin es de los más probables y de los que menos rastro
        // dejan — sin esto, sólo queda un volcado de núcleo sin símbolos.
        .plugin(tauri_plugin_vsk_journal::init())
        // Una sola ventana. `vasak-text notas.md` con el editor ya abierto —que
        // es lo que hace el «abrir con» del gestor de archivos— entra como
        // pestaña nueva en lugar de levantar un segundo WebKit de ~150 MB con
        // otra copia del mismo archivo abierta al lado.
        //
        // Va después del diario aunque la documentación del plugin sugiera
        // registrarlo primero: lo que se gana adelantándolo —que el segundo
        // proceso salga unos milisegundos más temprano— no compensa perder el
        // rastro de un pánico ocurrido justo ahí.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let Some(ventana) = app.get_webview_window("main") else {
                return;
            };

            // Primero al frente: aunque no venga ninguna ruta, alguien pidió
            // abrir el editor y tiene que verlo.
            let _ = ventana.unminimize();
            let _ = ventana.show();
            let _ = ventana.set_focus();
            tauri::async_runtime::spawn(pedir_al_frente());

            let rutas = comandos::rutas_de(argv.into_iter().skip(1));
            if !rutas.is_empty() {
                let _ = ventana.emit(EVENTO_ABRIR, rutas);
            }
        }))
        // El idioma de la sesión. **Con la ruta explícita de los catálogos**:
        // el plugin sólo prueba rutas relativas al ejecutable y al directorio
        // de trabajo, y ninguna existe cuando el binario está en /usr/bin. Sin
        // esto, un paquete instalado muestra las claves crudas
        // («views.home.title») en lugar de los textos. Ver `locales.rs`.
        .plugin(tauri_plugin_i18n_vsk::init_with_path(
            Some(locales::idioma_del_sistema()),
            locales::directorio(),
        ))
        // El clic derecho abre el menú de VasakOS y no el del motor del
        // navegador, que ofrece «Recargar» e «Inspeccionar elemento».
        .plugin(tauri_plugin_vsk_contextual_menu::init())
        .plugin(tauri_plugin_config_manager::init())
        .plugin(tauri_plugin_vicons::init())
        .plugin(tauri_plugin_shell::init())
        // El selector de archivos. Ver el encabezado de `comandos.rs`: devuelve
        // una ruta, no permisos.
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            comandos::abrir_documento,
            comandos::guardar_documento,
            comandos::existe,
            comandos::rutas_de_apertura,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación");
}
